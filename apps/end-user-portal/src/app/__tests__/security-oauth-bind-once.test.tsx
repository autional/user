import { useState } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestWrapper } from '@/test/wrapper';
import SecurityPage from '@/app/security/page';
import {
	useMFAStatus,
	usePasskeys,
	useChangePassword,
	useDeletePasskey,
	useEnableTOTP,
	useVerifyTOTP,
	useDisableTOTP,
	useGenerateBackupCodes,
	useResetTOTPMutation,
	useSendMFASMS,
	useVerifyMFASMS,
	useDisableMFASMS,
	useSendMFAEmail,
	useVerifyMFAEmail,
	useDisableMFAEmail,
	useOAuthConnections,
	useOAuthProviders,
	useUnbindOAuth,
} from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';

// F1 回归锁（2026-10-24 prod：约 1,900 次 accounts 请求 / 161 个堆叠 toast）。
//
// 复现三要素，缺一不可：
//   ① 回跳 URL 仍带 oauth_bind（导航提交是异步的，清理尚未发生）；
//   ② toast 身份每次渲染都变化（真实场景：toast 状态一变，context 值就是新对象）；
//   ③ effect 依赖变化后重跑，仍读到旧的 searchParams。
// 本文件用「导航永不提交」的 useSearchParams +「每次渲染换身份并在调用时触发重渲染」
// 的 useToast 模拟 ①②③。修复前：success 被反复调用直至 React 抛更新深度错误；
// 修复后（消费一次 ref 守卫）：success 恰好 1 次。

vi.mock('react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-router')>();
	return {
		...actual,
		// 每次调用都返回新对象（模拟依赖抖动），且 setSearchParams 永不提交（模拟导航挂起）。
		useSearchParams: () =>
			[new URLSearchParams('oauth_bind=success&provider=github'), vi.fn()] as never,
	};
});

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useAuth: () => ({ user: { id: 'u1', email: 'me@example.com' }, userId: 'u1' }),
	useAuthStore: { getState: () => ({ currentTenantId: '' }) },
	extractApiError: (err: any, fallback: string) => ({
		code: err?.response?.data?.code,
		message: err?.message || fallback,
	}),
	apiClient: { post: vi.fn() },
	logout: vi.fn(),
	getAUTH_PAGES_URL: () => '/auth',
	API_BASE_URL: '',
	processPasswordForTransmission: vi.fn(),
	useTenantSlug: () => 'acme-corp',
}));

vi.mock('@/hooks/queries', () => {
	const oauthConnectionsKey = (userId: string) => ['oauth-connections', userId];
	return {
		useMFAStatus: vi.fn(),
		usePasskeys: vi.fn(),
		useChangePassword: vi.fn(),
		useDeletePasskey: vi.fn(),
		useEnableTOTP: vi.fn(),
		useVerifyTOTP: vi.fn(),
		useDisableTOTP: vi.fn(),
		useGenerateBackupCodes: vi.fn(),
		useResetTOTPMutation: vi.fn(),
		useSendMFASMS: vi.fn(),
		useVerifyMFASMS: vi.fn(),
		useDisableMFASMS: vi.fn(),
		useSendMFAEmail: vi.fn(),
		useVerifyMFAEmail: vi.fn(),
		useDisableMFAEmail: vi.fn(),
		useOAuthConnections: vi.fn(),
		useOAuthProviders: vi.fn(),
		useUnbindOAuth: vi.fn(),
		queryKeys: { oauthConnections: oauthConnectionsKey },
	};
});

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

const toastMock = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

beforeEach(() => {
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	toastMock.info.mockReset();

	vi.mocked(useMFAStatus).mockReturnValue({
		data: { totpEnabled: false, smsEnabled: false, emailEnabled: false, methods: undefined },
		isLoading: false,
		error: null,
		refetch: vi.fn(),
	} as never);
	vi.mocked(usePasskeys).mockReturnValue({ data: [], isLoading: false, error: null } as never);
	vi.mocked(useChangePassword).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useDeletePasskey).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useEnableTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useVerifyTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useDisableTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useGenerateBackupCodes).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useResetTOTPMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	for (const hook of [
		useSendMFASMS,
		useVerifyMFASMS,
		useDisableMFASMS,
		useSendMFAEmail,
		useVerifyMFAEmail,
		useDisableMFAEmail,
	]) {
		vi.mocked(hook).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	}
	vi.mocked(useOAuthProviders).mockReturnValue({
		data: [{ id: 'github', name: 'GitHub' }],
		isLoading: false,
		isError: false,
	} as never);
	vi.mocked(useOAuthConnections).mockReturnValue({
		data: [],
		isLoading: false,
		error: null,
		refetch: vi.fn(),
	} as never);
	vi.mocked(useUnbindOAuth).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

	// 真实的 toast context 在状态变化时会给出新对象；这里模拟「身份每次渲染都变，
	// 且每次调用都会触发一次重渲染」——这正是死循环的燃料。
	vi.mocked(useToast).mockImplementation(function useToastChurn() {
		const [, force] = useState(0);
		return {
			success: (message?: string) => {
				toastMock.success(message);
				force((n) => n + 1);
			},
			error: (message?: string) => {
				toastMock.error(message);
				force((n) => n + 1);
			},
			info: toastMock.info,
		} as never;
	});
});

describe('SecurityPage 绑定返回态只消费一次（F1）', () => {
	it('导航未提交且 toast 每次渲染换身份：成功提示只出现 1 次', async () => {
		render(<SecurityPage />, { wrapper: TestWrapper });

		await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1));
		// 给潜在的死循环留出时间：修复前这里会持续增长（或抛更新深度错误）。
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(toastMock.success).toHaveBeenCalledTimes(1);
		expect(toastMock.error).not.toHaveBeenCalled();
	});
});
