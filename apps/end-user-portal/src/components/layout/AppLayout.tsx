import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Breadcrumb } from './Breadcrumb';
import { useTenant } from '@/hooks/use-tenant';

import { ROUTES } from '@/lib/routes';
import { buildNavHref, pickActiveNavPath, stripTenantPrefix } from '@/lib/nav';
import { useTenantSlug, extractItem, usePortalCatalog } from '@autional/shared';
import {
	useAuth,
	useLogout,
	useBootstrap,
	refreshAccessToken,
	logout,
	getAUTH_PAGES_URL,
} from '@autional/shared';
import { useQuery } from '@tanstack/react-query';
import { useUnreadNotifications } from '@/hooks/queries';
import { useNotificationStream } from '@/hooks/use-notification-stream';
import { useEffect, useRef } from 'react';
import {
	AppShell,
	showToast,
	LanguageSwitcher,
	ThemeToggle,
	EmptyState,
	PortalSwitcher,
	UserMenu,
} from '@autional/ui';
import {
	LayoutDashboard,
	UserCircle,
	ShieldCheck,
	Monitor,
	Bell,
	Clock,
	History,
	KeyRound,
	Link2,
	Eye,
	Menu,
	ChevronDown,
	Building2,
	Smartphone,
	Settings,
	Coins,
	Wallet,
	ArrowDownCircle,
	CreditCard,
	FolderOpen,
	Link,
	Users,
	MessageSquare,
	Radio,
	Megaphone,
	FileCheck,
	BadgeCheck,
	Download,
	Compass,
	Mail,
} from 'lucide-react';

