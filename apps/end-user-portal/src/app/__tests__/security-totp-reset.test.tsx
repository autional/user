import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
	useOAuthConnections,
	useUnbindOAuth,
} from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';

// UP-17-A 回归锁（AC-302 / AC-303 / AC-306；探针 UF1-05 判 P1）：
// 409(61040010) → refetch 后未启用 → 恢复条（中文文案 + 重置按钮）→ 重置（真钩子断言
// DELETE /mfa/methods/totp + invalidate ['mfa', userId]）→ 再启用放行；
// 已启用分支 → 友好提示不展示恢复条；关弹窗后再启用 → 409 → 重置 → 成功（AC-306 全路径）。

const h = vi.hoisted(() => ({
	deleteSpy: vi.fn(),
}));

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ user: { id: 'u1' }, userId: 'u1' }),
	useAuthStore: { getState: () => ({ currentTenantId: '' }) },
	extractApiError: (err: any, fallback: string) => ({
		code: err?.response?.data?.code,
		message: err?.response?.data?.message || fallback,
	}),
	logout: vi.fn(),
	getAUTH_PAGES_URL: () => '/auth',
	API_BASE_URL: '',
	processPasswordForTransmission: vi.fn(),
	useTenantSlug: () => 'acme-corp',
}));

vi.mock('@autional/shared/generated/api', () => ({
	PublicAuthConfigByAuthConfig: vi.fn(),
	mfaMethodsByMethodsDelete: h.deleteSpy,
}));

