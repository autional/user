import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '@/lib/routes';

/**
 * 路由 → 文案映射（面包屑与 document.title 共用）。
 *
 * 覆盖 ROUTES 全部路径 + 中间段；未收录的动态段（如 /devices/:id）由消费方回落到应用名。
 */
export function useRouteLabels(): Record<string, string> {
	const { t } = useTranslation();

	return useMemo<Record<string, string>>(
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
}
