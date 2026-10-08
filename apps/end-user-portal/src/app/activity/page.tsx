'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLogs } from '@/hooks/queries';
import type { AuditLogItem } from '@/hooks/queries';
import { auditStatusKind, formatTime } from '@/lib/format';
import { parseUserAgent } from '@/lib/user-agent';
import { AppPageHeader, LoadingScreen, ErrorState, EmptyState, StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable, DateRangeFilter } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import { History, Download, CheckCircle2, XCircle, Clock, Monitor, Smartphone } from 'lucide-react';

const ACTION_OPTIONS = [
	{ value: '', labelKey: 'activity.allActions' },
	{ value: 'login', labelKey: 'activity.eventType.login' },
	{ value: 'logout', labelKey: 'activity.eventType.logout' },
	{ value: 'password_change', labelKey: 'activity.eventType.password_change' },
	{ value: 'mfa_enable', labelKey: 'activity.eventType.mfa_enable' },
	{ value: 'mfa_disable', labelKey: 'activity.eventType.mfa_disable' },
	{ value: 'profile_update', labelKey: 'activity.eventType.profile_update' },
	{ value: 'create', labelKey: 'activity.eventType.create' },
	{ value: 'update', labelKey: 'activity.eventType.update' },
	{ value: 'delete', labelKey: 'activity.eventType.delete' },
];

// 操作类型 → 设计系统徽标档位。**只做映射，不做样式**。
// 原表里这 10 种操作共用同一个中性灰标签（它们是分类，不是「成功/失败」这类状态），
// 所以映射整齐地落在 neutral：换 StatusBadge 是把配色交回设计系统，不是顺手按操作分色。
const ACTION_VARIANTS: Record<string, StatusVariant> = {
	login: 'neutral',
	logout: 'neutral',
	password_change: 'neutral',
	mfa_enable: 'neutral',
	mfa_disable: 'neutral',
	profile_update: 'neutral',
	create: 'neutral',
	update: 'neutral',
	delete: 'neutral',
};

// 执行结果 → 设计系统徽标档位。原来 success 是 emerald、failed 是 red 两套裸色阶，
// 现在只保留「哪一档」的语义（成功→success、失败→danger），配色由 StatusBadge 决定。
const RESULT_VARIANTS: Record<string, StatusVariant> = {
	success: 'success',
	failed: 'danger',
};

// 原始 action（服务端审计流取值）→ 展示键。审计流里同一语义有多种命名风格
// （LOGIN / auth.login_success / login_success_record），字典按语义归一；
// 未收录的值给中性归类「其他操作」，不再裸出内部标识（UP-35）。
const RAW_ACTION_LABEL_KEYS: Record<string, string> = {
	// 登录家族
	LOGIN: 'activity.eventType.login',
	FAILED_LOGIN: 'activity.eventType.login',
	CODE_LOGIN: 'activity.eventType.login',
	'auth.login_success': 'activity.eventType.login',
	'auth.login_failed': 'activity.eventType.login',
	login: 'activity.eventType.login',
	login_success_record: 'activity.eventType.login',
	'user.login': 'activity.eventType.login',
	// 登出家族
	LOGOUT: 'activity.eventType.logout',
	'auth.logout': 'activity.eventType.logout',
	'user.logout': 'activity.eventType.logout',
	'session.logout': 'activity.eventType.logout',
	'session.logout_all': 'activity.eventType.logout',
	rp_initiated_logout: 'activity.eventType.logout',
	// 修改密码
	'auth.password_changed': 'activity.eventType.password_change',
	'password.changed': 'activity.eventType.password_change',
	'user.password.changed_lifecycle': 'activity.eventType.password_change',
	// MFA 启用/停用
	'mfa.enabled': 'activity.eventType.mfa_enable',
	totp_enable: 'activity.eventType.mfa_enable',
	'mfa.sms_enrolled': 'activity.eventType.mfa_enable',
	'mfa.disabled': 'activity.eventType.mfa_disable',
	totp_disable: 'activity.eventType.mfa_disable',
	// 资料更新
	'profile.update': 'activity.eventType.profile_update',
	'profile.updated': 'activity.eventType.profile_update',
	'profile.avatar_update': 'activity.eventType.profile_update',
	'profile.avatar_updated': 'activity.eventType.profile_update',
	create: 'activity.eventType.create',
	update: 'activity.eventType.update',
	delete: 'activity.eventType.delete',
	// 只读/系统类（审计实测观察值，UP-35 证据）
	'profile.privacy_impact_read': 'activity.eventType.privacyImpactRead',
	'profile.consents_read': 'activity.eventType.consentsRead',
	'profile.grpc_read': 'activity.eventType.profileRead',
	'profile.grpc_get_language': 'activity.eventType.languageRead',
	'mfa.totp.setup_initiated': 'activity.eventType.mfaSetupInitiated',
	setup: 'activity.eventType.setup',
	authorize_post: 'activity.eventType.authorize',
	'device.fingerprint.recorded': 'activity.eventType.deviceFingerprint',
};

