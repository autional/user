import { lazy, Suspense } from 'react';
import { Routes, Route, Outlet, useParams, Navigate, useLocation } from 'react-router';
import {
	RequireAuth,
	OAuthCallbackPage,
	TenantIndexGuard,
	TenantSlugProvider,
	TenantRootRedirect,
	useTenantSlugFromUrl,
	useTenantSlug,
	useBranding,
	BrandingInitializer,
} from '@autional/shared';
import { ErrorBoundary, LoadingScreen } from '@autional/ui';
// 以前这里绕了一层本地包装（用 i18n 覆盖三段文案）。现在直接挂设计系统的 ErrorBoundary：
// 它自带的字典按 <html lang> 选语言，而 src/i18n 已经会同步那个属性 —— 文案因此有四站同一份来源。
import AppLayout from './components/layout/AppLayout';
import { buildNavHref } from './lib/nav';
import { ROUTES } from './lib/routes';

const DashboardPage = lazy(() => import('./app/page'));
const ProfilePage = lazy(() => import('./app/profile/page'));
const PrivacyImpactPage = lazy(() => import('./app/profile/privacy-impact/page'));
const ConsentsPage = lazy(() => import('./app/profile/consents/page'));
const SecurityPage = lazy(() => import('./app/security/page'));
const LoginHistoryPage = lazy(() => import('./app/security/login-history/page'));
const RoleActivationsPage = lazy(() => import('./app/security/role-activations/page'));
const LinkedAccountsPage = lazy(() => import('./app/security/linked-accounts/page'));
const ActivityPage = lazy(() => import('./app/activity/page'));
const SessionsPage = lazy(() => import('./app/sessions/page'));
const NotificationsPage = lazy(() => import('./app/notifications/page'));
const NotifPrefsPage = lazy(() => import('./app/notifications/preferences/page'));
const DevicesPage = lazy(() => import('./app/devices/page'));
const PointsPage = lazy(() => import('./app/points/page'));
const WalletPage = lazy(() => import('./app/wallet/page'));
const WalletRechargePage = lazy(() => import('./app/wallet/recharge/page'));
const WalletWithdrawalsPage = lazy(() => import('./app/wallet/withdrawals/page'));
const BillingPage = lazy(() => import('./app/billing/page'));
const CompliancePage = lazy(() => import('./app/compliance/page'));
const StoragePage = lazy(() => import('./app/storage/page'));
const OnboardingPage = lazy(() => import('./app/onboarding/page'));
const CommunicationHistoryPage = lazy(() => import('./app/communication/page'));
const PushTokensPage = lazy(() => import('./app/communication/push-tokens/page'));
const AnnouncementsPage = lazy(() => import('./app/announcements/page'));
const DevicesPairPage = lazy(() => import('./app/devices/pair/page'));
const DevicesFamilyPage = lazy(() => import('./app/devices/family/page'));
const DeviceTransferPage = lazy(() => import('./app/devices/[id]/transfer/page'));
const DeviceActivityPage = lazy(() => import('./app/devices/[id]/activity/page'));
const BillingSubscribePage = lazy(() => import('./app/billing/subscribe/page'));
const BillingInvoicesPage = lazy(() => import('./app/billing/invoices/page'));
const PaymentsPage = lazy(() => import('./app/payments/page'));
const PasskeyRegisterPage = lazy(() => import('./app/security/passkeys/register/page'));
const DeleteAccountPage = lazy(() => import('./app/security/delete-account/page'));
const ExportDataPage = lazy(() => import('./app/privacy/export-data/page'));
const RecoveryContactsPage = lazy(() => import('./app/security/recovery-contacts/page'));
const NotFoundPage = lazy(() => import('./app/not-found/page'));

/** 旧路径客户端重定向：按 tenantSlug 组装新绝对路径，保留 query/hash，replace 历史记录。 */
function LegacyRedirect({ to }: { to: string }) {
	const tenantSlug = useTenantSlug();
	const { search, hash } = useLocation();
	return <Navigate to={`${buildNavHref(to, tenantSlug)}${search}${hash}`} replace />;
}

function LayoutWrapper() {
	const { tenantSlug } = useParams();
	// basename 已剥离 URL 首段（真实 tenant slug）时，内部 tenantSlug 是路由段而非租户。
	// TenantSlugProvider 必须用完整 URL 首段（真实租户 slug）供 AppLayout 的 useTenant() 匹配。
	const urlSlug = useTenantSlugFromUrl();
	return (
		<TenantSlugProvider value={urlSlug ?? tenantSlug}>
			<AppLayout />
		</TenantSlugProvider>
	);
}

export default function App() {
	useBranding();

	return (
		<ErrorBoundary devMode={import.meta.env.DEV}>
			<BrandingInitializer />
			<Suspense fallback={<LoadingScreen message="加载中…" />}>
				<Routes>
					<Route path="/oauth/callback" element={<OAuthCallbackPage />} />

					{/* 裸根漏斗：有会话直达 /<slug>，否则整页跳 brand 选品牌 */}
					<Route path="/" element={<TenantRootRedirect />} />

					<Route
						path="/:tenantSlug"
						element={
							/* notFound：确定性未知 slug（by-slug 404）原地渲染 404，不发弹跳（F-W6） */
							<RequireAuth notFound={<NotFoundPage />}>
								<Suspense fallback={<LoadingScreen message="加载中…" />}>
									<LayoutWrapper />
								</Suspense>
							</RequireAuth>
						}
					>
						{appRoutes()}
					</Route>

					<Route path="*" element={<NotFoundPage />} />
				</Routes>
			</Suspense>
		</ErrorBoundary>
	);
}

