/**
 * 共享路由常量 — end-user-portal
 *
 * 与 App.tsx 的 <Route path> 完全一致（P1-1 修复：消除 AppLayout 短路径与路由路径不一致）。
 * 值为 React Router 内部路径（不含 basename / tenantSlug 前缀）。
 * AppLayout 组装导航链接时用 buildNavPath() 统一拼接 tenantSlug。
 *
 * 2026-10-03：路由统一为干净资源形态，淘汰旧版单仓遗留的一批
 * /xxx/api/v1/xxx 形态前端路径（如 /session/api/v1/sessions → /sessions）。
 * 旧路径在 App.tsx 以 LegacyRedirect 全量保留（保 query/hash），书签、跨站深链、
 * 登录回跳不受影响；对应首段仍登记在 non-tenant-segments.ts。
 */
export const ROUTES = {
	dashboard: '/',
	profile: '/profile',
	privacyImpact: '/profile/privacy-impact',
	consents: '/profile/consents',
	security: '/security',
	loginHistory: '/security/login-history',
	roleActivations: '/security/role-activations',
	linkedAccounts: '/security/linked-accounts',
	activity: '/activity',
	sessions: '/sessions',
	notifications: '/notifications',
	notificationPrefs: '/notifications/preferences',
	devices: '/devices',
	devicesPair: '/devices/pair',
	devicesFamily: '/devices/family',
	deviceTransfer: (id: string | number) => `/devices/${id}/transfer`,
	deviceActivity: (id: string | number) => `/devices/${id}/activity`,
	points: '/points',
	wallet: '/wallet',
	walletRecharge: '/wallet/recharge',
	walletWithdrawals: '/wallet/withdrawals',
	billing: '/billing',
	billingSubscribe: '/billing/subscribe',
	billingInvoices: '/billing/invoices',
	compliance: '/compliance',
	payments: '/payments',
	passkeyRegister: '/security/passkeys/register',
	deleteAccount: '/security/delete-account',
	exportData: '/privacy/export-data',
	recoveryContacts: '/security/recovery-contacts',
	storage: '/storage',
	onboarding: '/onboarding',
	communication: '/communication',
	pushTokens: '/communication/push-tokens',
	announcements: '/announcements',
} as const;

export type RouteKey = keyof typeof ROUTES;
