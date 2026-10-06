import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTenantSlug } from '@autional/shared';
import { Breadcrumb as SharedBreadcrumb } from '@autional/ui/antd';
import { buildNavHref } from '@/lib/nav';
import { ROUTES } from '@/lib/routes';

/**
 * 面包屑。
 *
 * 这里只剩**业务**：路由 → 文案的映射表（UP-82 起为全量，覆盖 ROUTES 全部路径 + 中间段）。
 * 机制（剥租户段、按段累积、中间段可点、末段纯文本、只有一项就不渲染）在设计系统那一份里 ——
 * 此前本站是 77 行**手写 nav + lucide 图标**，且只认完整路径、中间段不可点、最多两级；
 * 另外两个门户用的是 antd 的 Breadcrumb。收敛方向是少数向多数靠，所以这里换成了共同实现。
 */
export function Breadcrumb() {
	const { t } = useTranslation();
	const location = useLocation();
	const tenantSlug = useTenantSlug();

	// UP-82：原仅 13 条，communication/pushTokens/announcements/privacyImpact 等一批路由
	// 走父段直落或裸段显示。现按侧栏分组全量补齐，另含 /security/passkeys 中间段防裸段。
	const labels = useMemo<Record<string, string>>(
		() => ({
			// 账户
			[ROUTES.dashboard]: t('nav.overview'),
			[ROUTES.profile]: t('nav.profile'),
			[ROUTES.privacyImpact]: t('nav.privacyImpact'),
			[ROUTES.exportData]: t('nav.exportData'),
			[ROUTES.compliance]: t('nav.compliance'),
			[ROUTES.security]: t('nav.security'),
			[ROUTES.roleActivations]: t('nav.roleActivations'),
			[ROUTES.linkedAccounts]: t('nav.linkedAccounts'),
			[ROUTES.consents]: t('nav.consents'),
			[ROUTES.onboarding]: t('onboarding.title'),
			// 安全活动
			[ROUTES.loginHistory]: t('nav.loginHistory'),
			[ROUTES.activity]: t('nav.activityLog'),
			[ROUTES.recoveryContacts]: t('nav.recoveryContacts'),
			[ROUTES.sessions]: t('nav.sessions'),
			// security 子路径（中间段 + 终点，防裸段显示）
			'/security/passkeys': t('security.passkeyTitle'),
			[ROUTES.passkeyRegister]: t('security.passkeys.register.title'),
			[ROUTES.deleteAccount]: t('security.deleteAccountTitle'),
			// 我的设备
			[ROUTES.devices]: t('nav.devices'),
			[ROUTES.devicesPair]: t('nav.pairDevice'),
			[ROUTES.devicesFamily]: t('nav.familyAccess'),
			// 财务
			[ROUTES.wallet]: t('nav.wallet'),
			[ROUTES.walletRecharge]: t('nav.recharge'),
			[ROUTES.walletWithdrawals]: t('nav.withdrawals'),
			[ROUTES.points]: t('nav.points'),
			[ROUTES.billing]: t('nav.billing'),
			[ROUTES.billingSubscribe]: t('billing.subscribe.title'),
			[ROUTES.billingInvoices]: t('billing.invoices.title'),
			[ROUTES.payments]: t('payments.title'),
			[ROUTES.storage]: t('nav.storage'),
			// 消息 / 通信 / 公告
			[ROUTES.notifications]: t('nav.notifications'),
			[ROUTES.notificationPrefs]: t('nav.notificationPrefs'),
			[ROUTES.communication]: t('nav.communication'),
			[ROUTES.pushTokens]: t('nav.pushTokens'),
			[ROUTES.announcements]: t('nav.announcements'),
		}),
		[t],
	);

	return (
		<SharedBreadcrumb
			pathname={location.pathname}
			tenantSlug={tenantSlug}
			labels={labels}
			home={{ label: t('nav.overview'), href: buildNavHref(ROUTES.dashboard, tenantSlug) }}
			buildHref={(path) => buildNavHref(path, tenantSlug)}
			className="mb-6"
		/>
	);
}
