'use client';
import { useAuth, useTenantSlug } from '@autional/shared';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { UserCircle, ShieldCheck, Monitor, Bell, Wallet, Coins } from 'lucide-react';
import {
	useProfile,
	useWalletBalance,
	usePointAccount,
	useUnreadNotifications,
	useMFAStatus,
} from '@/hooks/queries';
import { SectionCard, AppPageHeader, ErrorState } from '@autional/ui';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ROUTES } from '@/lib/routes';
import { buildNavHref } from '@/lib/nav';
import { isNotFoundError } from '@/lib/api-error';

export default function DashboardPage() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const tenantSlug = useTenantSlug();

	const { data: profile } = useProfile();
	const walletQ = useWalletBalance();
	const pointQ = usePointAccount();
	const unreadQ = useUnreadNotifications();
	const mfaQ = useMFAStatus();
	const userInitial =
		profile?.username?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'U';

	const isStatsLoading =
		walletQ.isLoading || pointQ.isLoading || unreadQ.isLoading || mfaQ.isLoading;
	const statsError =
		(walletQ.error && !isNotFoundError(walletQ.error)) ||
		(pointQ.error && !isNotFoundError(pointQ.error));

	// UP-01/48：404（wallet/point account not found）= 实体不存在，属业务空态而非「余额 0」。
	// 有数据才渲染数值（真实 0 仍显 0/¥0.00），空态走「暂无钱包 / 暂无积分账户」文案，
	// 与钱包页「尚未开通」语义链统一，不再用假 0 兜底。
	const walletBalance = walletQ.data?.availableBalance ?? walletQ.data?.balance;
	const pointsBalance = pointQ.data
		? ((pointQ.data as any)?.available ?? pointQ.data?.balance)
		: undefined;
	// UP-101：安全状态卡原为静态「良好」常量（无数据源）。改接 mfa/status 真实数据：
	// 任一 MFA 方式启用 → 已启用；全未启用 → amber 短板提示；查询失败 → 暂不可用。
	const mfaEnabled =
		!!mfaQ.data &&
		(mfaQ.data.totpEnabled ||
			mfaQ.data.smsEnabled ||
			mfaQ.data.emailEnabled ||
			(mfaQ.data.methods?.length ?? 0) > 0);

	const quickLinks = [
		{
			to: buildNavHref(ROUTES.profile, tenantSlug),
			label: t('nav.profile'),
			desc: t('dashboard.quickLinkProfile'),
			icon: UserCircle,
			color: 'bg-info-soft text-info-text',
		},
		{
			to: buildNavHref(ROUTES.security, tenantSlug),
			label: t('nav.security'),
			desc: t('dashboard.quickLinkSecurity'),
			icon: ShieldCheck,
			color: 'bg-success-soft text-success-text',
		},
		{
			to: buildNavHref(ROUTES.sessions, tenantSlug),
			label: t('nav.sessions'),
			desc: t('dashboard.quickLinkSessions'),
			icon: Monitor,
			color: 'bg-chart-7/10 text-primary-900',
		},
		{
			to: buildNavHref(ROUTES.notifications, tenantSlug),
			label: t('nav.notifications'),
			desc: t('dashboard.quickLinkNotifications'),
			icon: Bell,
			color: 'bg-amber-50 text-amber-700',
		},
	];

	const tips = [t('dashboard.tip1'), t('dashboard.tip2'), t('dashboard.tip3'), t('dashboard.tip4')];

	return (
		<div className="space-y-8">
			{/* Welcome header —— 头像留在标题里（aria-hidden，不进可访问名），
			    问候语优先 displayName（UP-08）。 */}
			<AppPageHeader
				title={
					<span className="flex items-center gap-3">
						<span
							aria-hidden="true"
							className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-base font-bold text-primary-700"
						>
							{userInitial}
						</span>
						{t('dashboard.greeting', {
							name:
								user?.displayName?.trim() ||
								profile?.username ||
								user?.username ||
								user?.email ||
								t('common.userFallback'),
						})}
					</span>
				}
				description={t('dashboard.welcome')}
			/>

			{/* Quick stats row */}
			{isStatsLoading ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
				</div>
			) : statsError ? (
				<ErrorState message={t('dashboard.statsError')} />
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<SectionCard>
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-md bg-info-soft text-info-text">
								<Wallet size={20} />
							</div>
							<div>
								<p className="text-sm text-neutral-600">{t('dashboard.stats.walletBalance')}</p>
								{walletBalance != null ? (
									<p className="text-lg font-semibold text-neutral-900">
										¥
										{Number(walletBalance).toLocaleString(undefined, {
											minimumFractionDigits: 2,
										})}
									</p>
								) : (
									<p className="text-lg font-semibold text-neutral-500">
										{t('dashboard.stats.walletNone', '暂无钱包')}
									</p>
								)}
							</div>
						</div>
					</SectionCard>
					<SectionCard>
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
								<Coins size={20} />
							</div>
							<div>
								<p className="text-sm text-neutral-600">{t('dashboard.stats.points')}</p>
								{pointsBalance != null ? (
									<p className="text-lg font-semibold text-neutral-900">{pointsBalance}</p>
								) : (
									<p className="text-lg font-semibold text-neutral-500">
										{t('dashboard.stats.pointsNone', '暂无积分账户')}
									</p>
								)}
							</div>
						</div>
					</SectionCard>
					<SectionCard>
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-md bg-success-soft text-success-text">
								<ShieldCheck size={20} />
							</div>
							<div>
								<p className="text-sm text-neutral-600">{t('dashboard.stats.securityStatus')}</p>
								<p
									className={`text-lg font-semibold ${
										mfaQ.isError
											? 'text-neutral-500'
											: mfaEnabled
												? 'text-success-text'
												: 'text-amber-600'
									}`}
								>
									{mfaQ.isError
										? t('dashboard.stats.securityUnavailable', '暂不可用')
										: mfaEnabled
											? t('dashboard.stats.mfaEnabled', 'MFA 已启用')
											: t('dashboard.stats.mfaNotEnabled', 'MFA 未启用')}
								</p>
							</div>
						</div>
					</SectionCard>
					<SectionCard>
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-md bg-danger-soft text-danger-text">
								<Bell size={20} />
							</div>
							<div>
								<p className="text-sm text-neutral-600">
									{t('dashboard.stats.unreadNotifications')}
								</p>
								<p className="text-lg font-semibold text-neutral-900">
									{unreadQ.data != null ? unreadQ.data.length : '0'}
								</p>
							</div>
						</div>
					</SectionCard>
				</div>
			)}

			{/* Quick links */}
			<div>
				<h3 className="text-lg font-semibold text-neutral-900">{t('dashboard.quickLinks')}</h3>
				<div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{quickLinks.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							className="group flex items-start gap-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-neutral-300"
						>
							<div
								className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${item.color}`}
							>
								<item.icon size={20} />
							</div>
							<div>
								<h3 className="font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors">
									{item.label}
								</h3>
								<p className="mt-1 text-sm text-neutral-600">{item.desc}</p>
							</div>
						</Link>
					))}
				</div>
			</div>

			{/* Tips */}
			{isStatsLoading ? (
				<div className="rounded-lg border border-neutral-200 bg-white p-6 animate-pulse">
					<div className="h-6 w-1/3 rounded bg-neutral-200" />
					<div className="mt-4 space-y-3">
						<div className="h-4 w-2/3 rounded bg-neutral-100" />
						<div className="h-4 w-3/4 rounded bg-neutral-100" />
						<div className="h-4 w-1/2 rounded bg-neutral-100" />
						<div className="h-4 w-5/6 rounded bg-neutral-100" />
					</div>
				</div>
			) : (
				<SectionCard title={t('dashboard.securityTips')}>
					<h3 className="text-lg font-semibold text-neutral-900">{t('dashboard.securityTips')}</h3>
					<ul className="mt-4 list-disc list-inside space-y-2 text-neutral-700">
						{tips.map((tip, i) => (
							<li key={i}>{tip}</li>
						))}
					</ul>
				</SectionCard>
			)}
		</div>
	);
}
