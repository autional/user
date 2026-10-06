'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Eye } from 'lucide-react';
import { ConsolePageHeader, ErrorState, EmptyState, Modal, StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { usePayments, useReceipt, type PaymentInfo } from '@/hooks/queries';

// 状态 → 设计系统徽标档位。只做映射，配色归设计系统（-soft/-text 是成对的、做过对比度验证）。
// 原来这里是 7 条裸色阶（bg-amber-100 text-amber-700 之类）：配色散在业务侧，而且那套色阶
// 每一档的底色/文字都各写各的，没有一对做过对比度验证，而且裸色阶没有 dark: 变体——深色模式下底色照样是浅的。
// 值域与 service-pay 对齐（created/processing/succeeded/failed/expired，UP-65；
// 其余为历史/兼容档，保留映射不误标）。
const STATUS_VARIANTS: Record<string, StatusVariant> = {
	created: 'warning',
	pending: 'warning',
	processing: 'info',
	succeeded: 'success',
	completed: 'success',
	paid: 'success',
	failed: 'danger',
	cancelled: 'neutral',
	expired: 'neutral',
	refunded: 'info',
};

export default function PaymentsPage() {
	const { t } = useTranslation();
	const [page, setPage] = useState(1);
	// UP-66：弹窗日期必须用支付行的时间 —— 收据接口的 created_at 是收据生成时刻（=请求时刻，
	// 每次打开都变）；改为保存整行，日期取 paidAt（支付完成）优先、回落 createdAt（支付创建）。
	const [receiptPayment, setReceiptPayment] = useState<PaymentInfo | null>(null);
	const {
		data: paymentsData,
		isLoading,
		error: paymentsError,
		refetch: refetchPayments,
	} = usePayments({ page, pageSize: 20 });
	const { data: receipt } = useReceipt(receiptPayment?.paymentId || '');

	const payments = paymentsData?.items || [];

	const getStatusLabel = (status: string) => {
		const labels: Record<string, string> = {
			created: t('payments.status.created'),
			pending: t('payments.status.pending'),
			processing: t('payments.status.processing'),
			succeeded: t('payments.status.succeeded'),
			completed: t('payments.status.completed'),
			paid: t('payments.status.paid'),
			failed: t('payments.status.failed'),
			cancelled: t('payments.status.cancelled'),
			expired: t('payments.status.expired'),
			refunded: t('payments.status.refunded'),
		};
		// 未收录/空值中性兜底，不再裸出内部标识（UP-65 同族 T2）。
		return labels[status] || t('payments.status.unknown', '未知');
	};

	const getChannelLabel = (channel: string) => {
		const labels: Record<string, string> = {
			wechat: t('payments.channel.wechat'),
			alipay: t('payments.channel.alipay'),
			stripe: t('payments.channel.stripe'),
			mock: t('payments.channel.mock'),
		};
		return labels[channel] || t('payments.channel.unknown', '未知');
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
	if (paymentsError)
		return (
			<ErrorState
				message={t('payments.loadError', '支付记录加载失败')}
				onRetry={() => refetchPayments()}
			/>
		);
	if (!payments.length)
		return <EmptyState title={t('payments.emptyTitle')} description={t('payments.emptyDesc')} />;

	// 列定义：只描述**这一页有哪些列**。表头底色 / 悬浮态 / 边框 / 行高 / 分页外观，
	// 由设计系统下发的组件级令牌决定 —— 与四个 portal 里其它数据表吃的是同一份令牌。
	// 收据日期 = 支付时间（UP-66）：paidAt 优先，回落支付行 createdAt；不再读 receipt.createdAt。
	const receiptDate = receiptPayment?.paidAt || receiptPayment?.createdAt;

	const columns: DataTableColumns<PaymentInfo> = [
		{
			title: t('payments.date'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string | undefined) => (
				<span className="text-neutral-700">{v ? new Date(v).toLocaleDateString() : '-'}</span>
			),
		},
		{
			title: t('payments.amount'),
			dataIndex: 'amount',
			key: 'amount',
			align: 'right',
			render: (v: string | undefined) => (
				<span className="font-mono font-medium">{'¥' + parseFloat(v || '0').toFixed(2)}</span>
			),
		},
		{
			title: t('payments.channelLabel'),
			dataIndex: 'channelCode',
			key: 'channelCode',
			render: (v: string | undefined) => (
				<span className="text-neutral-700">{getChannelLabel(v || '')}</span>
			),
		},
		{
			title: t('payments.statusLabel'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string | undefined) => (
				<StatusBadge variant={STATUS_VARIANTS[v || ''] || 'neutral'}>{getStatusLabel(v || '')}</StatusBadge>
			),
		},
		{
			title: t('payments.description'),
			dataIndex: 'itemDescription',
			key: 'itemDescription',
			render: (v: string | undefined) => (
				<span className="text-neutral-600 inline-block max-w-[200px] truncate">{v || '-'}</span>
			),
		},
		{
			title: t('payments.actions'),
			key: 'actions',
			align: 'right',
			render: (_: unknown, p: PaymentInfo) => (
				<button
					onClick={() => setReceiptPayment(p)}
					className="inline-flex items-center gap-1 text-[var(--color-brand)] hover:text-primary-600 text-sm font-medium"
				>
					<Eye className="w-4 h-4" />
					{t('payments.receipt')}
				</button>
			),
		},
	];

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<ConsolePageHeader title={t('payments.title')} />

			{/* 外面那层 overflow-x-auto rounded-lg border 由 DataTable 自带容器接管，不再手拼。
				rowKey 兜下标：paymentId 缺失时若统一兜成 '-' 会让多行同 key（React 会告警）。 */}
			<DataTable<PaymentInfo>
				rowKey={(r, i) => r.paymentId ?? String(i)}
				columns={columns}
				dataSource={payments}
				scroll={{ x: 'max-content' }}
				locale={{
					// 原来表体里那行 colSpan 占位（图标 + 文案）整体搬进 locale，不再手写占位 <tr>
					emptyText: (
						<div className="py-4 text-center text-neutral-600">
							<CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
							{t('payments.empty')}
						</div>
					),
				}}
				pagination={{
					current: page,
					pageSize: 20,
					total: paymentsData?.total || 0,
					onChange: setPage,
					// 原手写翻页只在 total > 20 时出现；hideOnSinglePage 保留「不足一页不显示分页条」这一行为
					hideOnSinglePage: true,
				}}
			/>

			{/* Receipt Modal */}
			<Modal
				open={receiptPayment !== null && !!receipt}
				onClose={() => setReceiptPayment(null)}
				title={t('payments.receiptTitle')}
				maxWidth="md"
				footer={
					<button
						onClick={() => setReceiptPayment(null)}
						className="w-full py-2.5 rounded-lg bg-[var(--color-brand)] text-white font-medium hover:bg-primary-600 transition-colors"
					>
						{t('common.close')}
					</button>
				}
			>
				{receipt ? (
					<div className="space-y-3 text-sm">
						<ReceiptRow
							label={t('payments.receiptNumber')}
							value={receipt.receiptNumber}
						/>
						<ReceiptRow
							label={t('payments.amount')}
							value={`¥${parseFloat(receipt.amount || '0').toFixed(2)}`}
							bold
						/>
						<ReceiptRow
							label={t('payments.paymentChannel')}
							value={getChannelLabel(receipt.channelCode)}
						/>
						<ReceiptRow
							label={t('payments.date')}
							value={receiptDate ? new Date(receiptDate).toLocaleDateString() : '-'}
						/>
						<ReceiptRow
							label={t('payments.itemDescription')}
							value={receipt.itemDescription || '-'}
						/>
					</div>
				) : null}
			</Modal>
		</div>
	);
}

function ReceiptRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
	return (
		<div className="flex justify-between py-1.5 border-b border-neutral-200">
			<span className="text-neutral-600">{label}</span>
			<span className={bold ? 'font-bold text-neutral-900' : 'text-neutral-800'}>{value}</span>
		</div>
	);
}
