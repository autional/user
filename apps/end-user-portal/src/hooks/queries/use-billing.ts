import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryResult,
	type UseMutationResult,
} from '@tanstack/react-query';
import {
	billingSubscriptionBySubscription,
	billingRecordsSearchByRecords,
	billingUsageCurrentByUsage,
	billingStatisticsByStatistics,
	billingPlans,
	billingSubscribePost,
	billingRecordsByRecords,
	billingInvoiceByInvoice,
} from '@autional/shared/generated/api';
import type {
	SubscriptionInfo,
	PublicPlanResponse,
	BillingRecord,
	InvoiceInfo,
	InvoiceLineItem,
} from './types';
import type { PaginatedList } from './types';
import { queryKeys } from './query-keys';
import { isNotFoundError } from '@/lib/api-error';

interface BillingSubscriptionInfo {
	tenantId?: string;
	planId?: string;
	status?: string;
	billingCycle?: string;
	amount?: number;
	currency?: string;
	currentPeriodStart?: string;
	currentPeriodEnd?: string;
	cancelAtPeriodEnd?: boolean;
	autoRenew?: boolean;
	trialEndDate?: string;
	gracePeriodDays?: number;
	adminUserId?: string;
}

async function getBillingSubscription(tenantId: string): Promise<BillingSubscriptionInfo> {
	// 2026-08-16 修复：billingSubscriptionBySubscription 已返回 unwrap 后的
	// {plan_id,...} 对象（interceptor 已解包），原类型化 {data?:} + r.data 双解包 → undefined
	return billingSubscriptionBySubscription(tenantId) as Promise<BillingSubscriptionInfo>;
}

export function useBillingSubscription(tenantId: string, enabled?: boolean) {
	return useQuery<BillingSubscriptionInfo | undefined, Error>({
		queryKey: queryKeys.billingSubscription(tenantId),
		queryFn: async () => {
			const r = await getBillingSubscription(tenantId);
			return r;
		},
		enabled: enabled ?? !!tenantId,
		retry: 1,
	});
}

export interface BillingRecordItem {
	recordId?: string;
	invoiceNumber?: string;
	// 后端 decimal 序列化可能为字符串（如 "499"）：类型放宽，页面渲染前统一 Number() 归一（UP-56）。
	amount?: number | string;
	currency?: string;
	type: string;
	status?: string;
	description?: string;
	appId?: string;
	tenantId?: string;
	createdAt?: string;
}

interface BillingRecordList {
	items?: BillingRecordItem[];
	total?: number;
	pagination?: { page?: number; page_size?: number };
}

async function getBillingRecords(
	tenantId: string,
	page: number,
	pageSize: number,
): Promise<BillingRecordList> {
	return billingRecordsSearchByRecords(tenantId, {
		page,
		page_size: pageSize,
	}) as Promise<BillingRecordList>;
}

export function useBillingRecords(
	tenantId: string,
	params?: { page?: number; pageSize?: number },
	enabled?: boolean,
) {
	const p = params?.page ?? 1;
	const ps = params?.pageSize ?? 20;
	return useQuery<BillingRecordList, Error>({
		queryKey: queryKeys.billingRecords(tenantId, p, ps),
		queryFn: () => getBillingRecords(tenantId, p, ps),
		enabled: enabled ?? !!tenantId,
		retry: 1,
	});
}

interface BillingUsageInfo {
	apiCallsToday?: number;
	storageGb?: number;
	users?: number;
}

async function getBillingUsage(tenantId: string): Promise<BillingUsageInfo> {
	// 2026-08-16 修复：billingUsageCurrentByUsage 已返回 unwrap 数据（同 subscription）
	return billingUsageCurrentByUsage(tenantId) as Promise<BillingUsageInfo>;
}

export function useBillingUsage(tenantId: string, enabled?: boolean) {
	return useQuery<BillingUsageInfo | undefined, Error>({
		queryKey: queryKeys.billingUsage(tenantId),
		queryFn: async () => {
			try {
				const r = await getBillingUsage(tenantId);
				return r;
			} catch (err) {
				// 2026-08-17 修复：billing usage/current 对无用量数据的租户返回 404（ProblemDetails），
				// 属于"无数据"而非错误 → 转换为空态（返回 undefined，不置 error），
				// 避免页面渲染 ErrorState 且 console 出现 app 级 404 报错。
				if (isNotFoundError(err)) return undefined;
				throw err;
			}
		},
		enabled: enabled ?? !!tenantId,
		retry: 1,
	});
}

interface BillingStatisticsInfo {
	totalSpend?: number;
	mrr?: number;
	activeUsers?: number;
	retentionRate?: number;
	tenantId?: string;
	appId?: string;
}

async function getBillingStatistics(tenantId: string): Promise<BillingStatisticsInfo> {
	// 2026-08-16 修复：billingStatisticsByStatistics 已返回 unwrap 数据
	return billingStatisticsByStatistics(tenantId) as Promise<BillingStatisticsInfo>;
}

export function useBillingStatistics(tenantId: string, enabled?: boolean) {
	return useQuery<BillingStatisticsInfo | undefined, Error>({
		queryKey: queryKeys.billingStatistics(tenantId),
		queryFn: async () => {
			const r = await getBillingStatistics(tenantId);
			return r;
		},
		enabled: enabled ?? !!tenantId,
		retry: 1,
	});
}