export default function ActivityPage() {
	const { t } = useTranslation();
	const [page, setPage] = useState(1);
	const [actionFilter, setActionFilter] = useState('');
	const [startDate, setStartDate] = useState('');
	const [endDate, setEndDate] = useState('');
	const pageSize = 15;

	const params: Record<string, unknown> = { page, pageSize };
	if (actionFilter) params.action = actionFilter;
	if (startDate) params.startDate = startDate;
	if (endDate) params.endDate = endDate;

	const { data, isLoading, error, refetch } = useAuditLogs(params as any);

	const items = data?.items || [];
	const total = data?.total || 0;

	const getActionLabel = (action?: string) => {
		if (!action) return '—';
		// 先查原始词表（展示列用真实 action），再回落下拉枚举值。
		const key = RAW_ACTION_LABEL_KEYS[action] ?? ACTION_OPTIONS.find((a) => a.value === action)?.labelKey;
		return key ? t(key) : t('activity.otherAction', '其他操作');
	};

	const getDeviceIcon = (userAgent?: string) => {
		if (!userAgent) return <Monitor size={14} />;
		if (/iPhone|iPad|Android|Mobile/i.test(userAgent)) return <Smartphone size={14} />;
		return <Monitor size={14} />;
	};

	const exportCSV = () => {
		if (items.length === 0) return;
		const headers = [
			t('activity.table.time'),
			t('activity.table.action'),
			t('activity.table.ip'),
			t('activity.table.device'),
			t('activity.table.location'),
			t('activity.table.result'),
		];
		const rows = items.map((log) => {
			const resultKind = auditStatusKind(log.status);
			// 接口字段为 created_at（createdAt），timestamp 仅为兼容旧形状的兜底（UP-32，
			// 与登录历史页 `timestamp || createdAt` 同一口径）。
			const ts = log.timestamp || log.createdAt;
			const ua = parseUserAgent(log.userAgent);
			return [
				ts ? formatTime(ts) : '',
				getActionLabel(log.action),
				log.ip || '',
				// UP-36：与登录历史页 CSV 同口径（解析后的「浏览器 (平台)」而非 40 字符断尾原文）。
				log.userAgent ? `${ua.browser} ${ua.os}`.trim() : '—',
				// 空值同显「—」（与登录历史表/CSV 同族判定，AC-02-2/3）。
				log.location || '—',
				// 三态：'' 既不算成功也不算失败（与表格列同一语义）。
				resultKind === 'success'
					? t('activity.status.success')
					: resultKind === 'failed'
						? t('activity.status.failed')
						: '—',
			];
		});
		// 表头与数据行同引号规则（与登录历史 CSV 对齐，UP-33）。
		const csvContent = [
			headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
			...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
		].join('\n');
		const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `activity_${new Date().toISOString().slice(0, 10)}.csv`;
		link.click();
		URL.revokeObjectURL(link.href);
	};

	if (isLoading) return <LoadingScreen message={t('common.loadingData')} />;
	if (error) return <ErrorState message={t('common.error')} onRetry={() => refetch()} />;

	// 列定义：只描述「这一页有哪些列」。表头底色 / 悬浮态 / 边框 / 行高 / 分页外观，
	// 由设计系统下发的组件级令牌决定 —— 与控制台那 156 处 antd Table 吃的是同一份令牌。
	const columns: DataTableColumns<AuditLogItem> = [
		{
			title: t('activity.table.time'),
			dataIndex: 'timestamp',
			key: 'timestamp',
			render: (_: string | undefined, record: AuditLogItem) => {
				const ts = record.timestamp || record.createdAt;
				return <span className="text-xs whitespace-nowrap">{ts ? formatTime(ts) : '—'}</span>;
			},
		},
		{
			title: t('activity.table.action'),
			dataIndex: 'action',
			key: 'action',
			render: (v: string | undefined) => (
				<StatusBadge variant={ACTION_VARIANTS[v ?? ''] ?? 'neutral'}>{getActionLabel(v)}</StatusBadge>
			),
		},
		{
			title: t('activity.table.ip'),
			dataIndex: 'ip',
			key: 'ip',
			render: (v: string | undefined) => <span className="text-xs font-mono">{v || '—'}</span>,
		},
		{
			title: t('activity.table.device'),
			dataIndex: 'userAgent',
			key: 'userAgent',
			render: (v: string | undefined) => {
				// UP-36：与登录历史页同口径（解析为「浏览器 (平台)」；截断交给 CSS ellipsis + title 悬浮全量）。
				const ua = parseUserAgent(v);
				const text = v ? `${ua.browser} ${ua.os}`.trim() : '—';
				return (
					<span className="inline-flex items-center gap-1.5 text-xs">
						{getDeviceIcon(v)}
						<span className="inline-block max-w-[200px] truncate" title={text}>
							{text}
						</span>
					</span>
				);
			},
		},
		{
			title: t('activity.table.result'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string | undefined) => {
				// 与 CSV 共用 auditStatusKind 三态判定（UP-33：四处口径合一）。
				const kind = auditStatusKind(v);
				if (kind === 'success')
					return (
						<StatusBadge variant={RESULT_VARIANTS.success}>
							<CheckCircle2 size={10} /> {t('activity.status.success')}
						</StatusBadge>
					);
				if (kind === 'failed')
					return (
						<StatusBadge variant={RESULT_VARIANTS.failed}>
							<XCircle size={10} /> {t('activity.status.failed')}
						</StatusBadge>
					);
				return <span className="text-xs text-neutral-600">—</span>;
			},
		},
	];

	return (
		<div className="space-y-6">
			<AppPageHeader title={t('activity.title')} description={t('activity.description')} />

			<div className="flex flex-wrap items-center gap-3">
				<select
					aria-label={t('activity.table.action')}
					value={actionFilter}
					onChange={(e) => {
						setActionFilter(e.target.value);
						setPage(1);
					}}
					className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
				>
					{ACTION_OPTIONS.map((a) => (
						<option key={a.value} value={a.value}>
							{t(a.labelKey)}
						</option>
					))}
				</select>

				<div className="flex items-center gap-2">
					<Clock size={14} className="text-neutral-500" />
					{/* 原来是两个原生 <input type="date"> 加一个「~」分隔符：自绘、与其余三个门户的日期控件
					    不同源，而且「空区间」有 startDate / endDate 两个半选状态（只选了一端时查询里会出现一个
					    孤立的边界）。换成设计系统的区间件之后，值进值出都是字符串、空只有 null 一种。 */}
					<DateRangeFilter
						value={startDate && endDate ? [startDate, endDate] : null}
						onChange={(v) => {
							setStartDate(v?.[0] ?? '');
							setEndDate(v?.[1] ?? '');
							setPage(1);
						}}
					/>
				</div>

				{items.length > 0 && (
					<button
						onClick={exportCSV}
						className="flex items-center gap-1.5 h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-600 hover:bg-neutral-50"
					>
						<Download size={14} />
						{t('activity.export')}
					</button>
				)}
			</div>

			{items.length === 0 ? (
				<EmptyState
					icon={<History />}
					title={t('common.empty')}
					description={
						actionFilter || startDate || endDate
							? t('activity.noMatchingRecords')
							: t('activity.noRecords')
					}
				/>
			) : (
				<DataTable<AuditLogItem>
					rowKey={(r, i) => r.id ?? String(i)}
					columns={columns}
					dataSource={items}
					scroll={{ x: 'max-content' }}
					pagination={{
						current: page,
						pageSize,
						total,
						onChange: setPage,
						// 原来的手写翻页只在 total > pageSize 时才出现；hideOnSinglePage 保留「不足一页不显示分页条」。
						hideOnSinglePage: true,
					}}
				/>
			)}
		</div>
	);
}