export default function AppLayout() {
	const { t } = useTranslation();
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const { user } = useAuth();
	const { tenants, currentTenant, switchTenant } = useTenant();
	useBootstrap();
	const navigate = useNavigate();
	const { data: unreadData } = useUnreadNotifications();
	const unreadCount = unreadData?.length || 0;
	const { lastEvent, addListener, authExpired } = useNotificationStream();
	const prevLastEventId = useRef<string | null>(null);
	const tenantSlug = useTenantSlug();

	/**
	 * P2-5：统一侧边栏/顶栏导航 URL 形态。
	 * - basename 含 tenantSlug（多段 URL，如 /acme-corp/profile）→ to 用无前缀内部路径，React Router 自动拼 basename
	 * - basename 为 /（单段 URL，如 /acme-corp）→ to 显式带 slug 前缀，避免链接退化为无 slug 形态
	 */
	const navHref = (path: string): string => buildNavHref(path, tenantSlug);

	useEffect(() => {
		return addListener((notification) => {
			showToast(notification.title || '', 'info', 5000);
		});
	}, [addListener]);

	useEffect(() => {
		if (!authExpired) return;
		refreshAccessToken().catch(() => {
			// U350 接通后复查落点：裸 /login 是 auth 入口路由（正会话落 dashboard、无会话落 brand，
			// 旗标即丢）；改走 auth 站既有「会话过期」页（倒计时 → 带回程重登，原路返回本页）。
			logout(
				`${getAUTH_PAGES_URL()}/error?type=session_expired&redirect=${encodeURIComponent(window.location.href)}`,
			);
		});
	}, [authExpired]);

	useEffect(() => {
		if (lastEvent && lastEvent.id !== prevLastEventId.current) {
			prevLastEventId.current = lastEvent.id || null;
		}
	}, [lastEvent]);

	const { pathname } = useLocation();
	const { data: gatesData } = useQuery({
		queryKey: ['featureGates'],
		queryFn: async () => {
			const { billingFeatureGates } = await import('@autional/shared/generated/api');
			return billingFeatureGates();
		},
		staleTime: 5 * 60 * 1000,
	});
	const nhiEnabled =
		// 2026-08-17 修复：billingFeatureGates 经拦截器 camelCase → featureGates
		// （原 snake_case feature_gates 恒 undefined → 永远回退 env，后端开启的 NHI 门不生效）
		extractItem<{ featureGates?: Array<{ key: string; enabled: boolean }> }>(gatesData)
			?.featureGates?.some((g) => g.key === 'nhi' && g.enabled) ??
		import.meta.env.VITE_NHI_ENABLED === 'true';

	const navSections = [
		{
			header: t('nav.section.account'),
			items: [
				{ to: ROUTES.dashboard, label: t('nav.overview'), icon: LayoutDashboard },
				{ to: ROUTES.profile, label: t('nav.profile'), icon: UserCircle },
				{ to: ROUTES.privacyImpact, label: t('nav.privacyImpact'), icon: Eye },
				// UP-90：孤儿页补入口 —— 数据导出（隐私）/ 合规状态（账户）。
				{ to: ROUTES.exportData, label: t('nav.exportData'), icon: Download },
				{ to: ROUTES.compliance, label: t('nav.compliance'), icon: BadgeCheck },
				{ to: ROUTES.security, label: t('nav.security'), icon: ShieldCheck },
				{ to: ROUTES.roleActivations, label: t('nav.roleActivations'), icon: KeyRound },
				{ to: ROUTES.linkedAccounts, label: t('nav.linkedAccounts'), icon: Link2 },
				{ to: ROUTES.consents, label: t('nav.consents'), icon: FileCheck },
				// UP-90：引导向导入口（新用户激活链；页内自带跳过/重开）。
				{ to: ROUTES.onboarding, label: t('nav.onboarding'), icon: Compass },
			],
		},
		{
			header: t('nav.section.activity'),
			items: [
				{ to: ROUTES.loginHistory, label: t('nav.loginHistory'), icon: Clock },
				{ to: ROUTES.activity, label: t('nav.activityLog'), icon: History },
				// UP-90：恢复联系人归安全活动组。
				{ to: ROUTES.recoveryContacts, label: t('nav.recoveryContacts'), icon: Mail },
				// NHI 开启时设备入口归「我的设备」组，此处不再重复（曾同目标双入口同时高亮）
				...(nhiEnabled
					? []
					: [{ to: ROUTES.devices, label: t('nav.devices'), icon: Smartphone }]),
				{ to: ROUTES.sessions, label: t('nav.sessions'), icon: Monitor },
			],
		},
		...(nhiEnabled
			? [
					{
						header: t('nav.section.myThings'),
						items: [
							{ to: ROUTES.devices, label: t('nav.myDevices'), icon: Smartphone },
							{ to: ROUTES.devicesPair, label: t('nav.pairDevice'), icon: Link },
							{ to: ROUTES.devicesFamily, label: t('nav.familyAccess'), icon: Users },
						],
					},
				]
			: []),
		{
			header: t('nav.section.finance'),
			items: [
				{ to: ROUTES.wallet, label: t('nav.wallet'), icon: Wallet },
				{ to: ROUTES.walletRecharge, label: t('nav.recharge'), icon: CreditCard },
				{ to: ROUTES.walletWithdrawals, label: t('nav.withdrawals'), icon: ArrowDownCircle },
				{ to: ROUTES.points, label: t('nav.points'), icon: Coins },
				{ to: ROUTES.billing, label: t('nav.billing'), icon: CreditCard },
				{ to: ROUTES.storage, label: t('nav.storage'), icon: FolderOpen },
			],
		},
		{
			header: t('nav.section.messages'),
			items: [
				{ to: ROUTES.notifications, label: t('nav.notifications'), icon: Bell },
				{ to: ROUTES.notificationPrefs, label: t('nav.notificationPrefs'), icon: Settings },
			],
		},
		{
			header: t('nav.section.communication'),
			items: [
				{ to: ROUTES.communication, label: t('nav.communication'), icon: MessageSquare },
				{ to: ROUTES.pushTokens, label: t('nav.pushTokens'), icon: Radio },
			],
		},
		{
			header: t('nav.section.announcements'),
			items: [{ to: ROUTES.announcements, label: t('nav.announcements'), icon: Megaphone }],
		},
	];

	// 单高亮：只点亮与当前路径匹配最长的一项（父项在子路由下不再与子项齐亮）
	const internalPath = stripTenantPrefix(pathname, tenantSlug);
	const activeTo = pickActiveNavPath(
		navSections.flatMap((section) => section.items.map((item) => item.to)),
		internalPath,
	);

	const handleLogout = useLogout();

	const { portals } = usePortalCatalog({ tenantId: currentTenant?.id, slug: tenantSlug });

	if (tenants.length === 0) {
		return (
			<div className="flex h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-900">
				<EmptyState title={t('tenant.noTenants')} description={t('tenant.noTenantsDesc')} />
			</div>
		);
	}
	return (
		<>
			{/* UP-09：skip link —— 键盘/读屏用户跳过侧栏直达主内容（全站首个可聚焦元素，聚焦时可见）。 */}
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-700 focus:shadow-card focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:bg-neutral-800 dark:focus:text-primary-400"
			>
				{t('nav.skipToContent')}
			</a>
			{/*
			 * L16 顺带查出：brand 槽是侧栏顶部的**产品名**，这里却填了 t('dashboard.title')（=「总览」）
			 * —— 于是全站每个页面的侧栏都写着「总览」。按舰队口径改成 app.brand
			 * （admin 用 'Autional'，platform 用 'Autional 平台管理'）。
			 * 注意：JSX **属性位置**不能放表达式容器注释（只有子节点位置合法）——
			 * 第一版就把它塞在 brand= 上方，eslint 直接 Parsing error，被 lint 闸门当场抓住。
			 */}
			<AppShell
			brand={
				<span className="truncate text-lg font-bold text-primary-700 dark:text-primary-400">
					{t('app.brand')}
				</span>
			}
			sidebarExtra={
				tenants.length > 1 && currentTenant ? (
					<div className="border-b border-neutral-200 p-3 dark:border-neutral-700">
						<div className="relative">
							<Building2
								size={14}
								className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
							/>
							<select
								value={currentTenant.id}
								onChange={(e) => switchTenant(e.target.value)}
								className="w-full appearance-none rounded-md border border-neutral-200 bg-neutral-50 py-2 pl-8 pr-8 text-xs font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200"
							>
								{tenants.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name}
									</option>
								))}
							</select>
							<ChevronDown
								size={14}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
							/>
						</div>
					</div>
				) : null
			}
			nav={
				<div className="flex flex-col gap-4 p-4">
					{navSections.map((section) => (
						<div key={section.header}>
							<h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] dark:text-neutral-500">
								{section.header}
							</h3>
							<div className="flex flex-col gap-1">
								{section.items.map((item) => {
									const isActive = item.to === activeTo;
									return (
										<RouterLink
											key={item.to}
											to={navHref(item.to)}
											aria-current={isActive ? 'page' : undefined}
											onClick={() => setSidebarOpen(false)}
											className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
												isActive
													? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
													: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200'
											}`}
										>
											<item.icon size={18} />
											{item.label}
										</RouterLink>
									);
								})}
							</div>
						</div>
					))}
				</div>
			}
			headerLeft={
				<>
					<button
						className="lg:hidden text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
						onClick={() => setSidebarOpen(true)}
						aria-label={t('nav.openMenu')}
					>
						<Menu size={20} />
					</button>
					{/*
					 * L16：顶栏左侧从「写死的标题」换成面包屑。
					 * 原来这里恒显 t('dashboard.title')（=「总览」），而全站 30+ 个页面里只有一个是总览
					 * —— 也就是说每个用户在任何页面看到的都是错的标题。页面的真标题归页面自己
					 * （AppPageHeader 渲染 h1），外壳只负责**位置感**，而位置感正是面包屑的职责。
					 * 这也是舰队里另外两个在册门户（admin / platform）早就收敛到的形态：headerLeft=<Breadcrumb />。
					 */}
					<Breadcrumb />
				</>
			}
			headerRight={
				<>
					<PortalSwitcher portals={portals} currentPortal="user" />

					<button
						onClick={() => navigate(navHref(ROUTES.notifications))}
						className="relative rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
						title={t('nav.notifications')}
						aria-label={t('nav.notifications')}
					>
						<Bell size={18} />
						{unreadCount > 0 && (
							<span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white leading-none">
								{unreadCount > 99 ? '99+' : unreadCount}
							</span>
						)}
					</button>

					<button
						onClick={() => navigate(navHref(ROUTES.announcements))}
						className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
						title={t('nav.announcements')}
						aria-label={t('nav.announcements')}
					>
						<Megaphone size={18} />
					</button>

					{/* Language switcher */}
					{/* 文字档不能停在 neutral-500（#8896a6 对白底 3.02:1，12px 正文要 4.5:1）——
					   这是 L24 的目标页第一次把真实顶栏渲染进闸门时当场量出来的：图标档 3:1 的门槛
					   与文字档 4.5:1 的门槛不是一回事，同一个色阶不能两边都用。 */}
					<LanguageSwitcher className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-700 transition-colors dark:text-neutral-400 dark:hover:text-neutral-200" />

					{/* Theme toggle */}
					<ThemeToggle
						className="text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
						iconSize={18}
					/>

					<UserMenu
						user={user}
						items={[
							{
								key: 'profile',
								type: 'profile',
								label: t('nav.profile'),
								onClick: () => navigate(navHref(ROUTES.profile)),
							},
							{ key: 'logout', type: 'logout', onClick: handleLogout },
						]}
					/>
				</>
			}
			mobileOpen={sidebarOpen}
			onMobileClose={() => setSidebarOpen(false)}
			closeLabel={t('nav.closeMenu')}
		>
			{/* UP-09：skip link 落点 —— tabIndex=-1 使程序化/锚点聚焦可落于容器；outline-none 防聚焦描边闪现在整块内容上。 */}
			<div id="main-content" tabIndex={-1} className="outline-none">
				<Outlet />
			</div>
		</AppShell>
		</>
	);
}
