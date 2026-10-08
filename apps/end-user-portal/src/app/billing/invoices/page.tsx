'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Download, Loader2 } from 'lucide-react';
import { AppPageHeader, ErrorState, EmptyState, StatusBadge, Modal } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { useTenant } from '@/hooks/use-tenant';
import { useInvoices, useInvoice } from '@/hooks/queries';
import type { BillingRecord, InvoiceLineItem } from '@/hooks/queries';
import { apiClient, extractApiErrorMessage } from '@autional/shared';
import { useToast } from '@/hooks/use-toast';

// 状态 → 设计系统徽标档位。这里**只做映射，不做样式**。
// 此前每个状态各写一套裸色阶（bg-success-soft text-success-text / bg-amber-100 …）：
// 那是又一处「同一个概念在四个 portal 各有各的写法」，而且裸色阶里没有一套做过对比度验证。
// StatusBadge 的 -soft / -text 是**成对**的，每一对的对比度都验过（success 5.51 / warning 4.85 /
// danger 4.65 / info 6.70）。所以映射表留在业务侧（哪个状态算成功是业务语义），配色归设计系统。
const STATUS_VARIANTS: Record<string, StatusVariant> = {
	paid: 'success',
	pending: 'warning',
	overdue: 'danger',
	cancelled: 'neutral',
	refunded: 'info',
};

const money = (v: string | number | undefined) => '¥' + parseFloat(String(v ?? '0')).toFixed(2);
const fmtDate = (v: string | undefined) => (v ? new Date(v).toLocaleDateString() : '-');

