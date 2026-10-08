'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@autional/shared';
import {
	usePointAccount,
	usePointTransactions,
	useExpiringPoints,
	usePointStats,
	usePointValue,
	usePointRiskScore,
	useCreateWallet,
} from '@/hooks/queries';
// 行的形状只有一份（由 hooks 导出），见 billing 页同处注释。
import type { PointTransactionResponse } from '@/hooks/queries';
import {
	Coins,
	TrendingUp,
	TrendingDown,
	Clock,
	AlertTriangle,
	Banknote,
	Shield,
} from 'lucide-react';
import { Alert, SectionCard, AppPageHeader, ErrorState, EmptyState, StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';
import { isWalletNotCreatedError } from '@/lib/api-error';

// 交易类型 → 设计系统徽标档位。只做映射，配色归设计系统（-soft/-text 是成对的、做过对比度验证）。
// 原来这里是一张 typeBadges 表，8 种类型各配一对裸色阶（text-success bg-success-soft …）：
// 配色散在业务侧，而且没有一对做过对比度验证；cyan/orange 这两档在设计系统里根本没有对应色。
const STATUS_VARIANTS: Record<string, StatusVariant> = {
	earn: 'success',
	spend: 'danger',
	refund: 'info',
	adjust: 'neutral',
	freeze: 'warning',
	unfreeze: 'info',
	expire: 'neutral',
	confirm_deduction: 'warning',
};

export default function PointsPage() {
	const { t } = useTranslation();
	const { userId } = useAuth();
	// 开通钱包（点账户依赖钱包）：成功后重拉积分账户。
	const createWallet = useCreateWallet();
	const {
		data: account,
		isLoading: accountLoading,
		error: accountError,
		refetch: refetchAccount,
	} = usePointAccount();
	const { data: expiringData } = useExpiringPoints(account?.userId || '', 30, !!account?.userId);
	const { data: stats } = usePointStats(account?.userId || '', !!account?.userId);
	const { data: value } = usePointValue(account?.userId || '', !!account?.userId);
	const { data: risk } = usePointRiskScore(account?.userId || '', !!account?.userId);

	const [page, setPage] = useState(1);
	const { data: txs } = usePointTransactions(
		account?.userId || '',
		{ page, pageSize: 20 },
		!!account?.userId,
	);

	if (accountLoading)
		return (
			<div className="max-w-4xl mx-auto space-y-6">
				<SkeletonCard />
				<div className="grid grid-cols-1 md:grid-cols-5 gap-4">
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
				</div>
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
		);
	if (accountError) {
		// 404 细分：仅 61060101（钱包未开通）走「空态 + 开通钱包 CTA」；其他 404/错误保持错误态。
		if (isWalletNotCreatedError(accountError)) {
			return (
				<div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
					<EmptyState
						title={t('points.empty', '暂无积分数据')}
						description={t('points.emptyDesc', '当前账户尚未开通积分账户')}
					/>
					<div className="flex justify-center">
						<button
							type="button"
							onClick={() =>
								userId && createWallet.mutate({ userId }, { onSuccess: () => refetchAccount() })
							}
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
			<ErrorState
				message={t('points.loadError', '积分信息加载失败')}
				onRetry={() => refetchAccount()}
			/>
		);
	}
	const getTypeLabel = (type: string) => {
		const key = TX_TYPE_KEYS[type];
		return key ? t(key) : type;
	};

	const balance = account?.balance ?? 0;
	const frozen = account?.frozenBalance ?? 0;

	// 列定义：只描述**这一页有哪些列**。表头底色 / 悬浮态 / 边框 / 行高 / 分页外观，
	// 由设计系统下发的组件级令牌决定 —— 与四个 portal 里其它数据表吃的是同一份令牌。
	const columns: DataTableColumns<PointTransactionResponse> = [
		{
			title: t('points.table.type'),
			dataIndex: 'type',
			key: 'type',
			render: (v: string | undefined) => (
				<StatusBadge variant={STATUS_VARIANTS[v || ''] || 'neutral'}>{getTypeLabel(v || '')}</StatusBadge>
			),
		},
		{
			title: t('points.table.amount'),
			dataIndex: 'amount',
			key: 'amount',
			align: 'right',
			// 正负号与配色都原样保留：+N 绿、-N 红
			render: (v: number | undefined) => (
				<span className={'font-mono ' + ((v ?? 0) > 0 ? 'text-success-text' : 'text-danger-text')}>
					{(v ?? 0) > 0 ? '+' : ''}
					{v?.toLocaleString() ?? 0}
				</span>
			),
		},
		{
			title: t('points.table.source'),
			dataIndex: 'source',
			key: 'source',
			render: (v: string | undefined) => <span className="text-neutral-600">{v ?? '-'}</span>,
		},
		{
			title: t('points.table.time'),
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
			<AppPageHeader title={t('points.title')} />

			{/* UP-52：5 张卡与 4 列栅格错配致第 5 卡孤行换行；改 5 列消除孤卡 */}
			<div className="grid grid-cols-1 md:grid-cols-5 gap-4">
				<Card
					icon={<Coins className="w-5 h-5 text-amber-500" />}
					label={t('points.availablePoints')}
					value={balance.toLocaleString()}
				/>
				<Card
					icon={<Clock className="w-5 h-5 text-info" />}
					label={t('points.frozenPoints')}
					value={frozen.toLocaleString()}
				/>
				<Card
					icon={<Banknote className="w-5 h-5 text-success" />}
					label={t('points.redeemableCash')}
					value={value?.cashValue != null ? `¥${value.cashValue}` : '-'}
				/>
				<Card
					icon={<Shield className="w-5 h-5 text-chart-7" />}
					label={t('points.riskScore')}
					/* UP-51：等级此前仅靠颜色传达（绿=低风险），色觉障碍用户丢失语义 —— 颜色+文字双通道。 */
					value={
						risk?.riskScore != null ? (
							<>
								{risk.riskScore}
								{t('points.scoreSuffix')}
								<span className="ml-1 text-xs font-normal">
									{risk.riskLevel === 'high'
										? t('privacyImpact.riskHigh')
										: risk.riskLevel === 'medium'
											? t('privacyImpact.riskMedium')
											: t('privacyImpact.riskLow')}
								</span>
							</>
						) : (
							'-'
						)
					}
					valueClassName={
						risk?.riskLevel === 'high'
							? 'text-danger'
							: risk?.riskLevel === 'medium'
								? 'text-amber-500'
								: 'text-success'
					}
				/>
				<Card
					icon={<AlertTriangle className="w-5 h-5 text-danger" />}
					label={t('points.expiringSoon')}
					value={
						(expiringData?.totalExpiring ?? 0) > 0
							? `${expiringData?.totalExpiring?.toLocaleString()}${t('points.pointsUnit')}`
							: t('points.none')
					}
					valueClassName={(expiringData?.totalExpiring ?? 0) > 0 ? 'text-danger' : 'text-neutral-600'}
				/>
			</div>

			{stats && (
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					<StatBox
						label={t('points.totalEarned')}
						value={stats.totalEarned?.toLocaleString()}
						icon={<TrendingUp className="w-4 h-4 text-success" />}
					/>
					<StatBox
						label={t('points.totalSpent')}
						value={stats.totalSpent?.toLocaleString()}
						icon={<TrendingDown className="w-4 h-4 text-danger" />}
					/>
					<StatBox
						label={t('points.earnedThisMonth')}
						value={stats.earnedThisMonth?.toLocaleString()}
					/>
					<StatBox
						label={t('points.spentThisMonth')}
						value={stats.spentThisMonth?.toLocaleString()}
					/>
				</div>
			)}

			{expiringData && (expiringData.expiringPoints ?? []).length > 0 && (
				<Alert
					variant="warning"
					title={t('points.expiringPointsTitle')}
				>
					<div className="space-y-2">
						{(expiringData.expiringPoints ?? []).slice(0, 5).map((ep, i) => (
							<div key={i} className="flex justify-between text-sm text-amber-700">
								<span>
									{ep.amount?.toLocaleString()}
									{t('points.pointsUnit')} · {ep.source ?? t('points.systemIssued')}
								</span>
								<span>{t('points.daysUntilExpire', { days: ep.daysLeft ?? 0 })}</span>
							</div>
						))}
					</div>
				</Alert>
			)}

			<div>
				<h2 className="text-lg font-semibold mb-3">{t('points.transactionHistory')}</h2>
				{/* 外面那层 overflow-x-auto rounded-lg border 由 DataTable 自带容器接管，不再手拼。
					rowKey 兜下标：id 缺失时统一兜成 '-' 会让多行同 key（React 会告警）。 */}
				<DataTable<PointTransactionResponse>
					rowKey={(r, i) => r.id ?? String(i)}
					columns={columns}
					dataSource={txs?.items ?? []}
					scroll={{ x: 'max-content' }}
					locale={{
						// 原来表体里那行 colSpan 占位的 EmptyState 整体搬进 locale，文案与描述原样保留
						emptyText: (
							<EmptyState
								title={t('points.empty', '暂无积分数据')}
								description={t('points.emptyDesc', '您的积分记录将显示在这里')}
							/>
						),
					}}
					pagination={{
						current: page,
						pageSize: 20,
						total: txs?.total ?? 0,
						onChange: setPage,
						// 原手写翻页只在 total > 20 时出现；hideOnSinglePage 保留「不足一页不显示分页条」这一行为
						hideOnSinglePage: true,
					}}
				/>
			</div>
		</div>
	);
}

function Card({
	icon,
	label,
	value,
	valueClassName,
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
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

const TX_TYPE_KEYS: Record<string, string> = {
	earn: 'points.txType.earn',
	spend: 'points.txType.spend',
	refund: 'points.txType.refund',
	adjust: 'points.txType.adjust',
	freeze: 'points.txType.freeze',
	unfreeze: 'points.txType.unfreeze',
	expire: 'points.txType.expire',
	confirm_deduction: 'points.txType.confirm_deduction',
};

