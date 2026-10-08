'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@autional/shared';
import { Alert, AppPageHeader, ErrorState } from '@autional/ui';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useTenant } from '@/hooks/use-tenant';
import {
	Crown,
	Zap,
	Building2,
	Check,
	Loader2,
	ArrowRight
} from 'lucide-react';
import {
	usePublicPlans,
	useSubscription,
	useSubscribe,
	type PublicPlanResponse,
} from '@/hooks/queries';

const CYCLE_DISCOUNT: Record<string, number> = {
	yearly: 0.8,
};

const planIcons: Record<string, React.ReactNode> = {
	free: <Zap className="w-8 h-8 text-neutral-500" />,
	// 套餐档位是**分类**不是状态（DESIGN.md §3：并列的分类走 chart-N）——
	// 原来 basic 用 info 语义令牌、pro 用 warning 语义令牌、enterprise 用紫色阶，三种语言混在一张表里。
	basic: <Zap className="w-8 h-8 text-chart-3" />,
	pro: <Crown className="w-8 h-8 text-chart-4" />,
	enterprise: <Building2 className="w-8 h-8 text-chart-7" />,
};

const planColors: Record<string, string> = {
	free: 'border-neutral-300',
	basic: 'border-chart-3',
	pro: 'border-chart-4',
	enterprise: 'border-chart-7',
};

const planActiveColors: Record<string, string> = {
	free: 'ring-neutral-300 bg-neutral-50',
	basic: 'ring-chart-3 bg-chart-3/10',
	pro: 'ring-chart-4 bg-chart-4/10',
	enterprise: 'ring-chart-7 bg-chart-7/10',
};

// UP-58：服务端 features 是语言包键原文（service-core lang_base 缺包/缺键时原样返回键、丢参数），
// 前端按键映射本地化文案；数值参数从响应 quotas 重建（丢参后的唯一来源）。未收录键透传。
const FEATURE_LOCALE_KEYS: Record<string, string> = {
	'billing.plans.feature.mfa_enabled': 'billing.plans.feature.mfaEnabled',
	'billing.plans.feature.sso_enabled': 'billing.plans.feature.ssoEnabled',
	'billing.plans.feature.max_users': 'billing.plans.feature.maxUsers',
	'billing.plans.feature.storage_gb': 'billing.plans.feature.storageGb',
	'billing.plans.feature.api_calls': 'billing.plans.feature.apiCalls',
	'billing.plans.feature.audit_log_days': 'billing.plans.feature.auditLogDays',
	'billing.plans.support.community': 'billing.plans.feature.supportCommunity',
	'billing.plans.support.basic': 'billing.plans.feature.supportBasic',
	'billing.plans.support.priority': 'billing.plans.feature.supportPriority',
	'billing.plans.support.dedicated': 'billing.plans.feature.supportDedicated',
};

