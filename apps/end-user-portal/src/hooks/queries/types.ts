import type { PageInfo, ListResponse } from '@autional/shared/generated/types';

export type PaginatedList<T> = ListResponse<T>;
export { type PageInfo };

export interface UserProfile {
	id?: string;
	username?: string;
	email?: string;
	phone?: string;
	status?: string;
	avatarUrl?: string;
	createdAt?: string;
}

export interface DeviceInfo {
	id: string;
	device_name?: string;
	browser?: string;
	os?: string;
	type?: string;
	ip?: string;
	is_trusted?: boolean;
	trust_score?: number;
	last_seen?: string;
	created_at?: string;
	login_count?: number;
	session_id?: string;
	device_fingerprint?: string;
}

export interface SessionInfo {
	id: string;
	userId?: string;
	tenantId?: string;
	deviceType?: string;
	ip?: string;
	geoip?: string;
	userAgent?: string;
	amr?: string;
	authenticatedAt?: string;
	idleExpiresAt?: string;
	isCurrentSession?: boolean;
	lastActiveAt?: string;
	createdAt?: string;
	expiresAt?: string;
	status?: string;
}

export interface MFAStatus {
	totpEnabled: boolean;
	smsEnabled: boolean;
	smsPhone?: string;
	emailEnabled: boolean;
	emailAddress?: string;
	methods?: string[];
}

export interface TOTPSetup {
	secret: string;
	qrCodeUrl?: string;
	qrCode?: string;
	setupUrl?: string;
	provisioningUri?: string;
	backupCodes?: string[];
}

export interface NotificationItem {
	id: string;
	title?: string;
	content?: string;
	type: string;
	/** 对齐 generated 契约（SHARED/generated/types.ts 的 isRead）；旧字段名 read 导致未读判定恒真（UP-71） */
	isRead: boolean;
	createdAt?: string;
	readAt?: string;
	actionUrl?: string;
	priority?: string;
	metadata?: string;
}

export interface WalletBalance {
	walletId?: string;
	currency?: string;
	balance?: string;
	available?: string;
	availableBalance?: string;
	frozen?: string;
	frozenBalance?: string;
}

export interface PointAccount {
	id?: string;
	userId?: string;
	total?: number;
	available?: number;
	frozen?: number;
	balance?: number;
	frozenBalance?: number;
	totalEarned?: number;
	totalSpent?: number;
	expiredPoints?: number;
	exchangeRate?: number;
	pointsType?: string;
	status?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface OAuthConnectionItem {
	id?: string;
	// provider = 解析后的 provider 名（如 "github"，后端解绑按其匹配）；
	// providerId = providers 表 ULID（存储值），仅供追溯。
	provider?: string;
	providerId?: string;
	providerUserId?: string;
	userId?: string;
	tenantId?: string;
	profileData?: Record<string, unknown>;
	createdAt?: string;
	updatedAt?: string;
	tokenExpiry?: string;
}

export interface AuditLogItem {
	id?: string;
	action?: string;
	ip?: string;
	userAgent?: string;
	location?: string;
	status?: string;
	reason?: string;
	timestamp?: string;
	createdAt?: string;
}

export interface PasskeyCredential {
	id: string;
	name?: string;
	credentialId?: string;
	aaguid?: string;
	attestationType?: string;
	authenticatorAttachment?: string;
	transports?: string;
	backupEligible?: boolean;
	backupState?: boolean;
	userVerified?: boolean;
	createdAt?: string;
	lastUsedAt?: string;
}

export interface ThingInfo {
	id: string;
	/** 后端 iots API 返回 identity_id（camelCase → identityId），页面构造 family/transfer 链接时优先使用 */
	identityId?: string;
	name?: string;
	type?: string;
	status?: string;
	lastSeen?: string;
	createdAt?: string;
	deviceType?: string;
	model?: string;
	manufacturer?: string;
	firmwareVersion?: string;
	online?: boolean;
}

export interface FamilyMember {
	id: string;
	email?: string;
	username?: string;
	role?: string;
	userId?: string;
	deviceId?: string;
	assignedAt?: string;
	status?: string;
}

export interface PaymentInfo {
	paymentId?: string;
	tenantId?: string;
	payerId?: string;
	channelCode?: string;
	amount?: string;
	currency?: string;
	status?: string;
	targetType?: string;
	targetId?: string;
	receiptNumber?: string;
	gatewayReference?: string;
	itemDescription?: string;
	createdAt?: string;
	paidAt?: string;
}

export interface ReceiptInfo {
	paymentId: string;
	receiptNumber: string;
	tenantId: string;
	amount: string;
	currency: string;
	channelCode: string;
	itemDescription: string;
	createdAt: string;
}

export interface SubscriptionInfo {
	tenantId?: string;
	appId?: string;
	plan?: string;
	planId?: string;
	status?: string;
	billingCycle?: string;
	trialEndsAt?: string;
	currentPeriodStart?: string;
	currentPeriodEnd?: string;
	cancelAtPeriodEnd?: boolean;
}

export interface PlanInfo {
	id?: string;
	name?: string;
	plan?: string;
	price?: string;
	features?: string[];
	monthlyPrice?: string;
	yearlyPrice?: string;
	description?: string;
}

export interface PublicPlanResponse {
	id: string;
	plan: string;
	planId?: string; // 后端字段兼容（plan_id → camelCaseKeys → planId）
	priceMonthly?: string; // 后端字段兼容（price_monthly → camelCaseKeys → priceMonthly）
	priceYearly?: string; // 后端字段兼容（price_yearly → camelCaseKeys → priceYearly）
	name: string;
	description: string;
	monthlyPrice: string;
	yearlyPrice: string;
	features: string[];
	// 后端 is_popular 恒随响应下发（当前派生自 plan==pro，DEBT-063 待扩展）。
	isPopular?: boolean;
	// UP-54：后端 services/billing 公开套餐带 quotas（max_users / max_storage_gb / max_api_requests），
	// 经 apiClient camelCaseKeys 深转换后键名为 camel（含 map 键）。
	quotas?: Record<string, number>;
}

export interface InvoiceInfo {
	invoiceNumber?: string;
	tenantId?: string;
	amount?: string;
	status?: string;
	plan?: string;
	billingCycle?: string;
	dueDate?: string;
	paidAt?: string;
	createdAt?: string;
	items?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
	description: string;
	amount: string;
	quantity: number;
	unitPrice: string;
}

export interface BillingRecord {
	id?: string;
	invoiceNumber?: string;
	tenantId?: string;
	plan?: string;
	amount?: string;
	status?: string;
	billingCycle?: string;
	targetType?: string;
	description?: string;
	dueDate?: string;
	paidAt?: string;
	createdAt?: string;
}

export interface CommunicationLogItem {
	id?: string;
	channel?: string;
	recipient?: string;
	content?: string;
	status?: string;
	provider?: string;
	error?: string;
	sentAt?: string;
	createdAt?: string;
	userId?: string;
	templateId?: string;
}

export interface PushTokenItem {
	id?: string;
	userId?: string;
	token?: string;
	platform?: string;
	deviceId?: string;
	isActive?: boolean;
	createdAt?: string;
}

export interface AnnouncementItem {
	id?: string;
	title?: string;
	content?: string;
	status?: string;
	publishAt?: string;
	expireAt?: string;
	views?: number;
	dismissals?: number;
	createdAt?: string;
	targetRoles?: string[];
	tenantId?: string;
}
