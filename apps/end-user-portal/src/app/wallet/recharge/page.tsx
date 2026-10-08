'use client';

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, useTenantSlug } from '@autional/shared';
import { paymentsByPayments } from '@autional/shared/generated/api';
import { Alert, SectionCard, AppPageHeader, LoadingScreen, ErrorState, EmptyState } from '@autional/ui';
import { FormInput } from '@autional/ui/rhf';
import { useTranslation } from 'react-i18next';
import { Wallet, CreditCard, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useWalletBalance, useRechargeWallet, useCreateWallet } from '@/hooks/queries';
import { buildNavHref } from '@/lib/nav';
import { ROUTES } from '@/lib/routes';
import { rechargeSchema, type RechargeFormData } from '@/lib/validators';
import { isWalletNotCreatedError } from '@/lib/api-error';

const PRESET_AMOUNTS = [100, 500, 1000];

export default function WalletRechargePage() {
	const tenantSlug = useTenantSlug();
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { user } = useAuth();
	const userId = user?.id || '';
	const {
		data: balance,
		isLoading: balanceLoading,
		error: balanceError,
		refetch: refetchBalance,
	} = useWalletBalance();
	const recharge = useRechargeWallet();
	// 开通钱包：成功后 hook 失效钱包查询 → useWalletBalance 自动重拉，充值表单可达。
	const createWallet = useCreateWallet();

	const channels = [
		{ code: 'wechat', label: t('wallet.recharge.channels.wechat'), icon: '💬' },
		{ code: 'alipay', label: t('wallet.recharge.channels.alipay'), icon: '🔵' },
	];

	const {
		control,
		handleSubmit,
		watch,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<RechargeFormData>({
		resolver: zodResolver(rechargeSchema),
		defaultValues: { amount: '100', customAmount: '' },
	});

	const watchedAmount = watch('amount');
	const watchedCustomAmount = watch('customAmount');

	const [channel, setChannel] = useState('wechat');
	const [polling, setPolling] = useState(false);
	const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
	const [resultKey, setResultKey] = useState<string>('');
	const [resultAmount, setResultAmount] = useState<string>('');

	const selectedAmount = watchedCustomAmount ? Number(watchedCustomAmount) : Number(watchedAmount);

	const onRecharge = async () => {
		setStatus('idle');
		try {
			const res = await recharge.mutateAsync({ userId, amount: selectedAmount, channel });
			if (res.paymentUrl) {
				window.open(res.paymentUrl, '_blank');
			}
			if (res.paymentId) {
				setPolling(true);
				pollPaymentStatus(res.paymentId);
			} else {
				setStatus('success');
				setResultKey('wallet.recharge.submitted');
			}
		} catch (e: unknown) {
			setStatus('error');
			setResultKey(e instanceof Error ? e.message : 'wallet.recharge.submitFailed');
		}
	};

	const pollPaymentStatus = async (paymentId: string) => {
		const maxAttempts = 30;
		for (let i = 0; i < maxAttempts; i++) {
			await new Promise((r) => setTimeout(r, 2000));
			try {
				const data = await paymentsByPayments(paymentId);
				if (data.status === 'completed' || data.status === 'paid') {
					setPolling(false);
					setStatus('success');
					setResultKey('wallet.recharge.success');
					setResultAmount(selectedAmount.toFixed(2));
					return;
				}
				if (data.status === 'failed' || data.status === 'cancelled') {
					setPolling(false);
					setStatus('error');
					setResultKey('wallet.recharge.failedOrCancelled');
					return;
				}
			} catch {
				// continue polling
			}
		}
		setPolling(false);
		setStatus('error');
		setResultKey('wallet.recharge.timeout');
	};

	if (balanceLoading) return <LoadingScreen message={t('wallet.loadingBalance', '正在加载钱包余额…')} />;

	if (balanceError) {
		// 404 细分：仅 61060101 走「空态 + 开通钱包 CTA」；其他 404/错误保持错误态。
		if (isWalletNotCreatedError(balanceError)) {
			return (
				<div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
					<EmptyState
						title={t('wallet.empty', '暂无钱包数据')}
						description={t('wallet.emptyDesc', '当前账户尚未开通钱包，开通后即可使用')}
					/>
					<div className="flex justify-center">
						<button
							type="button"
							onClick={() => userId && createWallet.mutate({ userId })}
							disabled={!userId || createWallet.isPending}
							className="rounded-lg bg-[var(--color-brand)] px-6 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							{createWallet.isPending
								? t('wallet.creatingWallet', '正在开通…')
								: t('wallet.createWallet', '开通钱包')}
						</button>
					</div>
				</div>
			);
		}
		return (
			<ErrorState
				message={t('wallet.loadBalanceError', '钱包余额加载失败')}
				onRetry={() => refetchBalance()}
			/>
		);
	}

	const currentBalance = parseFloat(
		balance?.balance || balance?.available || balance?.availableBalance || '0',
	);

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<AppPageHeader title={t('wallet.recharge.title')} />

			<SectionCard className="flex items-center gap-4">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
					<Wallet className="w-6 h-6 text-success" />
				</div>
				<div>
					<div className="text-sm text-neutral-600">{t('wallet.recharge.currentBalance')}</div>
					<div className="text-2xl font-bold text-success-text">¥{currentBalance.toFixed(2)}</div>
				</div>
			</SectionCard>

			<form
				onSubmit={handleSubmit(onRecharge)}
				className="bg-white rounded-lg border p-6 space-y-5"
			>
				<h2 className="text-lg font-semibold">{t('wallet.recharge.amount')}</h2>

				<div className="flex gap-3 flex-wrap">
					{PRESET_AMOUNTS.map((a) => (
						<button
							key={a}
							type="button"
							onClick={() => {
								setValue('amount', String(a));
								setValue('customAmount', '');
							}}
							className={`px-6 py-3 rounded-lg border text-lg font-semibold transition-colors ${
								Number(watchedAmount) === a && !watchedCustomAmount
									? 'border-[var(--color-brand)] bg-primary-50 text-[var(--color-brand)]'
									: 'border-neutral-300 hover:border-[var(--color-brand)]'
							}`}
						>
							¥{a}
						</button>
					))}
					<div className="relative">
						<span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600">¥</span>
						<FormInput<RechargeFormData>
							name="customAmount"
							control={control}
							type="number"
							placeholder={t('wallet.recharge.custom')}
							// 原来挂在 register 上的 onChange 是「改了自定义金额就清掉预设选中态」的联动；
							// 直接当 prop 传会被控件内部的 field 覆盖，只有走 rules 才由 react-hook-form 调用。
							rules={{ onChange: () => setValue('amount', '0') }}
							// 只保留 ¥ 前缀绝对定位所需的布局类，边框/焦点环这类外观归设计系统
							className="w-32 pl-8"
							// 文案仍按今天那句算：zod 的 message 是 i18n 键，不能直接当用户文案显示
							error={
								errors.amount
									? t(errors.amount.message || 'wallet.recharge.amountRequired')
									: undefined
							}
						/>
					</div>
				</div>

				<h2 className="text-lg font-semibold pt-2">{t('wallet.recharge.paymentMethod')}</h2>
				<div className="flex gap-3">
					{channels.map((ch) => (
						<button
							key={ch.code}
							type="button"
							onClick={() => setChannel(ch.code)}
							className={`flex items-center gap-2 px-5 py-3 rounded-lg border transition-colors ${
								channel === ch.code
									? 'border-[var(--color-brand)] bg-primary-50 text-[var(--color-brand)]'
									: 'border-neutral-300 hover:border-[var(--color-brand)]'
							}`}
						>
							<span className="text-xl">{ch.icon}</span>
							<span className="font-medium">{ch.label}</span>
						</button>
					))}
				</div>

				<button
					type="submit"
					disabled={!selectedAmount || selectedAmount <= 0 || isSubmitting || polling}
					className="w-full py-4 rounded-lg bg-[var(--color-brand)] text-white font-semibold text-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
				>
					{isSubmitting || polling ? (
						<>
							<Loader2 className="w-5 h-5 animate-spin" />
							{polling ? t('wallet.recharge.waitingPayment') : t('wallet.recharge.submitting')}
						</>
					) : (
						<>
							<CreditCard className="w-5 h-5" />
							{t('wallet.recharge.rechargeNow', { amount: selectedAmount.toFixed(2) })}
						</>
					)}
				</button>

				{status === 'success' && (
					<Alert variant="success">
						<span className="font-medium">
							{resultAmount ? t(resultKey, { amount: resultAmount }) : t(resultKey)}
						</span>
						<button
							type="button"
							onClick={() => navigate(buildNavHref(ROUTES.payments, tenantSlug))}
							className="ml-auto text-sm text-[var(--color-brand)] hover:underline"
						>
							{t('wallet.recharge.viewPaymentRecords')}
						</button>
					</Alert>
				)}

				{status === 'error' && (
					<Alert variant="danger">
						<span className="font-medium">{t(resultKey)}</span>
						<button
							type="button"
							onClick={() => setStatus('idle')}
							className="ml-auto text-sm text-[var(--color-brand)] hover:underline"
						>
							{t('wallet.recharge.retry')}
						</button>
					</Alert>
				)}
			</form>
		</div>
	);
}
