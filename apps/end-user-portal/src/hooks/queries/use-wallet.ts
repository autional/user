import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryResult,
	type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@autional/shared';
import {
	walletsBalanceByWallets,
	walletsPost,
	walletsTransactionsByWallets,
	walletsStatsByWallets,
	walletsCouponsByWallets,
	walletsCouponsRedeemByWalletsByCouponsPost,
	walletsBalanceHistoryByWallets,
	walletsDepositByWalletsPost,
	walletsWithdrawRequestByWalletsPost,
} from '@autional/shared/generated/api';
import type { WalletBalance } from './types';
import { queryKeys } from './query-keys';
import { isNotFoundError } from '@/lib/api-error';

export async function getWalletBalance(userId: string): Promise<WalletBalance> {
	return walletsBalanceByWallets(userId) as Promise<WalletBalance>;
}

export function useWalletBalance(): UseQueryResult<WalletBalance, Error> {
	const { userId } = useAuth();
	return useQuery<WalletBalance, Error>({
		queryKey: queryKeys.wallet(userId || ''),
		queryFn: () => getWalletBalance(userId || ''),
		enabled: !!userId,
		// UP-01：wallet not found（404）= 业务空态，重试无意义（原 retry:1 造成 404×2 console 噪声）；其余错误保持 1 次重试。
		retry: (failureCount, err) => !isNotFoundError(err) && failureCount < 1,
	});
}

async function createWallet(userId: string): Promise<WalletBalance> {
	// 首次接线 walletsPost：body.userId 必须是当前登录用户（服务端同体校验，凭证零自定义）。
	return walletsPost({ userId, currency: 'CNY' }) as Promise<WalletBalance>;
}

/** 开通钱包：成功后 invalidate 钱包查询，由消费页重拉（UF2-19/20 的「开通即重拉」口径）。 */
export function useCreateWallet(): UseMutationResult<WalletBalance, Error, { userId: string }> {
	const qc = useQueryClient();
	return useMutation<WalletBalance, Error, { userId: string }>({
		mutationFn: ({ userId }) => createWallet(userId),
		onSuccess: (_data, vars) => {
			qc.invalidateQueries({ queryKey: queryKeys.wallet(vars.userId) });
		},
	});
}

export interface WalletTransactionItem {
	id?: string;
	type?: string;
	amount?: string;
	currency?: string;
	balanceBefore?: string;
	balanceAfter?: string;
	description?: string;
	status?: string;
	counterpartyId?: string;
	referenceId?: string;
	walletId?: string;
	createdAt?: string;
}

interface WalletTransactionList {
	items?: WalletTransactionItem[];
	total?: number;
	pagination?: { page?: number; page_size?: number };
}

async function getWalletTransactions(
	userId: string,
	page: number,
	pageSize: number,
	filters?: { type?: string; status?: string },
): Promise<WalletTransactionList> {
	return walletsTransactionsByWallets(userId, {
		page,
		page_size: pageSize,
		// 筛选**下推服务端**（第 63 轮，L8）：接口签名里一直有 type / status / start_date / end_date
		// （见 @autional/shared/generated/api 的 walletsTransactionsByWallets），只是没人传 ——
		// 于是页面在本页数据上做客户端 filter，而分页的 total 来自服务端全量：
		// 一筛状态就「行数变少、页数不变」，翻到后面是空页。筛选一下推，两者同源。
		...(filters?.type ? { type: filters.type } : {}),
		...(filters?.status ? { status: filters.status } : {}),
	}) as Promise<WalletTransactionList>;
}

