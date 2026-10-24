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
import { apiClient, useAuth } from '@autional/shared';

// S3 绑定腿回归锁：
// ① 发起绑定走 oauth-service（POST /oauth/api/v1/oauth/bind/initiate，JWT + return_to），
//    再整页跳转到服务端返回的 auth_url —— 不再拼 identity 的 /oauth/login?bind=true 死链。
// ② 回调带 oauth_bind=success|error 回到本页：提示结果、刷新连接列表、清掉查询参数。

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useAuth: vi.fn(() => ({ user: { id: 'u1' }, userId: 'u1' })),
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
	vi.mocked(useAuth).mockReturnValue({
		user: { id: 'u1', email: 'me@example.com' },
		userId: 'u1',
	} as never);
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

// F2：登录解析按 provider 已验证邮箱匹配账号。第三方邮箱与当前账号邮箱不一致时，
// 绑定后用它登录回不到本账号 —— 列表行必须给出持久提示（而不是等用户登录失败才发现）。
describe('SecurityPage 第三方账号邮箱一致性提示（F2）', () => {
	function connection(profileData: Record<string, unknown>) {
		return {
			id: 'c1',
			provider: 'github',
			profileData,
			createdAt: '2026-10-24T00:00:00Z',
		};
	}

	it('邮箱不一致：行内提示，并带出双方邮箱', async () => {
		vi.mocked(useOAuthConnections).mockReturnValue({
			data: [connection({ email: 'other@example.com', email_verified: true })],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });

		// 邮箱在行内出现两次（连接信息 + 提示文案），用 findAll 防「多个匹配」误判。
		expect((await screen.findAllByText(/other@example\.com/)).length).toBeGreaterThan(0);
		expect(screen.getByText(/与当前账号邮箱（me@example\.com）不一致/)).toBeTruthy();
	});

	it('邮箱一致（忽略大小写与空白）：不提示', async () => {
		vi.mocked(useOAuthConnections).mockReturnValue({
			data: [connection({ email: '  Me@Example.COM ', email_verified: true })],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });

		await screen.findByText('GitHub');
		expect(screen.queryByText(/与当前账号邮箱/)).toBeNull();
	});

	it('provider 未验证邮箱（email_verified=false）：行内提示', async () => {
		vi.mocked(useOAuthConnections).mockReturnValue({
			data: [connection({ email: 'me@example.com', email_verified: false })],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });

		expect(await screen.findByText(/邮箱未经提供方验证/)).toBeTruthy();
	});

	it('发起绑定弹窗：提示必须使用同邮箱的第三方账号', async () => {
		render(<SecurityPage />, { wrapper: TestWrapper });

		fireEvent.click(screen.getByRole('button', { name: /绑定新账户/ }));

		expect(
			await screen.findByText(/请使用邮箱为 me@example\.com 的第三方账号/),
		).toBeTruthy();
	});

	it('缺 email_verified 键（历史数据）：不误报', async () => {
		vi.mocked(useOAuthConnections).mockReturnValue({
			data: [connection({ email: 'me@example.com' })],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });

		await screen.findByText('GitHub');
		expect(screen.queryByText(/与当前账号邮箱/)).toBeNull();
		expect(screen.queryByText(/邮箱未经提供方验证/)).toBeNull();
	});
});