vi.mock('@/hooks/queries', () => ({
	useMFAStatus: vi.fn(),
	usePasskeys: vi.fn(),
	useChangePassword: vi.fn(),
	useDeletePasskey: vi.fn(),
	useEnableTOTP: vi.fn(),
	useVerifyTOTP: vi.fn(),
	useDisableTOTP: vi.fn(),
	useGenerateBackupCodes: vi.fn(),
	useResetTOTPMutation: vi.fn(),
	useOAuthConnections: vi.fn(),
	useUnbindOAuth: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

const TOTP_TITLE = 'TOTP 验证器';
const BANNER_TEXT = '检测到未完成的 TOTP 设置，请先重置后再重新开启。';
const ERR_409 = { response: { data: { code: 61040010, message: 'TOTP already enabled' } } };

function totpCardAction(): HTMLElement {
	const heading = screen.getByRole('heading', { name: TOTP_TITLE });
	const card = heading.closest('.rounded-lg') as HTMLElement;
	return within(card).getByRole('button');
}

function statusResponse(totpEnabled: boolean, refetch: ReturnType<typeof vi.fn>) {
	vi.mocked(useMFAStatus).mockReturnValue({
		data: { totpEnabled, smsEnabled: false, emailEnabled: false, methods: undefined },
		isLoading: false,
		error: null,
		refetch,
	} as never);
}

describe('SecurityPage TOTP 409 分流 + pending 重置闭环（UP-17-A / AC-302, AC-303, AC-306）', () => {
	beforeEach(() => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);

		vi.mocked(usePasskeys).mockReturnValue({ data: [], isLoading: false, error: null } as never);
		vi.mocked(useChangePassword).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		vi.mocked(useDeletePasskey).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		vi.mocked(useEnableTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		vi.mocked(useVerifyTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		vi.mocked(useDisableTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		vi.mocked(useGenerateBackupCodes).mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		vi.mocked(useResetTOTPMutation).mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		vi.mocked(useOAuthConnections).mockReturnValue({
			data: [],
			isLoading: false,
			error: null,
		} as never);
		vi.mocked(useUnbindOAuth).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		vi.mocked(useToast).mockReturnValue({
			success: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
		} as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('① 409 + refetch 未启用 → 中文恢复文案 + 重置按钮（不再静默/裸报错）', async () => {
		const enableMutate = vi.fn().mockRejectedValue(ERR_409);
		vi.mocked(useEnableTOTP).mockReturnValue({ mutateAsync: enableMutate, isPending: false } as never);
		const refetch = vi.fn().mockResolvedValue({ data: { totpEnabled: false, methods: undefined } });
		statusResponse(false, refetch);

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(totpCardAction());

		await screen.findByText(BANNER_TEXT);
		expect(screen.getByText('重置 TOTP 设置')).toBeInTheDocument();
		expect(refetch).toHaveBeenCalledTimes(1);
		// 分流正确：未开启 setup 弹窗
		expect(screen.queryByText('开启 TOTP 验证')).not.toBeInTheDocument();
		expect(enableMutate).toHaveBeenCalledTimes(1);
	});

	it('② 重置 → 确认对话框 + 成功提示 + 恢复条闭合 + 再启用放行', async () => {
		const enableMutate = vi
			.fn()
			.mockRejectedValueOnce(ERR_409)
			.mockResolvedValueOnce({ secret: 'S2', qrCode: 'data:image/png;base64,AAA' });
		vi.mocked(useEnableTOTP).mockReturnValue({ mutateAsync: enableMutate, isPending: false } as never);
		const refetch = vi.fn().mockResolvedValue({ data: { totpEnabled: false, methods: undefined } });
		statusResponse(false, refetch);
		const resetMutate = vi.fn().mockResolvedValue(undefined);
		vi.mocked(useResetTOTPMutation).mockReturnValue({
			mutateAsync: resetMutate,
			isPending: false,
		} as never);
		const toastSuccess = vi.fn();
		vi.mocked(useToast).mockReturnValue({
			success: toastSuccess,
			error: vi.fn(),
			info: vi.fn(),
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(totpCardAction());
		await screen.findByText(BANNER_TEXT);

		fireEvent.click(screen.getByText('重置 TOTP 设置'));

		await waitFor(() => expect(resetMutate).toHaveBeenCalledTimes(1));
		expect(window.confirm).toHaveBeenCalledWith('重置将清除当前未完成的 TOTP 设置（包括密钥），确定要重置吗？');
		expect(toastSuccess).toHaveBeenCalledWith('TOTP 设置已重置，请重新开启。');
		await waitFor(() => expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument());

		// 再启用放行（重置后同用户可重新开启）
		fireEvent.click(totpCardAction());
		await screen.findByText('开启 TOTP 验证');
		expect(enableMutate).toHaveBeenCalledTimes(2);
	});

	it('③ 已启用分支（refetch totpEnabled=true）→ 友好提示 + 关弹窗，不展示恢复条', async () => {
		const enableMutate = vi.fn().mockRejectedValue(ERR_409);
		vi.mocked(useEnableTOTP).mockReturnValue({ mutateAsync: enableMutate, isPending: false } as never);
		const refetch = vi.fn().mockResolvedValue({ data: { totpEnabled: true, methods: ['totp'] } });
		statusResponse(true, refetch);
		const toastInfo = vi.fn();
		vi.mocked(useToast).mockReturnValue({
			success: vi.fn(),
			error: vi.fn(),
			info: toastInfo,
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(totpCardAction());

		await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('TOTP 已启用'));
		expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument();
		expect(screen.queryByText('重置 TOTP 设置')).not.toBeInTheDocument();
	});

	it('④ AC-306 全路径：开启弹窗 → 关闭 → 再启用 409 → 重置 → 再启用成功', async () => {
		const enableMutate = vi
			.fn()
			.mockResolvedValueOnce({ secret: 'FIRST', qrCode: 'data:image/png;base64,AAA' })
			.mockRejectedValueOnce(ERR_409)
			.mockResolvedValueOnce({ secret: 'SECOND', qrCode: 'data:image/png;base64,BBB' });
		vi.mocked(useEnableTOTP).mockReturnValue({ mutateAsync: enableMutate, isPending: false } as never);
		const refetch = vi.fn().mockResolvedValue({ data: { totpEnabled: false, methods: undefined } });
		statusResponse(false, refetch);
		const resetMutate = vi.fn().mockResolvedValue(undefined);
		vi.mocked(useResetTOTPMutation).mockReturnValue({
			mutateAsync: resetMutate,
			isPending: false,
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });

		// 1) 正常开启 → 弹窗 → 关闭
		fireEvent.click(totpCardAction());
		await screen.findByText('开启 TOTP 验证');
		fireEvent.click(screen.getByText('取消'));
		await waitFor(() => expect(screen.queryByText('开启 TOTP 验证')).not.toBeInTheDocument());

		// 2) 关弹窗后再启用 → 409 → 恢复条
		fireEvent.click(totpCardAction());
		await screen.findByText(BANNER_TEXT);

		// 3) 重置 → 恢复条闭合
		fireEvent.click(screen.getByText('重置 TOTP 设置'));
		await waitFor(() => expect(resetMutate).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument());

		// 4) 再启用成功
		fireEvent.click(totpCardAction());
		await screen.findByText('开启 TOTP 验证');
		expect(enableMutate).toHaveBeenCalledTimes(3);
	});
});

describe('useResetTOTPMutation 真钩子（AC-303：DELETE 入参 + invalidate）', () => {
	beforeEach(() => {
		h.deleteSpy.mockReset();
		h.deleteSpy.mockResolvedValue({});
	});

	it('mutateAsync → DELETE method=totp 且 user_id 自身 → invalidate [mfa, userId]', async () => {
		const realQueries = await vi.importActual<typeof import('@/hooks/queries')>('@/hooks/queries');

		function Harness() {
			const m = realQueries.useResetTOTPMutation();
			return <button onClick={() => void m.mutateAsync()}>do-reset</button>;
		}

		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
		render(
			<QueryClientProvider client={qc}>
				<Harness />
			</QueryClientProvider>,
		);

		fireEvent.click(screen.getByText('do-reset'));

		await waitFor(() => expect(h.deleteSpy).toHaveBeenCalledWith('totp', { user_id: 'u1' }));
		await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['mfa', 'u1'] }));
	});
});
