'use client';
import { ROUTES } from '@/lib/routes';
import { buildNavHref } from '@/lib/nav';
import { useTenantSlug, extractApiErrorMessage } from '@autional/shared';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Bell,
	Mail,
	MessageSquare,
	Smartphone,
	MonitorSmartphone,
	ShieldCheck,
	CreditCard,
	Info,
	Megaphone,
	Save,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/queries';
import { SectionCard, AppPageHeader, LoadingScreen, ErrorState } from '@autional/ui';
import { Link } from 'react-router';

const NOTIFICATION_TYPES = [
	{
		key: 'security',
		labelKey: 'notifications.type.security',
		icon: ShieldCheck,
		descKey: 'notifications.prefs.securityDesc',
	},
	{
		key: 'account',
		labelKey: 'notifications.type.account',
		icon: MonitorSmartphone,
		descKey: 'notifications.prefs.accountDesc',
	},
	{
		key: 'billing',
		labelKey: 'notifications.type.billing',
		icon: CreditCard,
		descKey: 'notifications.prefs.billingDesc',
	},
	{
		key: 'marketing',
		labelKey: 'notifications.type.marketing',
		icon: Megaphone,
		descKey: 'notifications.prefs.marketingDesc',
	},
	{
		key: 'system',
		labelKey: 'notifications.type.system',
		icon: Info,
		descKey: 'notifications.prefs.systemDesc',
	},
];

const CHANNELS = [
	{ key: 'email', labelKey: 'notifications.prefs.channelEmail', icon: Mail },
	// UP-77：后端契约恒含 4 渠道（in_app/email/sms/push），SMS 为 demo 活跃发送渠道——
	// 此前 UI 只画 3 个，短信渠道用户不可管理；补齐对齐契约。
	{ key: 'sms', labelKey: 'notifications.prefs.channelSms', icon: MessageSquare },
	{ key: 'push', labelKey: 'notifications.prefs.channelPush', icon: Bell },
	{ key: 'inApp', labelKey: 'notifications.prefs.channelInApp', icon: Smartphone },
];

