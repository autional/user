import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useInvoice, usePublicPlans } from '@/hooks/queries/use-billing';
import { usePrivacy, useUpdatePrivacy } from '@/hooks/queries/use-profile';
import { useUnreadNotifications } from '@/hooks/queries/use-notifications';
import { useFamilyMembers } from '@/hooks/queries/use-devices';

// 契约往返回归锁（T1 行动）：apiClient 响应拦截器已把 {code,data} / {code,items,total,…}
// 信封解包到顶层，hook 读取面必须按「解包后形状」单读。这组测试用真实 hook + 假 generated api
// 锁住形状：任何回退成双解包（res.data.data / data?.data）立即变红。
// 对应修复：UP-64（发票 issued_at→createdAt / line_items→items）、P1 偏好（顶层 {privacy}）、
// 公开套餐（顶层 {plans}）、未读通知 / 家庭共享（顶层 {items}）。

const h = vi.hoisted(() => ({
	invoice: vi.fn(),
	plans: vi.fn(),
	privacyGet: vi.fn(),
	privacyPut: vi.fn(),
	apiGet: vi.fn(),
	familyAccess: vi.fn(),
}));

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ user: { id: 'u1' }, userId: 'u1' }),
	apiClient: { get: h.apiGet },
}));

// 全量显式工厂（仓内惯例）：列出被测 hook 模块顶层 import 的全部 generated api 函数，
// 被断言者接 h.*，其余占位即可（测试不触发）。
vi.mock('@autional/shared/generated/api', () => ({
	// billing
	billingSubscriptionBySubscription: vi.fn(),
	billingRecordsSearchByRecords: vi.fn(),
	billingUsageCurrentByUsage: vi.fn(),
	billingStatisticsByStatistics: vi.fn(),
	billingPlans: h.plans,
	billingSubscribePost: vi.fn(),
	billingRecordsByRecords: vi.fn(),
	billingInvoiceByInvoice: h.invoice,
	// profile
	authMe: vi.fn(),
	authMePut: vi.fn(),
	authMePasswordPut: vi.fn(),
	profilesAvatarUploadByProfilesPost: vi.fn(),
	profilesPrivacyByProfiles: h.privacyGet,
	profilesPrivacyByProfilesPut: h.privacyPut,
	authSendVerificationEmailPost: vi.fn(),
	authVerifyEmailPost: vi.fn(),
	// notifications
	notifications: vi.fn(),
	notificationsReadByNotificationsPut: vi.fn(),
	notificationsReadAllPut: vi.fn(),
	notificationsByNotificationsDelete: vi.fn(),
	notificationsPreferencesByPreferences: vi.fn(),
	notificationsPreferencesByPreferencesPut: vi.fn(),
	announcements: vi.fn(),
	// devices
	authMeDevices: vi.fn(),
	authMeDevicesByDevicesDelete: vi.fn(),
	authMeDevicesTrustByDevicesPut: vi.fn(),
	iots: vi.fn(),
	iotsPairPost: vi.fn(),
	iotsFamilyAccessByIots: h.familyAccess,
	iotsFamilyAccessByIotsPost: vi.fn(),
	iotsFamilyAccessByIotsByFamilyAccessDelete: vi.fn(),
}));

function createWrapper() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
	};
}