export default function InvoicesPage() {
	const { t } = useTranslation();
	const toast = useToast();
	const { currentTenantId } = useTenant();
	const tenantId = currentTenantId || '';
	const [page, setPage] = useState(1);
	const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
	const [exportingPdf, setExportingPdf] = useState(false);

	// UP-63：原裸链 href 缺 /bff 前缀与租户 slug（user 域 SPA 404）；改带鉴权头的 apiClient 取 blob。
	const handleExportPdf = async () => {
		if (!selectedInvoice) return;
		setExportingPdf(true);
		try {
			const res = await apiClient.get(
				`/billing/api/v1/billing/invoice/${encodeURIComponent(selectedInvoice)}/pdf`,
				{ responseType: 'blob' },
			);
			const url = URL.createObjectURL(res.data as Blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `invoice-${selectedInvoice}.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			toast.error(extractApiErrorMessage(err, t('billing.invoices.exportError')));
		} finally {
			setExportingPdf(false);
		}
	};
	const {
		data: invoicesData,
		isLoading,
		error: invoicesError,
		refetch: refetchInvoices,
	} = useInvoices(tenantId, { page, pageSize: 20 });
	const { data: invoiceDetail } = useInvoice(selectedInvoice || '');

	const invoices = invoicesData?.items || [];

	const getStatusLabel = (status: string) => {
		const labels: Record<string, string> = {
			paid: t('billing.invoices.status.paid'),
			pending: t('billing.invoices.status.pending'),
			overdue: t('billing.invoices.status.overdue'),
			cancelled: t('billing.invoices.status.cancelled'),
			refunded: t('billing.invoices.status.refunded'),
		};
		return labels[status] || status;
	};

	if (isLoading)
		return (
			<div className="max-w-4xl mx-auto space-y-6">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
		);
	if (invoicesError)
		return (
			<ErrorState
				message={t('billing.invoices.loadError', '发票列表加载失败')}
				onRetry={() => refetchInvoices()}
			/>
		);
	if (!invoices.length)
		return (
			<EmptyState
				title={t('billing.invoices.emptyTitle')}
				description={t('billing.invoices.emptyDesc')}
			/>
		);

	// 列定义：只描述**这一页有哪些列**，外观（表头底色 / 悬浮态 / 边框 / 行高 / 分页样式）
	// 由设计系统下发的组件级令牌决定 —— 控制台那 156 处 antd Table 吃的是同一份令牌。
	const columns: DataTableColumns<BillingRecord> = [
		{
			title: t('billing.invoices.invoiceNumber'),
			dataIndex: 'invoiceNumber',
			key: 'invoiceNumber',
			render: (v: string | undefined) => <span className="font-mono text-xs">{v || '-'}</span>,
		},
		{
			title: t('billing.invoices.amount'),
			dataIndex: 'amount',
			key: 'amount',
			align: 'right',
			render: (v: string | undefined) => <span className="font-mono font-medium">{money(v)}</span>,
		},
		{
			title: t('billing.invoices.plan'),
			dataIndex: 'plan',
			key: 'plan',
			render: (v: string | undefined) => v || '-',
		},
		{
			title: t('billing.invoices.statusLabel'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string | undefined) => (
				<StatusBadge variant={STATUS_VARIANTS[v || ''] || 'neutral'}>{getStatusLabel(v || '')}</StatusBadge>
			),
		},
		{
			title: t('billing.invoices.date'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string | undefined) => <span className="text-neutral-600 text-xs">{fmtDate(v)}</span>,
		},
		{
			title: t('billing.invoices.actions'),
			key: 'actions',
			align: 'right',
			render: (_: unknown, inv: BillingRecord) => (
				<button
					onClick={() => setSelectedInvoice(inv.invoiceNumber || '')}
					className="inline-flex items-center gap-1 text-[var(--color-brand)] hover:text-primary-600 text-sm font-medium"
				>
					<Eye className="w-4 h-4" />
					{t('billing.invoices.detail')}
				</button>
			),
		},
	];

	const itemColumns: DataTableColumns<InvoiceLineItem> = [
		{ title: t('billing.invoices.item'), dataIndex: 'description', key: 'description' },
		{
			title: t('billing.invoices.quantity'),
			dataIndex: 'quantity',
			key: 'quantity',
			align: 'right',
		},
		{
			title: t('billing.invoices.unitPrice'),
			dataIndex: 'unitPrice',
			key: 'unitPrice',
			align: 'right',
			render: (v: string | undefined) => <span className="font-mono">{money(v)}</span>,
		},
		{
			title: t('billing.invoices.amount'),
			dataIndex: 'amount',
			key: 'amount',
			align: 'right',
			render: (v: string | undefined) => <span className="font-mono font-medium">{money(v)}</span>,
		},
	];

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<AppPageHeader title={t('billing.invoices.title')} />

			{/* rowKey 用 id 兜 invoiceNumber：两者都可能为空，兜底成 '-' 会让多行同 key（React 会告警）。
			   此处 id 是后端主键，invoiceNumber 只是展示字段。 */}
			<DataTable<BillingRecord>
				rowKey={(r) => r.id || r.invoiceNumber || '-'}
				columns={columns}
				dataSource={invoices}
				scroll={{ x: 'max-content' }}
				pagination={{
					current: page,
					pageSize: 20,
					total: invoicesData?.total || 0,
					onChange: setPage,
					// 原来的手写翻页只在超过一页时才出现；这个行为要保留，否则会出现一行都没有的分页条。
					hideOnSinglePage: true,
				}}
			/>

			{/* Invoice Detail Modal */}
			{/* 卡片上的 max-h/overflow 是原浮层自带的滚动约束：明细里嵌着 DataTable，不保留会把弹窗顶出视口且滚不到 */}
			<Modal
				open={!!selectedInvoice && !!invoiceDetail}
				onClose={() => setSelectedInvoice(null)}
				title={t('billing.invoices.detailTitle')}
				maxWidth="lg"
				className="max-h-[80vh] overflow-y-auto"
				footer={
					<button
						onClick={() => setSelectedInvoice(null)}
						className="w-full mt-6 py-2.5 rounded-lg bg-[var(--color-brand)] text-white font-medium hover:bg-primary-600 transition-colors"
					>
						{t('common.close')}
					</button>
				}
			>
				{/* Modal 的 open 只决定运行时不渲染，收不回 invoiceDetail 的类型收窄；这里保留一层判空，正文一个字不动 */}
				{invoiceDetail && (
					<div className="space-y-4 text-sm">
						<div className="grid grid-cols-2 gap-3">
							<Field label={t('billing.invoices.invoiceNumber')}>
								<span className="font-mono font-medium">{invoiceDetail.invoiceNumber || '-'}</span>
							</Field>
							<Field label={t('billing.invoices.statusLabel')}>
								<StatusBadge variant={STATUS_VARIANTS[invoiceDetail.status || ''] || 'neutral'}>
									{getStatusLabel(invoiceDetail.status || '')}
								</StatusBadge>
							</Field>
							<Field label={t('billing.invoices.plan')}>
								<span className="font-medium">{invoiceDetail.plan || '-'}</span>
							</Field>
							<Field label={t('billing.invoices.billingCycle')}>
								<span className="font-medium">{invoiceDetail.billingCycle || '-'}</span>
							</Field>
							<Field label={t('billing.invoices.createdAt')}>{fmtDate(invoiceDetail.createdAt)}</Field>
							<Field label={t('billing.invoices.dueDate')}>{fmtDate(invoiceDetail.dueDate)}</Field>
							{invoiceDetail.paidAt && (
								<Field label={t('billing.invoices.paidAt')}>
									<span className="text-success-text">{fmtDate(invoiceDetail.paidAt)}</span>
								</Field>
							)}
						</div>

						{invoiceDetail.items && invoiceDetail.items.length > 0 && (
							<div>
								<h3 className="font-semibold text-sm mb-2">{t('billing.invoices.itemsTitle')}</h3>
								{/* 合计行用 DataTable.Summary（antd 的复合成员）——
								    这正是 DS 必须透传复合成员的理由：不透传，消费方就只能自己拼裸 <tr>/<td>。 */}
								<DataTable<InvoiceLineItem>
									rowKey={(r, i) => r.description + '-' + (i ?? 0)}
									columns={itemColumns}
									dataSource={invoiceDetail.items}
									pagination={false}
									size="small"
									scroll={{ x: 'max-content' }}
									summary={() => (
										<DataTable.Summary.Row>
											<DataTable.Summary.Cell index={0} colSpan={3}>
												<span className="font-bold block text-right">{t('billing.invoices.total')}</span>
											</DataTable.Summary.Cell>
											<DataTable.Summary.Cell index={1} align="right">
												<span className="font-mono font-bold">{money(invoiceDetail.amount)}</span>
											</DataTable.Summary.Cell>
										</DataTable.Summary.Row>
									)}
								/>
							</div>
						)}

						{selectedInvoice && (
							<button
								onClick={handleExportPdf}
								disabled={exportingPdf}
								className="inline-flex items-center gap-2 text-sm text-[var(--color-brand)] hover:text-primary-600 font-medium disabled:opacity-60"
							>
								{exportingPdf ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Download className="w-4 h-4" />
								)}
								{t('billing.invoices.exportPdf')}
							</button>
						)}
					</div>
				)}
			</Modal>
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-neutral-600 text-xs">{label}</div>
			{children}
		</div>
	);
}