export function useWalletTransactions(
	userId: string,
	params?: { page?: number; pageSize?: number; type?: string; status?: string },
	enabled?: boolean,
) {
	const p = params?.page ?? 1;
	const ps = params?.pageSize ?? 20;
	const type = params?.type;
	const status = params?.status;
	return useQuery<WalletTransactionList, Error>({
		queryKey: queryKeys.walletTransactions(userId, p, ps, { type, status }),
		queryFn: () => getWalletTransactions(userId || '', p, ps, { type, status }),
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}

export interface WalletStatsItem {
	period?: string;
	startDate?: string;
	endDate?: string;
	totalDeposits?: string;
	totalWithdrawals?: string;
	totalTransfersIn?: string;
	totalTransfersOut?: string;
	transactionCount?: number;
	averageTransaction?: string;
	largestTransaction?: string;
}

export async function getWalletStats(userId: string): Promise<{ data?: WalletStatsItem }> {
	return walletsStatsByWallets(userId) as Promise<{ data?: WalletStatsItem }>;
}

export function useWalletStats(userId: string, enabled?: boolean) {
	return useQuery<WalletStatsItem | undefined, Error>({
		queryKey: queryKeys.walletStats(userId),
		queryFn: async () => {
			const r = await getWalletStats(userId || '');
			return r.data;
		},
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}

export interface CouponItem {
	id?: string;
	code?: string;
	name?: string;
	type: string;
	value?: string;
	minAmount?: string;
	status?: string;
	validFrom?: string;
	validUntil?: string;
	createdAt?: string;
	usedAt?: string;
}

export interface CouponList {
	items?: CouponItem[];
	total?: number;
}

export async function getWalletCoupons(userId: string): Promise<CouponList> {
	return walletsCouponsByWallets(userId) as Promise<CouponList>;
}

export function useWalletCoupons(userId: string, enabled?: boolean) {
	return useQuery<CouponList, Error>({
		queryKey: queryKeys.walletCoupons(userId),
		queryFn: () => getWalletCoupons(userId || ''),
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}

async function redeemCoupon(userId: string, code: string): Promise<unknown> {
	return walletsCouponsRedeemByWalletsByCouponsPost(userId, code);
}

export function useRedeemCoupon(): UseMutationResult<
	unknown,
	Error,
	{ userId: string; code: string }
> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, { userId: string; code: string }>({
		mutationFn: ({ userId, code }) => redeemCoupon(userId, code),
		onSuccess: (_data, vars) => {
			qc.invalidateQueries({ queryKey: queryKeys.walletCoupons(vars.userId) });
			qc.invalidateQueries({ queryKey: queryKeys.wallet(vars.userId) });
		},
	});
}

export interface BalanceHistoryItem {
	date?: string;
	amount?: string;
	balanceBefore?: string;
	balanceAfter?: string;
	description?: string;
	transactionId?: string;
	type: string;
}

export interface BalanceHistoryList {
	items?: BalanceHistoryItem[];
	total?: number;
}

export async function getWalletBalanceHistory(userId: string): Promise<BalanceHistoryList> {
	return walletsBalanceHistoryByWallets(userId) as Promise<BalanceHistoryList>;
}

export function useWalletBalanceHistory(userId: string, enabled?: boolean) {
	return useQuery<BalanceHistoryList, Error>({
		queryKey: queryKeys.walletBalanceHistory(userId),
		queryFn: () => getWalletBalanceHistory(userId || ''),
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}

async function rechargeWallet(
	userId: string,
	data: { amount: number; channel: string },
): Promise<{ paymentId?: string; paymentUrl?: string }> {
	return walletsDepositByWalletsPost(userId, {
		amount: data.amount,
		channel: data.channel,
		currency: 'CNY',
	}) as Promise<{ paymentId?: string; paymentUrl?: string }>;
}

export function useRechargeWallet(): UseMutationResult<
	{ paymentId?: string; paymentUrl?: string },
	Error,
	{ userId: string; amount: number; channel: string }
> {
	const qc = useQueryClient();
	return useMutation<
		{ paymentId?: string; paymentUrl?: string },
		Error,
		{ userId: string; amount: number; channel: string }
	>({
		mutationFn: ({ userId, amount, channel }) => rechargeWallet(userId, { amount, channel }),
		onSuccess: (_data, variables) => {
			qc.invalidateQueries({ queryKey: queryKeys.wallet(variables.userId) });
		},
	});
}

interface WithdrawalResponse {
	amount?: string;
	id?: string;
	status?: string;
	userId?: string;
}

async function withdrawWallet(
	userId: string,
	data: { amount: string; remark?: string },
): Promise<WithdrawalResponse> {
	return walletsWithdrawRequestByWalletsPost(userId, data) as Promise<WithdrawalResponse>;
}

export function useWithdrawWallet(): UseMutationResult<
	WithdrawalResponse,
	Error,
	{ userId: string; amount: string; remark?: string }
> {
	const qc = useQueryClient();
	return useMutation<
		WithdrawalResponse,
		Error,
		{ userId: string; amount: string; remark?: string }
	>({
		mutationFn: ({ userId, amount, remark }) => withdrawWallet(userId, { amount, remark }),
		onSuccess: (_data, variables) => {
			qc.invalidateQueries({ queryKey: queryKeys.wallet(variables.userId) });
			qc.invalidateQueries({ queryKey: queryKeys.walletTransactions(variables.userId, 1, 20) });
		},
	});
}
