import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@autional/shared';
import {
	pointsByPoints,
	pointsTransactionsByPoints,
	pointsExpiringByPoints,
	pointsStatsByPoints,
	pointsValueByPoints,
	pointsRiskScoreByPoints,
} from '@autional/shared/generated/api';
import type { PointAccount } from './types';
import { queryKeys } from './query-keys';
import { isNotFoundError } from '@/lib/api-error';

async function getPointAccount(userId: string): Promise<PointAccount> {
	return pointsByPoints(userId) as Promise<PointAccount>;
}

export function usePointAccount(): UseQueryResult<PointAccount, Error> {
	const { userId } = useAuth();
	return useQuery<PointAccount, Error>({
		queryKey: queryKeys.points(userId || ''),
		queryFn: () => getPointAccount(userId || ''),
		enabled: !!userId,
		// UP-01：积分账户 404（point account not found）= 业务空态，不重试；其余错误保持 1 次重试。
		retry: (failureCount, err) => !isNotFoundError(err) && failureCount < 1,
	});
}

export interface PointTransactionResponse {
	id?: string;
	type?: string;
	amount?: number;
	balanceBefore?: number;
	balanceAfter?: number;
	source?: string;
	description?: string;
	createdAt?: string;
}

interface PointTransactionListResponse {
	items?: PointTransactionResponse[];
	total?: number;
	pagination?: { page?: number; page_size?: number };
}

async function getPointTransactions(
	userId: string,
	page: number,
	pageSize: number,
): Promise<PointTransactionListResponse> {
	return pointsTransactionsByPoints(userId, {
		page,
		page_size: pageSize,
	}) as Promise<PointTransactionListResponse>;
}

export function usePointTransactions(
	userId: string,
	params?: { page?: number; pageSize?: number },
	enabled?: boolean,
) {
	const p = params?.page ?? 1;
	const ps = params?.pageSize ?? 20;
	return useQuery<PointTransactionListResponse, Error>({
		queryKey: queryKeys.pointTransactions(userId, p, ps),
		queryFn: () => getPointTransactions(userId || '', p, ps),
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}

interface ExpiringPointResponse {
	transactionId?: string;
	amount?: number;
	source?: string;
	expiresAt?: string;
	daysLeft?: number;
}

interface ExpiringPointsResponse {
	userId?: string;
	expiringPoints?: ExpiringPointResponse[];
	totalExpiring?: number;
	daysThreshold?: number;
}

async function getExpiringPoints(userId: string, days: number): Promise<ExpiringPointsResponse> {
	return pointsExpiringByPoints(userId, { days }) as Promise<ExpiringPointsResponse>;
}

export function useExpiringPoints(userId: string, days?: number, enabled?: boolean) {
	return useQuery<ExpiringPointsResponse, Error>({
		queryKey: queryKeys.expiringPoints(userId, days ?? 30),
		queryFn: () => getExpiringPoints(userId || '', days ?? 30),
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}

interface PointStatsResponse {
	userId?: string;
	currentBalance?: number;
	totalEarned?: number;
	totalSpent?: number;
	totalExpired?: number;
	earnedThisMonth?: number;
	spentThisMonth?: number;
	expiringSoon?: number;
}

async function getPointStats(userId: string): Promise<PointStatsResponse> {
	return pointsStatsByPoints(userId) as Promise<PointStatsResponse>;
}

export function usePointStats(userId: string, enabled?: boolean) {
	return useQuery<PointStatsResponse, Error>({
		queryKey: queryKeys.pointStats(userId),
		queryFn: () => getPointStats(userId || ''),
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}

interface PointValueResponse {
	userId?: string;
	pointsType?: string;
	exchangeRate?: number;
	balance?: number;
	cashValue?: string;
}

async function getPointValue(userId: string): Promise<PointValueResponse> {
	return pointsValueByPoints(userId) as Promise<PointValueResponse>;
}

export function usePointValue(userId: string, enabled?: boolean) {
	return useQuery<PointValueResponse, Error>({
		queryKey: queryKeys.pointValue(userId),
		queryFn: () => getPointValue(userId || ''),
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}

interface PointRiskScoreResponse {
	userId?: string;
	riskScore?: number;
	riskLevel?: string;
	factors?: string[];
}

async function getPointRiskScore(userId: string): Promise<PointRiskScoreResponse> {
	return pointsRiskScoreByPoints(userId) as Promise<PointRiskScoreResponse>;
}

export function usePointRiskScore(userId: string, enabled?: boolean) {
	return useQuery<PointRiskScoreResponse, Error>({
		queryKey: queryKeys.pointRiskScore(userId),
		queryFn: () => getPointRiskScore(userId || ''),
		enabled: enabled ?? !!userId,
		retry: 1,
	});
}
