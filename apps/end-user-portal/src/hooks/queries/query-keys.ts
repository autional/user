export const queryKeys = {
	profile: ['profile'] as const,
	devices: ['devices'] as const,
	sessions: ['sessions'] as const,
	mfa: (userId: string) => ['mfa', userId] as const,
	passkeys: ['passkeys'] as const,
	oauthConnections: (userId: string) => ['oauth-connections', userId] as const,
	auditLogs: (params?: Record<string, unknown>) => ['audit-logs', params] as const,
	notifications: (params?: Record<string, unknown>) => ['notifications', params] as const,
	unreadNotifications: ['notifications', 'unread'] as const,
	wallet: (userId: string) => ['wallet', userId] as const,
	// 第 63 轮（L8）：筛选下推服务端之后，筛选条件必须进缓存键 —— 否则「待审的第三页」
	// 会命中「全部的第二页」的缓存，这是比 total 不一致更隐蔽的一类错。
	walletTransactions: (
		userId: string,
		page: number,
		pageSize: number,
		filters?: { type?: string; status?: string },
	) =>
		[
			'wallet-transactions',
			userId,
			page,
			pageSize,
			filters?.type ?? null,
			filters?.status ?? null,
		] as const,
	walletStats: (userId: string) => ['wallet-stats', userId] as const,
	walletCoupons: (userId: string) => ['wallet-coupons', userId] as const,
	walletBalanceHistory: (userId: string) => ['wallet-balance-history', userId] as const,
	billingSubscription: (tenantId: string) => ['billing-subscription', tenantId] as const,
	billingRecords: (tenantId: string, page: number, pageSize: number) =>
		['billing-records', tenantId, page, pageSize] as const,
	billingUsage: (tenantId: string) => ['billing-usage', tenantId] as const,
	billingStatistics: (tenantId: string) => ['billing-statistics', tenantId] as const,
	points: (userId: string) => ['points', userId] as const,
	pointTransactions: (userId: string, page: number, pageSize: number) =>
		['point-transactions', userId, page, pageSize] as const,
	expiringPoints: (userId: string, days: number) => ['expiring-points', userId, days] as const,
	pointStats: (userId: string) => ['point-stats', userId] as const,
	pointValue: (userId: string) => ['point-value', userId] as const,
	pointRiskScore: (userId: string) => ['point-risk-score', userId] as const,
	payments: (params?: Record<string, unknown>) => ['payments', params] as const,
	payment: (id: string) => ['payment', id] as const,
	receipt: (id: string) => ['receipt', id] as const,
	publicPlans: ['billing', 'plans', 'public'] as const,
	subscription: (tenantId: string) => ['billing', 'subscription', tenantId] as const,
	invoices: (tenantId: string, params?: Record<string, unknown>) =>
		['billing', 'invoices', tenantId, params] as const,
	invoice: (invoiceNumber: string) => ['billing', 'invoice', invoiceNumber] as const,
	things: ['things'] as const,
	familyMembers: (deviceId: string) => ['family-members', deviceId] as const,
};

export const commQueryKeys = {
	logs: ['communication', 'logs'] as const,
	pushTokens: ['communication', 'push-tokens'] as const,
	announcements: ['announcements'] as const,
};
