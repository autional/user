'use client';

import { useState } from 'react';
import { useAuth } from '@autional/shared';
import { Alert, SectionCard, AppPageHeader, ErrorState, EmptyState, StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';
import { useTranslation } from 'react-i18next';
import { isWalletNotCreatedError } from '@/lib/api-error';
import { useQueries } from '@tanstack/react-query';
import {
	useWalletTransactions,
	useRedeemCoupon,
	useCreateWallet,
	queryKeys,
	getWalletBalance,
	getWalletStats,
	getWalletCoupons,
	getWalletBalanceHistory,
} from '@/hooks/queries';
import type { WalletTransactionItem, BalanceHistoryItem } from '@/hooks/queries';
import {
	Wallet,
	Snowflake,
	Receipt,
	TrendingUp,
	TrendingDown,
	Ticket,
	ArrowRightLeft,
} from 'lucide-react';

export default function WalletPage() {
	const { t } = useTranslation();
	const { userId } = useAuth();

	const [balanceQuery, statsQuery, couponsQuery, historyQuery] = useQueries({
		queries: [
			{
				queryKey: queryKeys.wallet(userId || ''),
				queryFn: () => getWalletBalance(userId || ''),
				enabled: !!userId,
				retry: 1,
			},
			{
				queryKey: queryKeys.walletStats(userId || ''),
				queryFn: async () => {
					const r = await getWalletStats(userId || '');
					return r.data;
				},
				enabled: !!userId,
				retry: 1,
			},
			{
				queryKey: queryKeys.walletCoupons(userId || ''),
				queryFn: () => getWalletCoupons(userId || ''),
				enabled: !!userId,
				retry: 1,
			},
			{
				queryKey: queryKeys.walletBalanceHistory(userId || ''),
				queryFn: () => getWalletBalanceHistory(userId || ''),
				enabled: !!userId,
				retry: 1,
			},
		],
	});

	const {
		data: balance,
		isLoading: balanceLoading,
		error: balanceError,
		refetch: refetchBalance,
	} = balanceQuery;
	const { data: stats } = statsQuery;
	const { data: coupons } = couponsQuery;
	const { data: history } = historyQuery;
	const walletId = balance?.walletId;

	const [page, setPage] = useState(1);
	const [couponCode, setCouponCode] = useState('');
	const { data: txs } = useWalletTransactions(userId || '', { page, pageSize: 20 }, !!userId);
	const redeemQ = useRedeemCoupon();
	// 开通钱包：成功后 hook 失效钱包查询 → useQueries 余额查询自动重拉，页面转为正常态。
	const createWallet = useCreateWallet();

	if (balanceLoading)
		return (
			<div className="max-w-4xl mx-auto space-y-6">
				<SkeletonCard />
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
				</div>
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
		);

	if (balanceError) {
		// 404 细分（AC-05-2/05-3）：仅 61060101 走「空态 + 开通钱包 CTA」；其他 404/错误保持错误态。
		if (isWalletNotCreatedError(balanceError)) {
			return (
				<div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
					<EmptyState
						title={t('wallet.empty', '暂无钱包数据')}
						description={t('wallet.emptyDesc', '当前账户尚未开通钱包，开通后即可使用')}
					/>
					<div className="flex justify-center">
						<button
							type="button"
							onClick={() => userId && createWallet.mutate({ userId })}
							disabled={!userId || createWallet.isPending}
							className="rounded-lg bg-[var(--color-brand)] px-6 py-3 font-semibold text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							{createWallet.isPending
								? t('wallet.creatingWallet', '正在开通…')
								: t('wallet.createWallet', '开通钱包')}
						</button>
					</div>
				</div>
			);
		}
		return (
			<ErrorState message={t('wallet.loadError', '钱包信息加载失败')} onRetry={() => refetchBalance()} />
		);
	}

	const available = balance?.availableBalance ?? balance?.available ?? balance?.balance ?? '0';
	const frozen = balance?.frozenBalance ?? balance?.frozen ?? '0';
	const currency = balance?.currency ?? 'CNY';

	const handleRedeem = () => {
		if (!couponCode.trim() || !userId) return;
		redeemQ.mutate({ userId, code: couponCode.trim() });
		setCouponCode('');
	};

	// 列定义：只描述「这一页有哪些列」。表头底色 / 悬浮态 / 边框 / 行高 / 分页外观，
	// 由设计系统下发的组件级令牌决定 —— 与控制台那 156 处 antd Table 吃的是同一份令牌。
	const txColumns: DataTableColumns<WalletTransactionItem> = [
		{
			title: t('wallet.txType'),
			dataIndex: 'type',
			key: 'type',
			render: (v: string | undefined) => (
				<StatusBadge variant={txTypeVariant(v)}>{t(txTypeLabelKey(v))}</StatusBadge>
			),
		},
		{
			title: t('wallet.amount'),
			dataIndex: 'amount',
			key: 'amount',
			align: 'right',
			render: (v: string | undefined, tx: WalletTransactionItem) => {
				const incoming = isIncoming(tx.type);
				return (
					<span className={'font-mono ' + (incoming ? 'text-success-text' : 'text-danger-text')}>
						{(incoming ? '+' : '-') + '¥' + Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
					</span>
				);
			},
		},
		{
			title: t('wallet.remark'),
			dataIndex: 'description',
			key: 'description',
			render: (v: string | undefined) => (
				<span className="text-neutral-600 inline-block max-w-[200px] truncate">{v ?? '-'}</span>
			),
		},
		{
			title: t('wallet.status'),
			dataIndex: 'status',
			key: 'status',
			align: 'center',
			render: (v: string | undefined) => (
				<StatusBadge variant={txStatusVariant(v)}>{t(txStatusLabelKey(v))}</StatusBadge>
			),
		},
		{
			title: t('wallet.time'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			align: 'right',
			render: (v: string | undefined) => (
				<span className="text-neutral-600 text-xs">{v ? new Date(v).toLocaleDateString() : '-'}</span>
			),
		},
	];

	const historyColumns: DataTableColumns<BalanceHistoryItem> = [
		{ title: t('wallet.txType'), dataIndex: 'type', key: 'type' },
		{
			title: t('wallet.amount'),
			dataIndex: 'amount',
			key: 'amount',
			align: 'right',
			render: (v: string | undefined) => (
				<span className={'font-mono ' + (Number(v ?? 0) >= 0 ? 'text-success-text' : 'text-danger-text')}>
					{'¥' + Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
				</span>
			),
		},
		{
			title: t('wallet.balanceBefore'),
			dataIndex: 'balanceBefore',
			key: 'balanceBefore',
			align: 'right',
			render: (v: string | undefined) => (
				<span className="font-mono text-neutral-600">
					{'¥' + Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
				</span>
			),
		},
		{
			title: t('wallet.balanceAfter'),
			dataIndex: 'balanceAfter',
			key: 'balanceAfter',
			align: 'right',
			render: (v: string | undefined) => (
				<span className="font-mono text-neutral-800">
					{'¥' + Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
				</span>
			),
		},
		{
			title: t('wallet.date'),
			dataIndex: 'date',
			key: 'date',
			align: 'right',
			render: (v: string | undefined) => (
				<span className="text-neutral-600 text-xs">{v ? new Date(v).toLocaleDateString() : '-'}</span>
			),
		},
	];

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<AppPageHeader title={t('wallet.title')} />

			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<Card
					icon={<Wallet className="w-5 h-5 text-success" />}
					label={t('wallet.availableBalance')}
					value={`${currency === 'CNY' ? '¥' : ''}${Number(available).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
				/>
				<Card
					icon={<Snowflake className="w-5 h-5 text-info" />}
					label={t('wallet.frozenBalance')}
					value={`${currency === 'CNY' ? '¥' : ''}${Number(frozen).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
				/>
				<Card
					icon={<Receipt className="w-5 h-5 text-chart-7" />}
					label={t('wallet.currency')}
					value={currency}
				/>
				<Card
					icon={<Ticket className="w-5 h-5 text-amber-500" />}
					label={t('wallet.availableCoupons')}
					value={`${coupons?.total ?? coupons?.items?.length ?? 0} ${t('wallet.couponUnit')}`}
				/>
			</div>

			{stats && (
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					<StatBox
						label={t('wallet.transactionCount')}
						value={stats.transactionCount?.toLocaleString()}
						icon={<ArrowRightLeft className="w-4 h-4 text-info" />}
					/>
					<StatBox
						label={t('wallet.totalDeposits')}
						value={`¥${Number(stats.totalDeposits ?? 0).toLocaleString()}`}
						icon={<TrendingUp className="w-4 h-4 text-success" />}
					/>
					<StatBox
						label={t('wallet.totalWithdrawals')}
						value={`¥${Number(stats.totalWithdrawals ?? 0).toLocaleString()}`}
						icon={<TrendingDown className="w-4 h-4 text-danger" />}
					/>
					<StatBox
						label={t('wallet.avgTransaction')}
						value={`¥${Number(stats.averageTransaction ?? 0).toLocaleString()}`}
					/>
				</div>
			)}

			<div>
				<h2 className="text-lg font-semibold mb-3">{t('wallet.transactionHistory')}</h2>
				<DataTable<WalletTransactionItem>
					rowKey={(r, i) => r.id ?? String(i)}
					columns={txColumns}
					dataSource={txs?.items ?? []}
					scroll={{ x: 'max-content' }}
					locale={{ emptyText: t('wallet.noTransactions') }}
					pagination={{
						current: page,
						pageSize: 20,
						total: txs?.total ?? 0,
						onChange: setPage,
						// 原来的手写翻页只在超过一页时才出现；保留该行为，否则会出现只有一页的分页条。
						hideOnSinglePage: true,
					}}
				/>
			</div>

			{history && (history.items ?? []).length > 0 && (
				<div>
					<h2 className="text-lg font-semibold mb-3">{t('wallet.balanceHistory')}</h2>
					<DataTable<BalanceHistoryItem>
						rowKey={(r, i) => r.transactionId ?? String(i)}
						columns={historyColumns}
						dataSource={history.items ?? []}
						pagination={false}
						scroll={{ x: 'max-content' }}
					/>
				</div>
			)}

			{coupons && (
				<div>
					<h2 className="text-lg font-semibold mb-3">{t('wallet.coupons')}</h2>
					<div className="flex gap-2 mb-4">
						<input
							type="text"
							value={couponCode}
							onChange={(e) => setCouponCode(e.target.value)}
							placeholder={t('wallet.enterCouponCode')}
							className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
						/>
						<button
							onClick={handleRedeem}
							disabled={!couponCode.trim() || redeemQ.isPending}
							className="px-4 py-2 bg-[var(--color-brand)] text-white rounded-md text-sm font-medium disabled:opacity-50 hover:bg-[var(--color-brand)]/90 transition-colors"
						>
							{redeemQ.isPending ? t('wallet.redeeming') : t('wallet.redeem')}
						</button>
					</div>
					{redeemQ.isSuccess && (
						<Alert
							variant="success"
							className="mb-3 text-sm"
						>
							{t('wallet.redeemSuccess')}
						</Alert>
					)}
					{redeemQ.isError && (
						<Alert
							variant="danger"
							className="mb-3 text-sm"
						>
							{t('wallet.redeemError')}
						</Alert>
					)}
					{(coupons.items ?? []).length > 0 ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{(coupons.items ?? []).map((c) => (
								<div
									key={c.id ?? c.code}
									className="bg-white rounded-lg border p-4 flex justify-between items-start"
								>
									<div>
										<div className="font-semibold text-sm">{c.name ?? c.code}</div>
										<div className="text-xs text-neutral-600 mt-1">
											{t(
												c.type === 'discount'
													? 'wallet.couponType.discount'
													: c.type === 'cash'
														? 'wallet.couponType.cash'
														: c.type,
											)}
											{' · '}
											{c.type === 'discount'
												? `${c.value}%`
												: `¥${Number(c.value ?? 0).toFixed(2)}`}
											{c.minAmount
												? ` · ${t('wallet.minPurchase', { amount: Number(c.minAmount).toFixed(2) })}`
												: ''}
										</div>
										<div className="text-xs text-neutral-600 mt-1">
											{t('wallet.validUntil')}{' '}
											{c.validUntil ? new Date(c.validUntil).toLocaleDateString() : '-'}
										</div>
									</div>
									<span
										className={cn(
											'text-xs px-2 py-0.5 rounded',
											c.status === 'unused'
												? 'bg-success-soft text-success'
												: c.status === 'used'
													? 'bg-neutral-200 text-neutral-600'
													: c.status === 'expired'
														? 'bg-danger-soft text-danger'
														: 'bg-neutral-200 text-neutral-600',
										)}
									>
										{t(
											c.status === 'unused'
												? 'wallet.couponStatus.unused'
												: c.status === 'used'
													? 'wallet.couponStatus.used'
													: c.status === 'expired'
														? 'wallet.couponStatus.expired'
														: (c.status ?? '-'),
										)}
									</span>
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-8 text-neutral-600 text-sm">{t('wallet.noCoupons')}</div>
					)}
				</div>
			)}
		</div>
	);
}

function cn(...classes: (string | undefined | false)[]) {
	return classes.filter(Boolean).join(' ');
}

function Card({
	icon,
	label,
	value,
	valueClassName,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	valueClassName?: string;
}) {
	return (
		<SectionCard
			padding="sm"
			className="flex items-center gap-3"
		>
			{icon}
			<div>
				<div className="text-xs text-neutral-600">{label}</div>
				<div className={`text-lg font-semibold ${valueClassName ?? ''}`}>{value}</div>
			</div>
		</SectionCard>
	);
}

function StatBox({
	label,
	value,
	icon,
}: {
	label: string;
	value?: string;
	icon?: React.ReactNode;
}) {
	return (
		<SectionCard
			padding="sm"
			className="text-center"
		>
			<div className="text-xs text-neutral-600 mb-1 flex items-center justify-center gap-1">
				{icon}
				{label}
			</div>
			<div className="text-base font-semibold">{value ?? '0'}</div>
		</SectionCard>
	);
}

const txLabels: Record<string, string> = {
	deposit: 'wallet.txTypes.deposit',
	withdraw: 'wallet.txTypes.withdrawal',
	transfer: 'wallet.txTypes.transfer',
	transfer_in: 'wallet.txTypes.transferIn',
	transfer_out: 'wallet.txTypes.transferOut',
	refund: 'wallet.txTypes.refund',
	freeze: 'wallet.txTypes.freeze',
	unfreeze: 'wallet.txTypes.unfreeze',
	payment: 'wallet.txTypes.payment',
	adjustment: 'wallet.txTypes.adjustment',
};

// 交易类型 → 设计系统徽标档位。**只做映射，不做样式**。
// 这里此前是 10 套裸色阶（text-success bg-success-soft …，含 cyan / purple / orange 三个
// 不在设计系统色阶里的色）—— 同一件事在四个 portal 各有各的写法，且没有任何一套做过对比度验证。
const txTypeVariants: Record<string, StatusVariant> = {
	deposit: 'success',
	transfer_in: 'success',
	withdraw: 'danger',
	transfer_out: 'danger',
	transfer: 'info',
	refund: 'info',
	unfreeze: 'info',
	freeze: 'warning',
	adjustment: 'warning',
	payment: 'neutral',
};

const statusLabels: Record<string, string> = {
	completed: 'wallet.statusLabels.completed',
	pending: 'wallet.statusLabels.pending',
	failed: 'wallet.statusLabels.failed',
	cancelled: 'wallet.statusLabels.cancelled',
	processing: 'wallet.statusLabels.processing',
};

const statusVariants: Record<string, StatusVariant> = {
	completed: 'success',
	pending: 'warning',
	failed: 'danger',
	cancelled: 'neutral',
	processing: 'info',
};

function txTypeLabelKey(t: string | undefined) {
	return txLabels[t ?? ''] ?? t ?? '-';
}
// 进账的三种类型。原来这个判断在表头和「余额变动」两处各写了一遍字面量，
// 抽出来是因为列定义也要用它（金额的正负号与颜色）。
const INCOMING_TYPES = new Set(['deposit', 'refund', 'transfer_in']);
function isIncoming(t: string | undefined) {
	return INCOMING_TYPES.has(t ?? '');
}

function txTypeVariant(t: string | undefined): StatusVariant {
	return txTypeVariants[t ?? ''] ?? 'neutral';
}
function txStatusLabelKey(s: string | undefined) {
	return statusLabels[s ?? ''] ?? s ?? '-';
}
function txStatusVariant(s: string | undefined): StatusVariant {
	return statusVariants[s ?? ''] ?? 'neutral';
}
