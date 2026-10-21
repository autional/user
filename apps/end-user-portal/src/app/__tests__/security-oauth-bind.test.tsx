import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { useLocation } from 'react-router';
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
import { apiClient } from '@autional/shared';

// S3 绑定腿回归锁：
// ① 发起绑定走 oauth-service（POST /oauth/api/v1/oauth/bind/initiate，JWT + return_to），
//    再整页跳转到服务端返回的 auth_url —— 不再拼 identity 的 /oauth/login?bind=true 死链。
// ② 回调带 oauth_bind=success|error 回到本页：提示结果、刷新连接列表、清掉查询参数。

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useAuth: () => ({ user: { id: 'u1' }, userId: 'u1' }),
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

// jsdom 不实现导航：替换 location 为可写存根（origin/pathname/search 供 return_to 拼装，
// assign 捕获整页跳转目标）。
const locationStub = {
	origin: 'https://user.example.com',
	pathname: '/acme-corp/security',
	search: '?tab=links',
	href: '',
	assign: vi.fn(),
};

function LocationProbe() {
	const { pathname, search } = useLocation();
	return <div data-testid="location">{pathname + search}</div>;
}

function entryWrapper(entry: string) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <TestWrapper initialEntries={[entry]}>{children}</TestWrapper>;
	};
}

beforeAll(() => {
	Object.defineProperty(window, 'location', {
		configurable: true,
		writable: true,
		value: locationStub,
	});
});

let postMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	locationStub.href = '';
	locationStub.assign.mockReset();
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	toastMock.info.mockReset();
	postMock = vi.mocked(apiClient.post) as unknown as ReturnType<typeof vi.fn>;
	postMock.mockReset();

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
	vi.mocked(useToast).mockReturnValue(toastMock as never);
});

describe('SecurityPage 第三方账号绑定（S3）', () => {
	it('发起绑定：带 provider + return_to 调 bind/initiate，再整页跳转 auth_url', async () => {
		postMock.mockResolvedValue({
			data: { authUrl: 'https://github.com/login/oauth/authorize?client_id=abc' },
		});

		render(<SecurityPage />, { wrapper: TestWrapper });

		fireEvent.click(screen.getByRole('button', { name: /绑定新账户/ }));
		fireEvent.click(screen.getByRole('button', { name: /GitHub/ }));

		await waitFor(() =>
			expect(postMock).toHaveBeenCalledWith('/oauth/api/v1/oauth/bind/initiate', {
				provider: 'github',
				returnTo: 'https://user.example.com/acme-corp/security?tab=links',
			}),
		);
		await waitFor(() =>
			expect(locationStub.assign).toHaveBeenCalledWith(
				'https://github.com/login/oauth/authorize?client_id=abc',
			),
		);
	});

	it('发起绑定失败：提示错误且不跳转', async () => {
		postMock.mockRejectedValue(new Error('network down'));

		render(<SecurityPage />, { wrapper: TestWrapper });

		fireEvent.click(screen.getByRole('button', { name: /绑定新账户/ }));
		fireEvent.click(screen.getByRole('button', { name: /GitHub/ }));

		await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
		expect(locationStub.assign).not.toHaveBeenCalled();
	});

	it('oauth_bind=success 回跳：提示成功并清理查询参数', async () => {
		render(
			<>
				<SecurityPage />
				<LocationProbe />
			</>,
			{ wrapper: entryWrapper('/acme-corp/security?oauth_bind=success&provider=github') },
		);

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith('第三方账户绑定成功'),
		);
		await waitFor(() =>
			expect(screen.getByTestId('location').textContent).toBe('/acme-corp/security'),
		);
	});

	it('oauth_bind=error 回跳：按 reason 展示本地化原因并清理查询参数', async () => {
		render(
			<>
				<SecurityPage />
				<LocationProbe />
			</>,
			{ wrapper: entryWrapper('/acme-corp/security?oauth_bind=error&reason=already_bound&provider=github') },
		);

		await waitFor(() =>
			expect(toastMock.error).toHaveBeenCalledWith('该第三方账号已绑定其他账户'),
		);
		await waitFor(() =>
			expect(screen.getByTestId('location').textContent).toBe('/acme-corp/security'),
		);
	});

	it('oauth_bind=error 未知 reason：回落通用失败文案', async () => {
		render(<SecurityPage />, {
			wrapper: entryWrapper('/acme-corp/security?oauth_bind=error&reason=something_new'),
		});

		await waitFor(() =>
			expect(toastMock.error).toHaveBeenCalledWith('第三方账户绑定失败'),
		);
	});
});
