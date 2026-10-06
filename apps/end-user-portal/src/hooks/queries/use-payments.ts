import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PaymentInfo, ReceiptInfo } from './types';
import type { PaginatedList } from './types';
import { queryKeys } from './query-keys';

async function getPayments(params?: {
	page?: number;
	pageSize?: number;
	status?: string;
}): Promise<PaginatedList<PaymentInfo>> {
	const { payments } = await import('@autional/shared/generated/api');
	return payments(params as any) as Promise<PaginatedList<PaymentInfo>>;
}

async function getPaymentById(id: string): Promise<PaymentInfo> {
	const { paymentsByPayments } = await import('@autional/shared/generated/api');
	return paymentsByPayments(id) as Promise<PaymentInfo>;
}

async function getReceipt(paymentId: string): Promise<ReceiptInfo> {
	const { paymentsReceiptByPayments } = await import('@autional/shared/generated/api');
	return paymentsReceiptByPayments(paymentId) as Promise<ReceiptInfo>;
}

export function usePayments(params?: {
	page?: number;
	pageSize?: number;
	status?: string;
}): UseQueryResult<PaginatedList<PaymentInfo>, Error> {
	return useQuery<PaginatedList<PaymentInfo>, Error>({
		queryKey: queryKeys.payments(params),
		queryFn: () => getPayments(params),
		retry: 1,
	});
}

export function usePayment(id: string): UseQueryResult<PaymentInfo, Error> {
	return useQuery<PaymentInfo, Error>({
		queryKey: queryKeys.payment(id),
		queryFn: () => getPaymentById(id),
		enabled: !!id,
		retry: 1,
	});
}

export function useReceipt(paymentId: string): UseQueryResult<ReceiptInfo, Error> {
	return useQuery<ReceiptInfo, Error>({
		queryKey: queryKeys.receipt(paymentId),
		queryFn: () => getReceipt(paymentId),
		enabled: !!paymentId,
		retry: 1,
	});
}