export default function NotificationPreferencesPage() {
	const tenantSlug = useTenantSlug();

	const { t } = useTranslation();
	const toast = useToast();

	const { data: prefs, isLoading, error } = useNotificationPreferences();
	const updateMutation = useUpdateNotificationPreferences();

	const [typeToggles, setTypeToggles] = useState<Record<string, boolean>>({});
	const [channelToggles, setChannelToggles] = useState<Record<string, boolean>>({});

	useEffect(() => {
		if (prefs) {
			// UP-74：读侧按真实持久化源 channels.email.types 派生（旧读路径取 typePrefs —— 后端从不返回该键
			// 族，恒 undefined → `?? true` 把开关全部假显示为 ON）。email 为权威源（写侧三通道同集合）；
			// types 缺失 → 回退全开；types=[]（若存在）→ 全部 OFF。
			const persistedTypes = prefs.channels?.email?.types;
			const types: Record<string, boolean> = {};
			for (const t of NOTIFICATION_TYPES) {
				types[t.key] = persistedTypes ? persistedTypes.includes(t.key) : true;
			}
			setTypeToggles(types);

			const channels: Record<string, boolean> = {};
			for (const ch of CHANNELS) {
				// UP-77：sms 并入本兜底（其余渠道口径不变：push 默认关、email/inApp/sms 默认开）
				channels[ch.key] = prefs.channels?.[ch.key]?.enabled ?? ch.key !== 'push';
			}
			if (prefs.emailEnabled !== undefined) channels.email = prefs.emailEnabled;
			if (prefs.pushEnabled !== undefined) channels.push = prefs.pushEnabled;
			if (prefs.smsEnabled !== undefined) channels.sms = prefs.smsEnabled;
			setChannelToggles(channels);
		}
	}, [prefs]);

	// 探针 UF1-09 判 P2：后端对空 types 跳过持久化（全关保存 = 假成功 + 回读弹回），
	// 故全关在 UI 层禁止（保存按钮禁用 + 提示，不发请求）。
	const allTypesOff = NOTIFICATION_TYPES.every((nt) => typeToggles[nt.key] === false);

	const handleSave = async () => {
		if (allTypesOff) {
			toast.error(t('notifications.prefs.atLeastOneType', '至少保留一种通知类型'));
			return;
		}
		try {
			const enabledTypes = Object.entries(typeToggles)
				.filter(([, v]) => v)
				.map(([k]) => k);
			await updateMutation.mutateAsync({
				emailEnabled: channelToggles.email,
				smsEnabled: channelToggles.sms,
				pushEnabled: channelToggles.push,
				channels: {
					email: {
						enabled: channelToggles.email,
						types: [...enabledTypes],
					},
					sms: {
						enabled: channelToggles.sms,
						types: [...enabledTypes],
					},
					push: {
						enabled: channelToggles.push,
						types: [...enabledTypes],
					},
					inApp: {
						enabled: channelToggles.inApp,
						types: [...enabledTypes],
					},
				},
			});
			toast.success(t('notifications.prefs.saved', '偏好设置已保存'));
		} catch (err) {
			// UP-92：Problem DTO 无 message（title/detail 承载），一律走共享提取链。
			toast.error(extractApiErrorMessage(err, t('common.error')));
		}
	};
	if (isLoading) return <LoadingScreen message={t('common.loading')} />;

	if (error) return <ErrorState message={t('notifications.error')} className="min-h-[40vh]" />;

	return (
		<div className="space-y-6">
			<AppPageHeader
				title={t('notifications.prefs.title', '通知偏好设置')}
				description={t('notifications.prefs.description', '管理您希望接收的通知类型和渠道')}
			/>

			{/* Notification Types */}
			<SectionCard title={t('notifications.prefs.typesTitle', '通知类型')}>
				<h3 className="text-base font-semibold text-neutral-900">
					{t('notifications.prefs.typesTitle', '通知类型')}
				</h3>
				<p className="mt-1 text-sm text-neutral-600">
					{t('notifications.prefs.typesDesc', '选择您希望接收的通知类型')}
				</p>
				<div className="mt-4 divide-y divide-neutral-100">
					{NOTIFICATION_TYPES.map((nt) => (
						<div
							key={nt.key}
							className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
						>
							<div className="flex items-start gap-3">
								<nt.icon size={18} className="mt-0.5 text-neutral-600" />
								<div>
									<p id={`ntype-label-${nt.key}`} className="text-sm font-medium text-neutral-800">{t(nt.labelKey)}</p>
									<p className="text-xs text-neutral-600">{t(nt.descKey)}</p>
								</div>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={typeToggles[nt.key]}
								aria-labelledby={`ntype-label-${nt.key}`}
								onClick={() => setTypeToggles((prev) => ({ ...prev, [nt.key]: !prev[nt.key] }))}
								className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
									typeToggles[nt.key] ? 'bg-primary-600' : 'bg-neutral-200'
								}`}
							>
								<span
									className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
										typeToggles[nt.key] ? 'translate-x-5' : 'translate-x-0'
									}`}
								/>
							</button>
						</div>
					))}
				</div>
			</SectionCard>

			{/* Delivery Channels */}
			<SectionCard title={t('notifications.prefs.channelsTitle', '通知渠道')}>
				<h3 className="text-base font-semibold text-neutral-900">
					{t('notifications.prefs.channelsTitle', '通知渠道')}
				</h3>
				<p className="mt-1 text-sm text-neutral-600">
					{t('notifications.prefs.channelsDesc', '选择通知的发送渠道')}
				</p>
				<div className="mt-4 divide-y divide-neutral-100">
					{CHANNELS.map((ch) => (
						<div
							key={ch.key}
							className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
						>
							<div className="flex items-center gap-3">
								<ch.icon size={18} className="text-neutral-600" />
								<p id={`nchannel-label-${ch.key}`} className="text-sm font-medium text-neutral-800">{t(ch.labelKey)}</p>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={channelToggles[ch.key]}
								aria-labelledby={`nchannel-label-${ch.key}`}
								onClick={() => setChannelToggles((prev) => ({ ...prev, [ch.key]: !prev[ch.key] }))}
								className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
									channelToggles[ch.key] ? 'bg-primary-600' : 'bg-neutral-200'
								}`}
							>
								<span
									className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
										channelToggles[ch.key] ? 'translate-x-5' : 'translate-x-0'
									}`}
								/>
							</button>
						</div>
					))}
				</div>
			</SectionCard>

			{/* Save button */}
			<div className="flex items-center gap-3">
				{allTypesOff && (
					<p className="text-sm text-danger-text">
						{t('notifications.prefs.atLeastOneType', '至少保留一种通知类型')}
					</p>
				)}
				<button
					onClick={handleSave}
					disabled={updateMutation.isPending || allTypesOff}
					className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
				>
					{updateMutation.isPending ? (
						<>
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
							{t('common.saving', '保存中...')}
						</>
					) : (
						<>
							<Save size={16} />
							{t('notifications.prefs.save', '保存偏好')}
						</>
					)}
				</button>
				<Link
					to={buildNavHref(ROUTES.notifications, tenantSlug)}
					className="rounded-md border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
				>
					{t('notifications.backToList', '返回通知列表')}
				</Link>
			</div>
		</div>
	);
}