async function getPublicPlans(): Promise<PaginatedList<PublicPlanResponse>> {
	// 后端返回 { code, data: { plans: [...] } }，apiClient 解包 data → { plans }。
	// 页面按 PaginatedList 读取 items —— 这里统一解包为 { items }。
	// 后端 plans 字段为 plan_id/price_monthly/price_yearly → camelCaseKeys → planId/priceMonthly/priceYearly，
	// 页面读 plan/monthlyPrice/yearlyPrice —— 这里映射兼容字段（缺失时落回默认值，避免 undefined 污染）。
	// 注：apiClient 响应拦截器已把 data 解包到顶层，勿再读 res.data（双解包恒 undefined）。
	const res = (await billingPlans()) as unknown as {
		plans?: PublicPlanResponse[];
		items?: PublicPlanResponse[];
	};
	const rawPlans = res?.items || res?.plans || [];
	const plans = rawPlans.map((p) => ({
		...p,
		id: p.id ?? p.planId ?? '',
		plan: p.plan ?? p.planId ?? '',
		monthlyPrice: p.monthlyPrice ?? p.priceMonthly ?? '0',
		yearlyPrice: p.yearlyPrice ?? p.priceYearly ?? '0',
	}));
	return {
		items: plans,
		total: plans.length,
		pagination: {
			page: 1,
			pageSize: plans.length,
			total: plans.length,
			totalPages: plans.length > 0 ? 1 : 0,
			hasNext: false,
			hasPrev: false,
		},
	} as PaginatedList<PublicPlanResponse>;
}

export function usePublicPlans(): UseQueryResult<PaginatedList<PublicPlanResponse>, Error> {
	return useQuery<PaginatedList<PublicPlanResponse>, Error>({
		queryKey: queryKeys.publicPlans,
		queryFn: getPublicPlans,
		retry: 1,
		staleTime: 5 * 60 * 1000,
	});
}

async function subscribeToPlan(data: {
	planId: string;
	billingCycle: string;
	tenantId: string;
	appId?: string;
}): Promise<{ subscriptionId?: string; paymentId?: string; paymentUrl?: string }> {
	return billingSubscribePost(data) as Promise<{
		subscriptionId?: string;
		paymentId?: string;
		paymentUrl?: string;
	}>;
}

export function useSubscribe(): UseMutationResult<
	{ subscriptionId?: string; paymentId?: string; paymentUrl?: string },
	Error,
	{ planId: string; billingCycle: string; tenantId: string; appId?: string }
> {
	const qc = useQueryClient();
	return useMutation<
		{ subscriptionId?: string; paymentId?: string; paymentUrl?: string },
		Error,
		{ planId: string; billingCycle: string; tenantId: string; appId?: string }
	>({
		mutationFn: subscribeToPlan,
		onSuccess: (_data, variables) => {
			qc.invalidateQueries({ queryKey: queryKeys.subscription(variables.tenantId) });
		},
	});
}

async function getSubscription(tenantId: string): Promise<SubscriptionInfo> {
	const data = (await billingSubscriptionBySubscription(tenantId)) as Partial<SubscriptionInfo> & {
		planId?: string;
	};
	// 后端 subscription 返回 plan_id → apiClient camelCaseKeys 后为 planId；页面读 plan（currentSub?.plan）。
	// 这里映射兼容字段，缺失时落回空串（避免 undefined === undefined 导致全部卡片误标 Current）。
	return { ...data, plan: data?.plan ?? data?.planId ?? '' } as SubscriptionInfo;
}

export function useSubscription(tenantId: string): UseQueryResult<SubscriptionInfo, Error> {
	return useQuery<SubscriptionInfo, Error>({
		queryKey: queryKeys.subscription(tenantId),
		queryFn: () => getSubscription(tenantId),
		enabled: !!tenantId,
		retry: 1,
	});
}

async function getInvoices(
	tenantId: string,
	params?: { page?: number; pageSize?: number },
): Promise<PaginatedList<BillingRecord>> {
	return billingRecordsByRecords(tenantId, params) as Promise<PaginatedList<BillingRecord>>;
}

export function useInvoices(
	tenantId: string,
	params?: { page?: number; pageSize?: number },
): UseQueryResult<PaginatedList<BillingRecord>, Error> {
	return useQuery<PaginatedList<BillingRecord>, Error>({
		queryKey: queryKeys.invoices(tenantId, params),
		queryFn: () => getInvoices(tenantId, params),
		enabled: !!tenantId,
		retry: 1,
	});
}

async function getInvoice(invoiceNumber: string): Promise<InvoiceInfo> {
	const raw = (await billingInvoiceByInvoice(invoiceNumber)) as unknown as InvoiceInfo & {
		issuedAt?: string;
		lineItems?: InvoiceLineItem[];
	};
	// 后端契约（invoice 详情）：issued_at=计费周期开始、line_items=行项目、plan/billing_cycle=订阅展示字段。
	// 页面读 createdAt/items —— 统一在此映射（UP-64）；缺失时保留原值，不再依赖页面各自兜底。
	return {
		...raw,
		createdAt: raw.createdAt ?? raw.issuedAt,
		items: raw.items ?? raw.lineItems ?? [],
	};
}

export function useInvoice(invoiceNumber: string): UseQueryResult<InvoiceInfo, Error> {
	return useQuery<InvoiceInfo, Error>({
		queryKey: queryKeys.invoice(invoiceNumber),
		queryFn: () => getInvoice(invoiceNumber),
		enabled: !!invoiceNumber,
		retry: 1,
	});
}