function appRoutes() {
	return (
		<>
			<Route
				index
				element={
					<TenantIndexGuard notFound={<NotFoundPage />}>
						<DashboardPage />
					</TenantIndexGuard>
				}
			/>
			<Route path="profile" element={<ProfilePage />} />
			<Route path="profile/privacy-impact" element={<PrivacyImpactPage />} />
			<Route path="profile/consents" element={<ConsentsPage />} />
			<Route path="security" element={<SecurityPage />} />
			<Route path="security/login-history" element={<LoginHistoryPage />} />
			<Route path="security/role-activations" element={<RoleActivationsPage />} />
			<Route path="security/linked-accounts" element={<LinkedAccountsPage />} />
			<Route path="activity" element={<ActivityPage />} />
			<Route path="sessions" element={<SessionsPage />} />
			<Route path="notifications" element={<NotificationsPage />} />
			<Route path="notifications/preferences" element={<NotifPrefsPage />} />
			<Route path="devices" element={<DevicesPage />} />
			<Route path="devices/pair" element={<DevicesPairPage />} />
			<Route path="devices/family" element={<DevicesFamilyPage />} />
			<Route path="devices/:id/transfer" element={<DeviceTransferPage />} />
			<Route path="devices/:id/activity" element={<DeviceActivityPage />} />
			<Route path="points" element={<PointsPage />} />
			<Route path="wallet" element={<WalletPage />} />
			<Route path="wallet/recharge" element={<WalletRechargePage />} />
			<Route path="wallet/withdrawals" element={<WalletWithdrawalsPage />} />
			<Route path="billing" element={<BillingPage />} />
			<Route path="billing/subscribe" element={<BillingSubscribePage />} />
			<Route path="billing/invoices" element={<BillingInvoicesPage />} />
			<Route path="compliance" element={<CompliancePage />} />
			<Route path="payments" element={<PaymentsPage />} />
			<Route path="security/passkeys/register" element={<PasskeyRegisterPage />} />
			<Route path="security/delete-account" element={<DeleteAccountPage />} />
			<Route path="privacy/export-data" element={<ExportDataPage />} />
			<Route path="security/recovery-contacts" element={<RecoveryContactsPage />} />
			<Route path="storage" element={<StoragePage />} />
			<Route path="onboarding" element={<OnboardingPage />} />
			<Route path="communication" element={<CommunicationHistoryPage />} />
			<Route path="communication/push-tokens" element={<PushTokensPage />} />
			<Route path="announcements" element={<AnnouncementsPage />} />

			{/* 旧路径（原 AuthMS 的 /xxx/api/v1/xxx 形态）全量重定向，勿删：书签、跨站深链、
			    登录回跳都指向它们。发送消息页已移除，其旧路径回落通信记录（发送能力属平台/
			    开发者面，演示职能由 comm-demo 服务演示台承载）。首段名单需同步
			    non-tenant-segments.ts（ui 仓 scripts/check-non-tenant.mjs 有闸门比对）。 */}
			<Route path="profile/api/v1/profile/privacy-impact" element={<LegacyRedirect to={ROUTES.privacyImpact} />} />
			<Route path="profile/api/v1/profile/consents" element={<LegacyRedirect to={ROUTES.consents} />} />
			<Route path="session/api/v1/sessions" element={<LegacyRedirect to={ROUTES.sessions} />} />
			<Route path="notification/api/v1/notifications" element={<LegacyRedirect to={ROUTES.notifications} />} />
			<Route path="notification/api/v1/notifications/preferences" element={<LegacyRedirect to={ROUTES.notificationPrefs} />} />
			<Route path="point/api/v1/points" element={<LegacyRedirect to={ROUTES.points} />} />
			<Route path="wallet/api/v1/wallet/recharge" element={<LegacyRedirect to={ROUTES.walletRecharge} />} />
			<Route path="wallet/api/v1/wallet/withdrawals" element={<LegacyRedirect to={ROUTES.walletWithdrawals} />} />
			<Route path="billing/api/v1/billing/subscribe" element={<LegacyRedirect to={ROUTES.billingSubscribe} />} />
			<Route path="billing/api/v1/billing/invoices" element={<LegacyRedirect to={ROUTES.billingInvoices} />} />
			<Route path="compliance/api/v1/compliance" element={<LegacyRedirect to={ROUTES.compliance} />} />
			<Route path="pay/api/v1/payments" element={<LegacyRedirect to={ROUTES.payments} />} />
			<Route path="storage/api/v1/storage" element={<LegacyRedirect to={ROUTES.storage} />} />
			<Route path="communication/api/v1/communication" element={<LegacyRedirect to={ROUTES.communication} />} />
			<Route path="communication/api/v1/communication/send" element={<LegacyRedirect to={ROUTES.communication} />} />
			<Route path="notification/api/v1/announcements" element={<LegacyRedirect to={ROUTES.announcements} />} />

			<Route path="*" element={<NotFoundPage />} />
		</>
	);
}
