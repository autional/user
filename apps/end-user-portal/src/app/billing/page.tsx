'use client';

import { useState } from 'react';
import { SectionCard, AppPageHeader, ErrorState, EmptyState, StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';
import { useTranslation } from 'react-i18next';
import { isNotFoundError } from '@/lib/api-error';
import {
	useBillingSubscription,
	useBillingRecords,
	useBillingUsage,
	useBillingStatistics,
	usePublicPlans,
} from '@/hooks/queries';
// 行的形状**只有一份**：由 hooks 导出。此前本页自己声明过一个等价接口，那是第二份定义，
// 后端的字段一改就会有一边跟不上（而类型检查不会报——两边各自成立）。
import type { BillingRecordItem } from '@/hooks/queries';
import { useTenant } from '@/hooks/use-tenant';
import { Link } from 'react-router';
import { useTenantSlug } from '@autional/shared';
import { ROUTES } from '@/lib/routes';
import { buildNavHref } from '@/lib/nav';

import {
	CreditCard,
	BarChart3,
	HardDrive,
	Users,
	Activity,
	Calendar,
	ShoppingBag,
	FileText,
	Receipt,
	ChevronRight,
} from 'lucide-react';


export default function BillingPage() {
	const { t } = useTranslation();
	const { currentTenantId } = useTenant();
	const tenantId = currentTenantId || '';
	const tenantSlug = useTenantSlug();

	const {
		data: sub,
		isLoading: subLoading,
		error: subError,
		refetch: refetchSub,
	} = useBillingSubscription(tenantId, !!tenantId);
	const { data: usage } = useBillingUsage(tenantId, !!tenantId);
	const { data: stats } = useBillingStatistics(tenantId, !!tenantId);
	// UP-54：用量分母需套餐真实配额，公开套餐列表含 quotas（见 PublicPlanResponse）。
	const { data: plansData } = usePublicPlans();

	const [page, setPage] = useState(1);
	const { data: records } = useBillingRecords(tenantId, { page, pageSize: 20 }, !!tenantId);

	if (subLoading)
		return (
			<div className="max-w-4xl mx-auto space-y-6">
				<SkeletonCard />
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<SkeletonCard />
					<SkeletonCard />
				</div>
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
		);

	if (subError) {
		if (isNotFoundError(subError)) {
			return (
				<EmptyState
					title={t('billing.empty', '暂无账单数据')}
					description={t('billing.emptyDesc', '当前租户尚未产生计费记录')}
				/>
			);
		}
		return (
			<ErrorState
				message={t('billing.loadError', '账单信息加载失败')}
				onRetry={() => refetchSub()}
			/>
		);
	}

	const planName = sub?.planId ?? '-';
	const planStatus = sub?.status ?? '-';
	const periodStart = sub?.currentPeriodStart
		? new Date(sub.currentPeriodStart).toLocaleDateString()
		: '-';
	const periodEnd = sub?.currentPeriodEnd
		? new Date(sub.currentPeriodEnd).toLocaleDateString()
		: '-';
	const billingCycle = sub?.billingCycle ?? '-';
	const amount = sub?.amount ?? 0;
	const currency = sub?.currency ?? 'CNY';
	const autoRenew = sub?.autoRenew ?? false;

	// UP-54：用量分母改接套餐真实配额（公开套餐 quotas，camelCaseKeys 后键为 camel 形），
	// 原硬编码 10000/100/100 与套餐无关联已退役；配额缺失/为 0（未设置）时该卡不画进度条。
	const currentPlan = (plansData?.items ?? []).find(
		(p) => (p.planId ?? p.plan ?? p.id) === sub?.planId,
	);
	const planQuotas = currentPlan?.quotas;
	const maxApiCalls =
		planQuotas?.maxApiRequests && planQuotas.maxApiRequests > 0
			? planQuotas.maxApiRequests
			: undefined;
	const maxStorage =
		planQuotas?.maxStorageGb && planQuotas.maxStorageGb > 0 ? planQuotas.maxStorageGb : undefined;
	const maxUsers = planQuotas?.maxUsers && planQuotas.maxUsers > 0 ? planQuotas.maxUsers : undefined;

	const apiPercent =
		maxApiCalls != null
			? Math.min(((usage?.apiCallsToday ?? 0) / maxApiCalls) * 100, 100)
			: null;
	const storagePercent =
		maxStorage != null ? Math.min(((usage?.storageGb ?? 0) / maxStorage) * 100, 100) : null;
	const usersPercent =
		maxUsers != null ? Math.min(((usage?.users ?? 0) / maxUsers) * 100, 100) : null;

	// 列定义：只描述「这一页有哪些列」。表头底色 / 悬浮态 / 边框 / 行高 / 分页外观，
	// 由设计系统下发的组件级令牌决定 —— 与控制台那 156 处 antd Table 吃的是同一份令牌。
	const columns: DataTableColumns<BillingRecordItem> = [
		{
			title: t('billing.invoiceNumber'),
			dataIndex: 'invoiceNumber',
			key: 'invoiceNumber',
			render: (v: string | undefined) => <span className="font-mono text-xs">{v ?? '-'}</span>,
		},
		{
			title: t('billing.recordType'),
			dataIndex: 'type',
			key: 'type',
			render: (v: string) => (
				<StatusBadge variant={recordTypeVariant(v)}>{t(recordTypeLabelKey(v))}</StatusBadge>
			),
		},
		{
			title: t('billing.amount'),
			dataIndex: 'amount',
			key: 'amount',
			align: 'right',
			render: (v: number | string | undefined) => (
				<span className="font-mono">
					{/* v 可能是字符串（后端 decimal 序列化）：String.toLocaleString 会忽略选项参数、
						千分位/两位小数全部落空（UP-56）。先 Number() 归一，并显式封顶两位小数。 */}
					¥{Number(v ?? 0).toLocaleString(undefined, {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2,
					})}
				</span>
			),
		},
		{
			title: t('billing.recordStatus'),
			dataIndex: 'status',
			key: 'status',
			align: 'center',
			render: (v: string | undefined) => (
				<StatusBadge variant={recordStatusVariant(v)}>{t(recordStatusLabelKey(v))}</StatusBadge>
			),
		},
		{
			title: t('billing.description'),
			dataIndex: 'description',
			key: 'description',
			render: (v: string | undefined) => (
				<span className="text-neutral-600 inline-block max-w-[200px] truncate">{v ?? '-'}</span>
			),
		},
		{
			title: t('billing.date'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			align: 'right',
			render: (v: string | undefined) => (
				<span className="text-neutral-600 text-xs">
					{v ? new Date(v).toLocaleDateString() : '-'}
				</span>
			),
		},
	];

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<AppPageHeader title={t('billing.title')} />

			{/* UP-57：订阅 / 发票 / 支付三路由原零站内入口，账单页补快速入口。 */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
				<EntryLink
					to={buildNavHref(ROUTES.billingSubscribe, tenantSlug)}
					icon={ShoppingBag}
					label={t('billing.subscribe.title')}
				/>
				<EntryLink
					to={buildNavHref(ROUTES.billingInvoices, tenantSlug)}
					icon={FileText}
					label={t('billing.invoices.title')}
				/>
				<EntryLink
					to={buildNavHref(ROUTES.payments, tenantSlug)}
					icon={Receipt}
					label={t('payments.title')}
				/>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<SectionCard>
					<div className="flex items-center gap-3 mb-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-md bg-info-soft text-info-text">
							<CreditCard size={20} />
						</div>
						<div>
							<p className="text-sm text-neutral-600">{t('billing.currentSubscription')}</p>
							<p className="text-lg font-semibold capitalize">{planName}</p>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3 text-sm">
						<div>
							<span className="text-neutral-600">{t('billing.status')}</span>
							<p className="font-medium">
								<span
									className={`inline-block px-2 py-0.5 rounded text-xs ${planStatus === 'active' ? 'bg-success-soft text-success' : planStatus === 'trial' ? 'bg-info-soft text-info' : planStatus === 'cancelled' ? 'bg-danger-soft text-danger' : planStatus === 'past_due' ? 'bg-warning-soft text-warning-text' : 'bg-neutral-200 text-neutral-600'}`}
								>
									{t(
										planStatus === 'active'
											? 'billing.statusLabels.active'
											: planStatus === 'trial'
												? 'billing.statusLabels.trial'
												: planStatus === 'cancelled'
													? 'billing.statusLabels.cancelled'
													: planStatus === 'past_due'
														? 'billing.statusLabels.pastDue'
														: planStatus,
									)}
								</span>
							</p>
						</div>
						<div>
							<span className="text-neutral-600">{t('billing.billingCycle')}</span>
							<p className="font-medium capitalize">
								{t(
									billingCycle === 'monthly'
										? 'billing.cycleLabels.monthly'
										: billingCycle === 'yearly'
											? 'billing.cycleLabels.yearly'
											: billingCycle,
								)}
							</p>
						</div>
						<div>
							<span className="text-neutral-600">{t('billing.amount')}</span>
							<p className="font-medium">
								{currency === 'CNY' ? '¥' : ''}
								{amount.toLocaleString()}/
								{billingCycle === 'yearly' ? t('billing.perYear') : t('billing.perMonth')}
							</p>
						</div>
						<div>
							<span className="text-neutral-600">{t('billing.autoRenew')}</span>
							<p className={`font-medium ${autoRenew ? 'text-success-text' : 'text-neutral-600'}`}>
								{autoRenew ? t('billing.autoRenewEnabled') : t('billing.autoRenewDisabled')}
							</p>
						</div>
					</div>
					<div className="mt-3 pt-3 border-t text-xs text-neutral-600 flex items-center gap-1">
						<Calendar size={12} />
						{periodStart} ~ {periodEnd}
					</div>
				</SectionCard>

				{stats && (
					<SectionCard>
						<div className="flex items-center gap-3 mb-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-md bg-chart-7/10 text-chart-7">
								<BarChart3 size={20} />
							</div>
							<div>
								<p className="text-sm text-neutral-600">{t('billing.spendingStats')}</p>
								<p className="text-lg font-semibold">
									{stats.totalSpend != null ? (
										<>
											{currency === 'CNY' ? '¥' : ''}
											{Number(stats.totalSpend).toLocaleString()}
										</>
									) : (
										<span className="text-neutral-500">
											{t('billing.statsUnavailable', '暂不可用')}
										</span>
									)}
								</p>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3 text-sm">
							<div>
								<span className="text-neutral-600">{t('billing.mrr')}</span>
								<p className="font-medium">
									{stats.mrr != null ? (
										<>
											{currency === 'CNY' ? '¥' : ''}
											{Number(stats.mrr).toLocaleString()}
										</>
									) : (
										<span className="text-neutral-500">
											{t('billing.statsUnavailable', '暂不可用')}
										</span>
									)}
								</p>
							</div>
							<div>
								<span className="text-neutral-600">{t('billing.activeUsers')}</span>
								<p className="font-medium">{stats.activeUsers ?? 0}</p>
							</div>
							<div>
								<span className="text-neutral-600">{t('billing.retentionRate')}</span>
								<p className="font-medium">
									{stats.retentionRate != null ? (
										`${(stats.retentionRate * 100).toFixed(1)}%`
									) : (
										<span className="text-neutral-500">
											{t('billing.statsUnavailable', '暂不可用')}
										</span>
									)}
								</p>
							</div>
						</div>
						{(stats.totalSpend == null ||
							stats.mrr == null ||
							stats.retentionRate == null) && (
							<p className="mt-3 pt-3 border-t text-xs text-neutral-500">
								{t('billing.statsUnavailableHint', '「暂不可用」项待计费服务提供数据后开放')}
							</p>
						)}
					</SectionCard>
				)}
			</div>

			{/* 2026-08-17 修复：usage 404（无用量数据）由 useBillingUsage 转为空态（data=undefined），
			    此处始终渲染 usage 区块，字段用 ?? 0 落空态 —— 不再隐藏区块也不显示"加载失败"。 */}
			<div>
				<h2 className="text-lg font-semibold mb-3">{t('billing.usageOverview')}</h2>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<UsageCard
						icon={<Activity className="w-5 h-5 text-info" />}
						label={t('billing.apiCalls')}
						value={usage?.apiCallsToday?.toLocaleString() ?? '0'}
						max={maxApiCalls}
						percent={apiPercent}
					/>
					<UsageCard
						icon={<HardDrive className="w-5 h-5 text-chart-7" />}
						label={t('billing.storageUsage')}
						value={`${(usage?.storageGb ?? 0).toLocaleString()} GB`}
						max={maxStorage}
						percent={storagePercent}
						unit="GB"
					/>
					<UsageCard
						icon={<Users className="w-5 h-5 text-success" />}
						label={t('billing.usageUsers')}
						value={`${(usage?.users ?? 0).toLocaleString()}`}
						max={maxUsers}
						percent={usersPercent}
					/>
				</div>
			</div>

			<div>
				<h2 className="text-lg font-semibold mb-3">{t('billing.billingRecords')}</h2>
				<DataTable<BillingRecordItem>
					rowKey={(r, i) => r.recordId ?? String(i)}
					columns={columns}
					dataSource={records?.items ?? []}
					scroll={{ x: 'max-content' }}
					locale={{ emptyText: t('billing.noRecords') }}
					pagination={{
						current: page,
						pageSize: 20,
						total: records?.total ?? 0,
						onChange: setPage,
						// 原来的手写翻页只在 total > 20 时出现；hideOnSinglePage 保留「不足一页不显示分页条」。
						hideOnSinglePage: true,
					}}
				/>
			</div>
		</div>
	);
}

function EntryLink({
	to,
	icon: Icon,
	label,
}: {
	to: string;
	icon: typeof CreditCard;
	label: string;
}) {
	return (
		<Link
			to={to}
			className="flex items-center gap-3 rounded-lg border bg-white p-4 hover:bg-neutral-50 transition-colors"
		>
			<span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
				<Icon size={18} />
			</span>
			<span className="flex-1 text-sm font-medium">{label}</span>
			<ChevronRight size={16} className="text-neutral-500" />
		</Link>
	);
}

function UsageCard({
	icon,
	label,
	value,
	max,
	percent,
	unit,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	// UP-54：max/percent 可空 —— 套餐配额缺失时不画进度条（无分母的百分比无意义），只报用量。
	max?: number;
	percent: number | null;
	unit?: string;
}) {
	const { t } = useTranslation();
	return (
		<SectionCard padding="sm">
			<div className="flex items-center gap-2 mb-3">
				{icon}
				<span className="text-sm text-neutral-600">{label}</span>
			</div>
			<div className="text-xl font-bold mb-2">{value}</div>
			{max != null && percent != null ? (
				<>
					<div className="w-full bg-neutral-200 rounded-full h-2 mb-1">
						<div
							className={`h-2 rounded-full transition-all ${percent > 80 ? 'bg-danger' : percent > 60 ? 'bg-warning' : 'bg-success'}`}
							style={{ width: `${Math.max(percent, 2)}%` }}
						/>
					</div>
					<div className="text-xs text-neutral-600">
						{value} / {max.toLocaleString()}
						{unit ? ` ${unit}` : ''} ({percent.toFixed(1)}%)
					</div>
					{percent > 80 && (
						<p className="mt-1 text-xs font-medium text-danger-text">
							{t('billing.quotaWarning', '用量已达配额的 80% 以上，请留意扩容')}
						</p>
					)}
				</>
			) : (
				<p className="text-xs text-neutral-500">{t('billing.quotaUnset', '未设置配额上限')}</p>
			)}
		</SectionCard>
	);
}

const recordTypeLabels: Record<string, string> = {
	subscription: 'billing.recordTypes.subscription',
	invoice: 'billing.recordTypes.invoice',
	payment: 'billing.recordTypes.payment',
	refund: 'billing.recordTypes.refund',
	credit: 'billing.recordTypes.credit',
	adjustment: 'billing.recordTypes.adjustment',
};

// 记录类型 → 设计系统徽标档位。**只做映射，不做样式**。
// 原表这里是 6 套裸色阶，其中 purple / cyan / orange 根本不在设计系统的色阶里 ——
// 同一件事在四个 portal 各有各的写法，也没有任何一套做过对比度验证。
// 类型是「分类」不是状态，所以按原色阶的语义族归档：绿→success、蓝/青→info、紫/灰→neutral；
// refund 取 info，是为了跟本页 recordStatus 的 refunded、以及发票页的 refunded 落在同一档。
const RECORD_TYPE_VARIANTS: Record<string, StatusVariant> = {
	subscription: 'info',
	invoice: 'neutral',
	payment: 'success',
	refund: 'info',
	credit: 'info',
	adjustment: 'neutral',
};

const recordStatusLabels: Record<string, string> = {
	paid: 'billing.recordStatusLabels.paid',
	pending: 'billing.recordStatusLabels.pending',
	failed: 'billing.recordStatusLabels.failed',
	refunded: 'billing.recordStatusLabels.refunded',
	cancelled: 'billing.recordStatusLabels.cancelled',
};

// 记录状态 → 设计系统徽标档位。档位与发票页的 STATUS_VARIANTS 逐项对齐，
// 免得「已退款」在两个页面是两个颜色。
const RECORD_STATUS_VARIANTS: Record<string, StatusVariant> = {
	paid: 'success',
	pending: 'warning',
	failed: 'danger',
	refunded: 'info',
	cancelled: 'neutral',
};

function recordTypeLabelKey(t: string) {
	return recordTypeLabels[t] ?? t;
}
function recordTypeVariant(t: string): StatusVariant {
	return RECORD_TYPE_VARIANTS[t] ?? 'neutral';
}
function recordStatusLabelKey(s: string | undefined) {
	return recordStatusLabels[s ?? ''] ?? s ?? '-';
}
function recordStatusVariant(s: string | undefined): StatusVariant {
	return RECORD_STATUS_VARIANTS[s ?? ''] ?? 'neutral';
}