describe('契约往返回归锁（解包后顶层形状）', () => {
	beforeEach(() => {
		h.invoice.mockReset();
		h.plans.mockReset();
		h.privacyGet.mockReset();
		h.privacyPut.mockReset();
		h.apiGet.mockReset();
		h.familyAccess.mockReset();
	});

	it('UP-64：useInvoice 映射 issued_at→createdAt、line_items→items，plan/billing_cycle 透传', async () => {
		h.invoice.mockResolvedValue({
			invoiceNumber: 'INV-DEMO-0001',
			status: 'paid',
			plan: 'pro',
			billingCycle: 'monthly',
			issuedAt: '2026-10-01T08:00:00Z',
			lineItems: [
				{ description: 'Demo Pro plan · monthly', quantity: 1, unitPrice: '499', amount: '499' },
			],
		});

		const { result } = renderHook(() => useInvoice('INV-DEMO-0001'), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.createdAt).toBe('2026-10-01T08:00:00Z');
		expect(result.current.data?.items).toEqual([
			{ description: 'Demo Pro plan · monthly', quantity: 1, unitPrice: '499', amount: '499' },
		]);
		expect(result.current.data?.plan).toBe('pro');
		expect(result.current.data?.billingCycle).toBe('monthly');
	});

	it('UP-64：useInvoice 缺 issued_at/line_items 时 items 落空数组，不依赖页面兜底', async () => {
		h.invoice.mockResolvedValue({ invoiceNumber: 'INV-2', status: 'pending' });

		const { result } = renderHook(() => useInvoice('INV-2'), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.createdAt).toBeUndefined();
		expect(result.current.data?.items).toEqual([]);
	});

	it('P1 已读：useUnreadNotifications 读原生响应 data.items 且带 page/page_size', async () => {
		h.apiGet.mockResolvedValue({
			data: { items: [{ id: 'n1', title: 't', isRead: false }], total: 1 },
		});

		const { result } = renderHook(() => useUnreadNotifications(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([{ id: 'n1', title: 't', isRead: false }]);
		// 后端 UnreadNotificationsListQuery.Validate 要求分页参数，遗漏会 422
		expect(h.apiGet).toHaveBeenCalledWith(
			'/notification/api/v1/notifications/unread',
			expect.objectContaining({ params: { page: 1, page_size: 20 } }),
		);
	});

	it('P1 偏好：usePrivacy 读顶层 {privacy}（读错键会落本地默认值，本断言即红）', async () => {
		h.privacyGet.mockResolvedValue({
			privacy: { showEmail: false, showPhone: true, profileVisibility: 'public' },
		});

		const { result } = renderHook(() => usePrivacy(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		// 三个值都与本地默认（true/false/private）相反 —— 双解包回退必红
		expect(result.current.data).toEqual({
			showEmail: false,
			showPhone: true,
			profileVisibility: 'public',
		});
	});

	it('P1 偏好：useUpdatePrivacy 响应缺字段时回显入参（顶层 {privacy} 读取）', async () => {
		h.privacyPut.mockResolvedValue({ privacy: { showPhone: true } });

		const { result } = renderHook(() => useUpdatePrivacy(), { wrapper: createWrapper() });

		const res = await result.current.mutateAsync({});
		// showPhone 只可能来自响应（入参为空）；双解包回退会落 false
		expect(res.showPhone).toBe(true);
		expect(res.showEmail).toBe(true);
		expect(res.profileVisibility).toBe('private');
	});

	it('公开套餐：usePublicPlans 读顶层 {plans} 并映射 planId/price 兼容键', async () => {
		h.plans.mockResolvedValue({
			plans: [
				{
					planId: 'pro',
					name: 'Pro',
					description: '团队版',
					priceMonthly: '49',
					priceYearly: '490',
					features: ['a'],
				},
			],
		});

		const { result } = renderHook(() => usePublicPlans(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.items).toHaveLength(1);
		expect(result.current.data?.items[0]).toMatchObject({
			id: 'pro',
			plan: 'pro',
			monthlyPrice: '49',
			yearlyPrice: '490',
		});
	});

	it('家庭共享：useFamilyMembers 读顶层 {items}（ListResponse 解包形状）', async () => {
		h.familyAccess.mockResolvedValue({
			items: [{ id: 'm1', email: 'a@b.c', role: 'viewer' }],
		});

		const { result } = renderHook(() => useFamilyMembers('device-1'), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([{ id: 'm1', email: 'a@b.c', role: 'viewer' }]);
	});
});