export default function SubscribePage() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const { currentTenantId } = useTenant();
	const tenantId = currentTenantId || '';
	const {
		data: plansData,
		isLoading: plansLoading,
		error: plansError,
		refetch: refetchPlans,
	} = usePublicPlans();
	const { data: currentSub } = useSubscription(tenantId);
	const subscribe = useSubscribe();

	const [selectedPlan, setSelectedPlan] = useState<PublicPlanResponse | null>(null);
	const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
	const [subscribeStatus, setSubscribeStatus] = useState<
		'idle' | 'submitting' | 'success' | 'error'
	>('idle');
	const [resultMsg, setResultMsg] = useState('');

	// UP-61：卡片按「月付价升序」显式排序（免费档在前）；同价保持服务端顺序（sort 稳定）。
	const plans = [...(plansData?.items || [])].sort(
		(a, b) => parseFloat(a.monthlyPrice || '0') - parseFloat(b.monthlyPrice || '0'),
	);

	const featureLabel = (f: string, quotas?: PublicPlanResponse['quotas']): string => {
		const key = FEATURE_LOCALE_KEYS[f];
		if (!key) return f;
		switch (f) {
			case 'billing.plans.feature.max_users':
				return t(key, { count: quotas?.maxUsers ?? 0 });
			case 'billing.plans.feature.storage_gb':
				return t(key, { size: quotas?.maxStorageGb ?? 0 });
			case 'billing.plans.feature.api_calls':
				return t(key, { count: quotas?.maxApiRequests ?? 0 });
			default:
				return t(key);
		}
	};

	const getCycleLabel = (cycle: string) => {
		const labels: Record<string, string> = {
			monthly: t('billing.subscribe.cycle.monthly'),
			yearly: t('billing.subscribe.cycle.yearly'),
		};
		return labels[cycle] || cycle;
	};

	const getPrice = (plan: PublicPlanResponse) => {
		const base = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
		const price = parseFloat(base || '0');
		if (billingCycle === 'yearly' && CYCLE_DISCOUNT.yearly) {
			return (price * CYCLE_DISCOUNT.yearly).toFixed(2);
		}
		return price.toFixed(2);
	};

	const getOriginalPrice = (plan: PublicPlanResponse) => {
		return parseFloat(plan.yearlyPrice || '0').toFixed(2);
	};

	const handleSubscribe = async () => {
		if (!selectedPlan) return;
		setSubscribeStatus('submitting');
		try {
			const res = await subscribe.mutateAsync({
				planId: selectedPlan.plan || selectedPlan.id,
				billingCycle,
				tenantId,
			});
			if (res.paymentUrl) {
				window.open(res.paymentUrl, '_blank');
			}
			setSubscribeStatus('success');
			setResultMsg(
				t('billing.subscribe.successMessage', {
					plan: selectedPlan.name || selectedPlan.plan,
					cycle: getCycleLabel(billingCycle),
				}),
			);
		} catch (e: unknown) {
			setSubscribeStatus('error');
			setResultMsg(e instanceof Error ? e.message : t('billing.subscribe.failedMessage'));
		}
	};

	if (plansLoading)
		return (
			<div className="max-w-4xl mx-auto space-y-6">
				<SkeletonCard />
				<SkeletonCard />
				<SkeletonCard />
			</div>
		);

	if (plansError)
		return (
			<ErrorState
				message={t('billing.subscribe.loadPlansError', '套餐列表加载失败')}
				onRetry={() => refetchPlans()}
			/>
		);

	const features = (plan: PublicPlanResponse): string[] => {
		if (Array.isArray(plan.features)) return plan.features;
		return [];
	};

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<AppPageHeader title={t('billing.subscribe.title')} description={t('billing.subscribe.subtitle')} />

			{currentSub?.plan && (
				<div className="text-center">
					<span className="inline-block px-4 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200">
						{t('billing.subscribe.currentPlan')}:{' '}
						{plans.find((p) => p.plan === currentSub.plan)?.name || currentSub.plan} (
						{currentSub.billingCycle === 'monthly'
							? getCycleLabel('monthly')
							: getCycleLabel('yearly')}
						)
					</span>
				</div>
			)}

			<div className="flex justify-center gap-2">
				<button
					onClick={() => setBillingCycle('monthly')}
					className={`px-4 py-2 rounded-l-lg border font-medium transition-colors ${
						billingCycle === 'monthly'
							? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
							: 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
					}`}
				>
					{t('billing.subscribe.monthly')}
				</button>
				<button
					onClick={() => setBillingCycle('yearly')}
					className={`px-4 py-2 rounded-r-lg border font-medium transition-colors ${
						billingCycle === 'yearly'
							? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
							: 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
					}`}
				>
					{t('billing.subscribe.yearly', { discount: '8' })}
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{plans.map((plan) => {
					const isCurrent = currentSub?.plan === plan.plan;
					const isSelected = selectedPlan?.plan === plan.plan;
					const price = getPrice(plan);
					const originalPrice = getOriginalPrice(plan);

					return (
						<div
							key={plan.id || plan.plan}
							className={`relative bg-white rounded-xl border-2 p-6 transition-all ${
								isSelected
									? `ring-2 ${planActiveColors[plan.plan] || 'ring-[var(--color-brand)] bg-primary-50'}`
									: planColors[plan.plan] || 'border-neutral-300'
							} hover:shadow-lg`}
						>
							{/* UP-60：整卡选择此前是 div[onClick] —— 无键盘可达、无选中态语义。
							    透明覆盖按钮承担指针+键盘交互（Enter/Space 可选卡）；卡内订阅按钮抬到 z-10 之上。 */}
							<button
								type="button"
								aria-pressed={isSelected}
								aria-label={plan.name || plan.plan}
								onClick={() => setSelectedPlan(plan)}
								className="absolute inset-0 cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand)]"
							/>
							{isCurrent && (
								<span className="pointer-events-none absolute -top-2.5 right-3 px-3 py-0.5 rounded-full bg-success text-white text-xs font-bold">
									{t('billing.subscribe.currentBadge')}
								</span>
							)}
							{plan.isPopular && (
								<span className="pointer-events-none absolute -top-2.5 left-3 px-3 py-0.5 rounded-full bg-[var(--color-brand)] text-white text-xs font-bold">
									{t('billing.subscribe.recommendedBadge')}
								</span>
							)}

							<div className="flex flex-col items-center text-center space-y-3">
								<div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200">
									{planIcons[plan.plan] || <Zap className="w-8 h-8 text-neutral-500" />}
								</div>
								<div>
									<h3 className="text-lg font-bold">{plan.name || plan.plan}</h3>
									<p className="text-sm text-neutral-600 mt-1">{plan.description}</p>
								</div>
								<div className="text-center">
									<span className="text-3xl font-bold">¥{price}</span>
									{/* UP-62：0 价套餐（Free）不参与折扣展示——「¥0.00 划线 + 8折」是纯噪音 */}
									{billingCycle === 'yearly' && parseFloat(originalPrice) > 0 && (
										<div>
											<span className="text-sm text-neutral-600 line-through">¥{originalPrice}</span>
											<span className="text-xs text-danger-text ml-1">
												{t('billing.subscribe.yearlyBadge')}
											</span>
										</div>
									)}
									<span className="text-sm text-neutral-600"> /{getCycleLabel(billingCycle)}</span>
								</div>

								<ul className="text-left space-y-2 w-full pt-2">
									{features(plan).map((f, i) => (
										<li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
											<Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
											{featureLabel(f, plan.quotas)}
										</li>
									))}
								</ul>

								{isSelected && !isCurrent && (
									<button
										onClick={() => handleSubscribe()}
										disabled={subscribeStatus === 'submitting'}
										className="relative z-10 w-full py-2.5 rounded-lg bg-[var(--color-brand)] text-white font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2"
									>
										{subscribeStatus === 'submitting' ? (
											<Loader2 className="w-4 h-4 animate-spin" />
										) : (
											<ArrowRight className="w-4 h-4" />
										)}
										{plan.plan === 'free'
											? t('billing.subscribe.chooseFree')
											: t('billing.subscribe.subscribe')}
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>

			{subscribeStatus === 'success' && (
				<Alert
					variant="success"
					className="max-w-md mx-auto"
				>
					<span className="font-medium">{resultMsg}</span>
				</Alert>
			)}

			{subscribeStatus === 'error' && (
				<Alert
					variant="danger"
					className="max-w-md mx-auto"
				>
					<span className="font-medium">{resultMsg}</span>
					<button
						onClick={() => setSubscribeStatus('idle')}
						className="ml-auto text-sm text-[var(--color-brand)] hover:underline"
					>
						{t('common.retry')}
					</button>
				</Alert>
			)}
		</div>
	);
}
