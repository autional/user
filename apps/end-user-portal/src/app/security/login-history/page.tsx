'use client';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useAuditLogs } from '@/hooks/queries';
import type { AuditLogItem, AuditLogsParams } from '@/hooks/queries';
import { authMeAuditLogs } from '@autional/shared/generated/api';
import { auditStatusKind, formatTime } from '@/lib/format';
import { parseUserAgent } from '@/lib/user-agent';
import { SectionCard, AppPageHeader, LoadingScreen } from '@autional/ui';
import { ErrorState } from '@autional/ui';
import { StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable, DateRangeFilter } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import {
	History,
	Download,
	CheckCircle2,
	XCircle,
	Clock,
	Monitor,
	Search,
} from 'lucide-react';

// 状态 → 设计系统徽标档位。只做映射，配色归设计系统（-soft/-text 是成对的、做过对比度验证）。
const STATUS_VARIANTS: Record<string, StatusVariant> = {
	success: 'success',
	failed: 'danger',
};

// UP-29：全量导出的逐页规格与上限（50 页 × 100 条），防极端数据量拖死浏览器。
const EXPORT_PAGE_SIZE = 100;
const MAX_EXPORT_PAGES = 50;

export default function LoginHistoryPage() {
	const { t } = useTranslation();
	const toast = useToast();

	const [page, setPage] = useState(1);
	const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
	const [keywordInput, setKeywordInput] = useState('');
	const [keyword, setKeyword] = useState('');
	const [startDate, setStartDate] = useState('');
	const [endDate, setEndDate] = useState('');
	// UP-28：pageSize 接通 state —— 旧实现是常量 10，antd 的尺寸切换控件显示但点了无效。
	const [pageSize, setPageSize] = useState(10);
	const [exporting, setExporting] = useState(false);

	// 关键词防抖 300ms 后入参：输入过程不逐键打接口，定稿即回到第 1 页（UP-100 检索）。
	useEffect(() => {
		const id = setTimeout(() => {
			setKeyword(keywordInput.trim());
			setPage(1);
		}, 300);
		return () => clearTimeout(id);
	}, [keywordInput]);

	// 列表查询与 CSV 导出共用同一套筛选参数构造，保证导出内容与页面口径一致。
	// UP-27：本页只呈现登录类事件（服务端按 action 枚举过滤，含成功/失败登录）。
	// 全量操作流由「活动日志」页承担，避免用户按「登录历史」心智误读审计流水。
	// UP-26：状态筛选走服务端（'failed' 映射为 status_class=failure），跨页生效；
	// 旧实现只在当前页做客户端过滤，翻页后筛选失效且总数与列表矛盾。
	const buildParams = (p: number, ps: number): AuditLogsParams => {
		const next: AuditLogsParams = { page: p, pageSize: ps, action: 'login' };
		if (statusFilter !== 'all') next.statusClass = statusFilter === 'failed' ? 'failure' : 'success';
		if (keyword) next.keyword = keyword;
		if (startDate) next.startDate = startDate;
		if (endDate) next.endDate = endDate;
		return next;
	};

	const { data, isLoading, error } = useAuditLogs(buildParams(page, pageSize));

	const items: AuditLogItem[] = data?.items || [];
	const total: number = data?.total || 0;
	const hasFilters = statusFilter !== 'all' || !!keyword || !!startDate || !!endDate;

	// 空 UA 归「未知浏览器」（CSV 与表格同值）；粗解析口径见 lib/user-agent（UP-36 两页共用）。
	const uaOf = (ua?: string) =>
		ua ? parseUserAgent(ua) : { browser: t('loginHistory.unknownBrowser'), os: '' };

	// UP-29：导出全量（跨页）而非仅当前页 —— 按同一筛选条件逐页拉取，
	// 直到拉满 total 或遇到不足一页（修正「列表显示 300 条、CSV 只有 10 条」的欺骗性口径）。
	const handleExportCSV = async () => {
		if (total === 0) {
			toast.info(t('loginHistory.empty'));
			return;
		}
		setExporting(true);
		try {
			const all: AuditLogItem[] = [];
			for (let p = 1; p <= MAX_EXPORT_PAGES; p++) {
				const res = (await authMeAuditLogs(buildParams(p, EXPORT_PAGE_SIZE))) as {
					items?: AuditLogItem[];
				};
				const pageItems = res?.items || [];
				all.push(...pageItems);
				if (pageItems.length < EXPORT_PAGE_SIZE || all.length >= total) break;
			}
			const headers = [
				t('loginHistory.time'),
				t('loginHistory.ip'),
				t('loginHistory.device'),
				t('loginHistory.status'),
				t('loginHistory.reason'),
			];
			const rows = all.map((item) => {
				const ua = uaOf(item.userAgent);
				const statusKind = auditStatusKind(item.status);
				return [
					item.timestamp || item.createdAt || '',
					item.ip || '',
					`${ua.browser} ${ua.os}`.trim(),
					// 三态：'' 既不算成功也不算失败（与表格同一判定点）。
					statusKind === 'success'
						? t('loginHistory.statusSuccess')
						: statusKind === 'failed'
							? t('loginHistory.statusFailed')
							: '—',
					// 仅失败行给原因（与表格列同一判定），未知态不给失败归因（UP-25）。
					statusKind === 'failed' ? item.reason || t('loginHistory.unknownReason') : '',
				];
			});
			const bom = '\uFEFF';
			const csv =
				bom +
				[headers, ...rows]
					.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
					.join('\n');
			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			// 文件名用本地日期：toISOString 是 UTC，东八区 0-8 点导出会写成前一天。
			const now = new Date();
			const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
				now.getDate(),
			).padStart(2, '0')}`;
			a.download = `login-history-${localDate}.csv`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(t('loginHistory.exportSuccess', { total: all.length }));
		} catch {
			toast.error(t('loginHistory.exportError'));
		} finally {
			setExporting(false);
		}
	};

	if (isLoading) return <LoadingScreen message={t('loginHistory.loading')} />;
	if (error) return <ErrorState message={t('loginHistory.error')} className="min-h-[40vh]" />;

	// 列定义：只描述**这一页有哪些列**；表头底色 / 悬浮态 / 边框 / 行高 / 分页外观
	// 由设计系统下发的组件级令牌决定 —— 四个门户吃的是同一份令牌。
	const columns: DataTableColumns<AuditLogItem> = [
		{
			title: (
				<span className="flex items-center gap-1">
					<Clock size={14} />
					{t('loginHistory.time')}
				</span>
			),
			key: 'time',
			render: (_: unknown, item: AuditLogItem) => (
				<span className="whitespace-nowrap">{formatTime(item.timestamp || item.createdAt)}</span>
			),
		},
		{
			title: t('loginHistory.ip'),
			dataIndex: 'ip',
			key: 'ip',
			render: (v: string | undefined) => <span className="font-mono text-xs">{v || '-'}</span>,
		},
		{
			title: (
				<span className="flex items-center gap-1">
					<Monitor size={14} />
					{t('loginHistory.device')}
				</span>
			),
			key: 'device',
			render: (_: unknown, item: AuditLogItem) => {
				const ua = uaOf(item.userAgent);
				const text = `${ua.browser} ${ua.os}`.trim() || t('loginHistory.unknownDevice');
				return (
					<span className="inline-block max-w-[200px] truncate" title={text}>
						{text}
					</span>
				);
			},
		},
		{
			title: t('loginHistory.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string | undefined) => {
				const kind = auditStatusKind(v);
				// 空值三态：'' / undefined 既不算成功也不算失败 → 中性「—」（与 CSV 同一判定点）。
				if (kind === 'unknown') {
					return <span className="text-xs text-neutral-600">—</span>;
				}
				const isSuccess = kind === 'success';
				return (
					<StatusBadge variant={STATUS_VARIANTS[isSuccess ? 'success' : 'failed']}>
						{isSuccess ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
						{isSuccess ? t('loginHistory.statusSuccess') : t('loginHistory.statusFailed')}
					</StatusBadge>
				);
			},
		},
		{
			title: t('loginHistory.reason'),
			dataIndex: 'reason',
			key: 'reason',
			render: (v: string | undefined, item: AuditLogItem) => (
				<span className="text-xs">
					{auditStatusKind(item.status) === 'failed'
						? v || t('loginHistory.unknownReason')
						: '-'}
				</span>
			),
		},
	];

	return (
		<div className="space-y-6">
			<AppPageHeader
				title={t('loginHistory.title')}
				description={t('loginHistory.subtitle')}
				actions={
					<button
						onClick={handleExportCSV}
						disabled={total === 0 || exporting}
						className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
					>
						<Download size={14} />
						{t('loginHistory.export')}
					</button>
				}
			/>

			{/* Filters */}
			<SectionCard
				padding="sm"
				className="flex flex-wrap items-center gap-3"
			>
				<div className="flex items-center gap-1 rounded-md bg-neutral-100 p-0.5">
					{(['all', 'success', 'failed'] as const).map((f) => (
						<button
							key={f}
							aria-pressed={statusFilter === f}
							onClick={() => {
								setStatusFilter(f);
								setPage(1);
							}}
							className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
								statusFilter === f
									? 'bg-white text-neutral-900 shadow-sm'
									: 'text-neutral-600 hover:text-neutral-700'
							}`}
						>
							{f === 'all'
								? t('loginHistory.filterAll')
								: f === 'success'
									? t('loginHistory.filterSuccess')
									: t('loginHistory.filterFailed')}
						</button>
					))}
				</div>
				<div className="h-5 w-px bg-neutral-200" />
				{/* 两个原生 date 输入 → 设计系统的区间件。原来「开始日期 / 结束日期」是两个独立标签，
					现在这两个文案变成区间件的两个占位符（同一批 i18n 键，语义不变）。 */}
				<DateRangeFilter
					size="small"
					placeholder={[t('loginHistory.startDate'), t('loginHistory.endDate')]}
					value={startDate && endDate ? [startDate, endDate] : null}
					onChange={(v) => {
						setStartDate(v?.[0] ?? '');
						setEndDate(v?.[1] ?? '');
						setPage(1);
					}}
				/>
				{/* 关键词检索（UP-100）：服务端按 IP / 设备 / 详情全文匹配，防抖后入参。 */}
				<div className="relative">
					<Search
						size={14}
						className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
					/>
					<input
						type="text"
						value={keywordInput}
						onChange={(e) => setKeywordInput(e.target.value)}
						placeholder={t('loginHistory.searchPlaceholder')}
						aria-label={t('loginHistory.searchPlaceholder')}
						className="h-8 w-56 rounded-md border border-neutral-300 bg-white pl-8 pr-2 text-xs text-neutral-900 placeholder:text-[var(--color-text-muted)] focus:border-primary-500 focus:outline-none"
					/>
				</div>
			</SectionCard>

			{/* 列定义只描述「这一页有哪些列」；表头 / 悬浮态 / 边框 / 行高 / 分页外观
			    由设计系统下发的组件级令牌决定，与其它三个门户同源。 */}
			{/* 原来「登录失败」整行铺一层浅色底 —— 那是这一页唯一的危险信号，rowClassName 保留该行为。
			    原来「无数据」也不是表体里的占位 <tr>，而是表格外的一整块（图标 + 文案）；
			    整块放进 emptyText 才能一条不丢地搬过来。 */}
			<DataTable<AuditLogItem>
				rowKey={(r, i) => r.id || String(i)}
				columns={columns}
				dataSource={items}
				scroll={{ x: 'max-content' }}
				rowClassName={(r) => (r.status === 'failed' ? 'bg-danger-soft' : '')}
				locale={{
					emptyText: (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<History size={40} className="text-neutral-300" />
							<p className="mt-4 text-sm text-neutral-600">
								{hasFilters ? t('loginHistory.noMatchingRecords') : t('loginHistory.empty')}
							</p>
						</div>
					),
				}}
				pagination={{
					current: page,
					pageSize,
					total,
					// UP-28：尺寸切换（antd 在 total>50 时显示）必须真实生效，旧实现吞掉第二个回调参数。
					onChange: (p: number, ps: number) => {
						setPage(p);
						if (ps !== pageSize) setPageSize(ps);
					},
					// 原来的手写翻页只在超过一页时才出现；hideOnSinglePage 保留这个行为。
					hideOnSinglePage: true,
				}}
			/>
		</div>
	);
}
