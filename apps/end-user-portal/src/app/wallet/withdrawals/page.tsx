'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@autional/shared';
import { Alert, SectionCard, ConsolePageHeader, LoadingScreen, ErrorState, EmptyState, StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import { FormInput, FormTextarea } from '@autional/ui/rhf';
import { useTranslation } from 'react-i18next';
import { Wallet, ArrowDownCircle, Loader2, Banknote } from 'lucide-react';
import {
	useWalletBalance,
	useWithdrawWallet,
	useWalletTransactions,
	useCreateWallet,
} from '@/hooks/queries';
import type { WalletTransactionItem } from '@/hooks/queries';
import { withdrawalSchema, type WithdrawalFormData } from '@/lib/validators';
import { isWalletNotCreatedError } from '@/lib/api-error';

const WITHDRAWAL_STATUSES = ['all', 'pending', 'approved', 'rejected', 'completed'] as const;

// 状态 → 设计系统徽标档位。只做映射，配色归设计系统（-soft/-text 是成对的、做过对比度验证）。
// 档位照搬原表的语义色：pending→warning、approved→info、rejected→danger、completed→success。
const WITHDRAWAL_STATUS_VARIANTS: Record<string, StatusVariant> = {
	pending: 'warning',
	approved: 'info',
	rejected: 'danger',
	completed: 'success',
};

export default function WithdrawalsPage() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const userId = user?.id || '';
	const {
		data: balance,
		isLoading: balanceLoading,
		error: balanceError,
		refetch: refetchBalance,
	} = useWalletBalance();
	const withdrawMutation = useWithdrawWallet();
	// 开通钱包：成功后 hook 失效钱包查询 → useWalletBalance 自动重拉，提现表单可达。
	const createWallet = useCreateWallet();

	const channels = [
		{
			code: 'bank_transfer',
			label: t('wallet.withdrawals.channels.bankTransfer'),
			icon: <Banknote className="w-5 h-5" />,
		},
		{
			code: 'wallet',
			label: t('wallet.withdrawals.channels.balanceWithdraw'),
			icon: <Wallet className="w-5 h-5" />,
		},
	];

	const [page, setPage] = useState(1);
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const { data: txs } = useWalletTransactions(userId, { page, pageSize: 20 }, !!userId);

	const {
		register,
		control,
		handleSubmit,
		reset,
		watch,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<WithdrawalFormData>({
		resolver: zodResolver(withdrawalSchema),
		defaultValues: { amount: '', method: 'bank_transfer', notes: '' },
	});


	const watchedAmount = watch('amount');

	const [formStatus, setFormStatus] = useState<'idle' | 'success' | 'error'>('idle');
	const [resultKey, setResultKey] = useState<string>('');

	const onWithdraw = async (data: WithdrawalFormData) => {
		setFormStatus('idle');
		try {
			await withdrawMutation.mutateAsync({
				userId,
				amount: data.amount,
				remark: data.notes || undefined,
			});
			setFormStatus('success');
			setResultKey('wallet.withdrawals.success');
			reset({ amount: '', method: 'bank_transfer', notes: '' });
		} catch (e: unknown) {
			setFormStatus('error');
			setResultKey(e instanceof Error ? e.message : 'wallet.withdrawals.failed');
		}
	};

	if (balanceLoading) return <LoadingScreen message={t('wallet.loadingBalance', '正在加载钱包余额…')} />;

	if (balanceError) {
		// 404 细分：仅 61060101 走「空态 + 开通钱包 CTA」；其他 404/错误保持错误态。
		if (isWalletNotCreatedError(balanceError)) {
			return (
				<div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
					<EmptyState
						title={t('wallet.empty', '暂无钱包数据')}
						description={t(
							'wallet.withdrawals.emptyDesc',
							'当前账户尚未开通钱包，开通后即可申请提现',
						)}
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
			<ErrorState
				message={t('wallet.loadBalanceError', '钱包余额加载失败')}
				onRetry={() => refetchBalance()}
			/>
		);
	}

	const currentBalance = parseFloat(
		balance?.availableBalance ?? balance?.available ?? balance?.balance ?? '0',
	);

	const withdrawalTxs = (txs?.items ?? []).filter((tx) => {
		if (tx.type === 'withdraw' || tx.type === 'withdrawal') {
			if (statusFilter === 'all') return true;
			return tx.status === statusFilter;
		}
		return false;
	});

	// 列定义：只描述**这一页有哪些列**；表头 / 悬浮态 / 边框 / 行高 / 分页外观
	// 由设计系统下发的组件级令牌决定 —— 四个门户吃的是同一份令牌。
	const columns: DataTableColumns<WalletTransactionItem> = [
		{
			title: t('wallet.withdrawals.date'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string | undefined) => (
				<span className="text-neutral-600">{v ? new Date(v).toLocaleDateString() : '-'}</span>
			),
		},
		{
			title: t('wallet.amount'),
			dataIndex: 'amount',
			key: 'amount',
			align: 'right',
			render: (v: string | undefined) => (
				<span className="font-mono text-danger-text">
					-¥{Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
				</span>
			),
		},
		{
			title: t('wallet.withdrawals.status'),
			dataIndex: 'status',
			key: 'status',
			align: 'center',
			render: (v: string | undefined) => (
				<StatusBadge variant={WITHDRAWAL_STATUS_VARIANTS[v || ''] || 'neutral'}>
					{t(withdrawalStatusLabelKey(v))}
				</StatusBadge>
			),
		},
		{
			title: t('wallet.withdrawals.method'),
			dataIndex: 'type',
			key: 'type',
			render: (v: string | undefined) => (
				<span className="text-neutral-600">{t(methodLabelKey(v))}</span>
			),
		},
		{
			title: t('wallet.remark'),
			dataIndex: 'description',
			key: 'description',
			render: (v: string | undefined) => (
				<span className="text-neutral-600 inline-block max-w-[200px] truncate">{v ?? '-'}</span>
			),
		},
	];

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			<ConsolePageHeader title={t('wallet.withdrawals.title')} />

			<SectionCard className="flex items-center gap-4">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
					<Wallet className="w-6 h-6 text-success" />
				</div>
				<div>
					<div className="text-sm text-neutral-600">{t('wallet.withdrawals.availableBalance')}</div>
					<div className="text-2xl font-bold text-success-text">¥{currentBalance.toFixed(2)}</div>
				</div>
			</SectionCard>

			<form
				onSubmit={handleSubmit(onWithdraw)}
				className="bg-white rounded-lg border p-6 space-y-5"
			>
				<h2 className="text-lg font-semibold">{t('wallet.withdrawals.applyWithdrawal')}</h2>

				{/* ¥ 与大号加粗留着（体量强调不是边框/焦点环）；装饰走 FormInput 的 leading 槽 ——
				    槽由设计系统给，`pl-8` 也就由它自动让出来，不必再由页面记着。 */}
				<FormInput<WithdrawalFormData>
					name="amount"
					control={control}
					label={t('wallet.withdrawals.amount')}
					type="number"
					placeholder={t('wallet.withdrawals.amountPlaceholder')}
					leading="¥"
					error={errors.amount ? t(errors.amount.message || 'wallet.withdrawals.amountRequired') : undefined}
					className="text-lg font-semibold"
				/>

				<div>
					<label className="block text-sm font-medium text-neutral-800 mb-1">
						{t('wallet.withdrawals.method')}
					</label>
					<input type="hidden" {...register('method')} />
					<div className="flex gap-3">
						{channels.map((ch) => (
							<button
								key={ch.code}
								type="button"
								onClick={() => setValue('method', ch.code)}
								className={`flex items-center gap-2 px-5 py-3 rounded-lg border transition-colors ${
									watch('method') === ch.code
										? 'border-[var(--color-brand)] bg-primary-50 text-[var(--color-brand)]'
										: 'border-neutral-300 hover:border-[var(--color-brand)]'
								}`}
							>
								{ch.icon}
								<span className="font-medium">{ch.label}</span>
							</button>
						))}
					</div>
				</div>

				{/* 备注在 schema 里没有校验规则（z.string().optional()），今天也没有错误行 —— 不给 error，
				    行为与原样一致，不会凭空多出一行报错。resize-none 保留：设计系统的 textarea 不管 resize，
				    去掉它用户就能拖拽缩放，那是可见的行为变化，不在这次收敛范围内。 */}
				<FormTextarea<WithdrawalFormData>
					name="notes"
					control={control}
					label={t('wallet.withdrawals.remark')}
					placeholder={t('wallet.withdrawals.remarkPlaceholder')}
					rows={3}
					className="resize-none"
				/>

				<button
					type="submit"
					disabled={isSubmitting}
					className="w-full py-4 rounded-lg bg-[var(--color-brand)] text-white font-semibold text-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
				>
					{isSubmitting ? (
						<>
							<Loader2 className="w-5 h-5 animate-spin" />
							{t('wallet.withdrawals.submitting')}
						</>
					) : (
						<>
							<ArrowDownCircle className="w-5 h-5" />
							{t('wallet.withdrawals.submit', {
								amount: watchedAmount ? parseFloat(watchedAmount).toFixed(2) : '0.00',
							})}
						</>
					)}
				</button>

				{formStatus === 'success' && (
					<Alert variant="success">
						<span className="font-medium">{t(resultKey)}</span>
						<button
							type="button"
							onClick={() => setFormStatus('idle')}
							className="ml-auto text-sm text-[var(--color-brand)] hover:underline"
						>
							{t('wallet.withdrawals.continueWithdraw')}
						</button>
					</Alert>
				)}

				{formStatus === 'error' && (
					<Alert variant="danger">
						<span className="font-medium">{t(resultKey)}</span>
						<button
							type="button"
							onClick={() => setFormStatus('idle')}
							className="ml-auto text-sm text-[var(--color-brand)] hover:underline"
						>
							{t('wallet.withdrawals.retry')}
						</button>
					</Alert>
				)}
			</form>

			<div>
				<div className="flex items-center justify-between mb-3">
					<h2 className="text-lg font-semibold">{t('wallet.withdrawals.history')}</h2>
					<select
						value={statusFilter}
						onChange={(e) => {
							setStatusFilter(e.target.value);
							setPage(1);
						}}
						className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
					>
						{WITHDRAWAL_STATUSES.map((s) => (
							<option key={s} value={s}>
								{s === 'all' ? t('wallet.withdrawals.allStatus') : t(withdrawalStatusLabelKey(s))}
							</option>
						))}
					</select>
				</div>

				{/* 原表体里那行「没有记录」的占位 <tr> 换成 locale.emptyText；原来手写的上一页/下一页
				    只在超过一页时出现，用 hideOnSinglePage 保留该行为。 */}
				<DataTable<WalletTransactionItem>
					rowKey={(r, i) => r.id ?? String(i)}
					columns={columns}
					dataSource={withdrawalTxs}
					scroll={{ x: 'max-content' }}
					locale={{ emptyText: t('wallet.withdrawals.noRecords') }}
					pagination={{
						current: page,
						pageSize: 20,
						total: txs?.total ?? 0,
						onChange: setPage,
						hideOnSinglePage: true,
					}}
				/>

			</div>
		</div>
	);
}

const withdrawalStatusLabels: Record<string, string> = {
	pending: 'wallet.withdrawals.statusLabels.pending',
	approved: 'wallet.withdrawals.statusLabels.approved',
	rejected: 'wallet.withdrawals.statusLabels.rejected',
	completed: 'wallet.withdrawals.statusLabels.completed',
};

const methodLabels: Record<string, string> = {
	bank_transfer: 'wallet.withdrawals.methodLabels.bankTransfer',
	wallet: 'wallet.withdrawals.methodLabels.balanceWithdraw',
	withdraw: 'wallet.withdrawals.methodLabels.bankTransfer',
	withdrawal: 'wallet.withdrawals.methodLabels.balanceWithdraw',
};

function withdrawalStatusLabelKey(s: string | undefined): string {
	if (!s) return '-';
	return withdrawalStatusLabels[s] ?? s;
}

function methodLabelKey(t: string | undefined): string {
	if (!t) return '-';
	return methodLabels[t] ?? t;
}

