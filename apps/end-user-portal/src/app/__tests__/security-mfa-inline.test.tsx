import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

// 门户内联 SMS/Email 开通与关闭（2026-10-21 批准）：
// 开通 = send 发码 → verify 建档并启用（verify 对无效码返回 200 {valid:false}，必须判 valid）；
// 关闭 = 先发 purpose=disable 的码 → disable 消费该码。
// 回归点：不经 auth 站 /mfa-setup；未发码前不允许关闭；valid:false 不得假成功。

const PHONE = '+8613800138000';
const EMAIL = 'user@example.com';

const sendSms = vi.fn();
const verifySms = vi.fn();
const disableSms = vi.fn();
const sendEmail = vi.fn();
const verifyEmail = vi.fn();
const disableEmail = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useAuth: () => ({ user: { id: 'u1', phone: PHONE, email: EMAIL }, userId: 'u1' }),
	useAuthStore: { getState: () => ({ currentTenantId: '' }) },
	extractApiError: (err: any, fallback: string) => ({
		code: err?.response?.data?.code,
		message: err?.response?.data?.message || fallback,
	}),
	API_BASE_URL: '',
	processPasswordForTransmission: vi.fn(),
	useTenantSlug: () => 'acme-corp',
}));

vi.mock('@autional/shared/generated/api', () => ({
	PublicAuthConfigByAuthConfig: vi.fn(),
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
	useSendMFASMS: vi.fn(),
	useVerifyMFASMS: vi.fn(),
	useDisableMFASMS: vi.fn(),
	useSendMFAEmail: vi.fn(),
	useVerifyMFAEmail: vi.fn(),
	useDisableMFAEmail: vi.fn(),
	useOAuthConnections: vi.fn(),
	useOAuthProviders: vi.fn(),
	useUnbindOAuth: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

function cardAction(title: string): HTMLElement {
	const heading = screen.getByRole('heading', { name: title });
	const card = heading.closest('.rounded-lg') as HTMLElement;
	return within(card).getByRole('button');
}

function status(data: Record<string, unknown>) {
	vi.mocked(useMFAStatus).mockReturnValue({
		data: { totpEnabled: false, smsEnabled: false, emailEnabled: false, ...data },
		isLoading: false,
		error: null,
		refetch: vi.fn(),
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(usePasskeys).mockReturnValue({ data: [], isLoading: false, error: null } as never);
	vi.mocked(useChangePassword).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useDeletePasskey).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useEnableTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useVerifyTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useDisableTOTP).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useGenerateBackupCodes).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useResetTOTPMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useSendMFASMS).mockReturnValue({ mutateAsync: sendSms, isPending: false } as never);
	vi.mocked(useVerifyMFASMS).mockReturnValue({ mutateAsync: verifySms, isPending: false } as never);
	vi.mocked(useDisableMFASMS).mockReturnValue({ mutateAsync: disableSms, isPending: false } as never);
	vi.mocked(useSendMFAEmail).mockReturnValue({ mutateAsync: sendEmail, isPending: false } as never);
	vi.mocked(useVerifyMFAEmail).mockReturnValue({ mutateAsync: verifyEmail, isPending: false } as never);
	vi.mocked(useDisableMFAEmail).mockReturnValue({ mutateAsync: disableEmail, isPending: false } as never);
	vi.mocked(useOAuthConnections).mockReturnValue({ data: [], isLoading: false, error: null } as never);
	vi.mocked(useOAuthProviders).mockReturnValue({ data: [], isLoading: false, isError: false } as never);
	vi.mocked(useUnbindOAuth).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useToast).mockReturnValue({
		success: toastSuccess,
		error: toastError,
		info: vi.fn(),
	} as never);
});

describe('SecurityPage 内联 MFA 开通（短信/邮箱）', () => {
	it('短信：预填已绑手机号 → 发码 → 验码开通（不跳 auth 站）', async () => {
		status({});
		sendSms.mockResolvedValue(undefined);
		verifySms.mockResolvedValue({ valid: true });

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(cardAction('短信验证'));

		expect(screen.getByText('开通短信验证')).toBeInTheDocument();
		const contactInput = screen.getByLabelText('手机号') as HTMLInputElement;
		expect(contactInput.value).toBe(PHONE);

		fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
		await waitFor(() => expect(sendSms).toHaveBeenCalledWith({ phone: PHONE }));

		fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '123456' } });
		fireEvent.click(screen.getByRole('button', { name: '验证并开启' }));

		await waitFor(() =>
			expect(verifySms).toHaveBeenCalledWith({ phone: PHONE, code: '123456' }),
		);
		await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('验证成功'));
		await waitFor(() => expect(screen.queryByText('开通短信验证')).not.toBeInTheDocument());
	});

	it('邮箱：预填账号邮箱 → 发码 → 验码开通', async () => {
		status({});
		sendEmail.mockResolvedValue(undefined);
		verifyEmail.mockResolvedValue({ valid: true });

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(cardAction('邮箱验证'));

		expect(screen.getByText('开通邮箱验证')).toBeInTheDocument();
		const contactInput = screen.getByLabelText('邮箱地址') as HTMLInputElement;
		expect(contactInput.value).toBe(EMAIL);

		fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
		await waitFor(() => expect(sendEmail).toHaveBeenCalledWith({ email: EMAIL }));

		fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '654321' } });
		fireEvent.click(screen.getByRole('button', { name: '验证并开启' }));

		await waitFor(() =>
			expect(verifyEmail).toHaveBeenCalledWith({ email: EMAIL, code: '654321' }),
		);
		await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('验证成功'));
	});

	it('验码返回 valid:false（200 假成功形状）→ 报错且弹窗不关闭', async () => {
		status({});
		sendSms.mockResolvedValue(undefined);
		verifySms.mockResolvedValue({ valid: false });

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(cardAction('短信验证'));
		fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
		await waitFor(() => expect(sendSms).toHaveBeenCalled());

		fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '000000' } });
		fireEvent.click(screen.getByRole('button', { name: '验证并开启' }));

		await waitFor(() => expect(toastError).toHaveBeenCalledWith('验证码错误'));
		expect(screen.getByText('开通短信验证')).toBeInTheDocument();
		expect(toastSuccess).not.toHaveBeenCalledWith('验证成功');
	});

	it('关闭短信：先发 purpose=disable 的码，再消费该码关闭', async () => {
		status({ smsEnabled: true, smsPhone: PHONE });
		sendSms.mockResolvedValue(undefined);
		disableSms.mockResolvedValue(undefined);

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(cardAction('短信验证'));

		expect(screen.getByText('关闭 短信验证')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
		await waitFor(() =>
			expect(sendSms).toHaveBeenCalledWith({ phone: PHONE, purpose: 'disable' }),
		);

		fireEvent.change(screen.getByPlaceholderText('短信验证 验证码'), {
			target: { value: '123456' },
		});
		fireEvent.click(screen.getByRole('button', { name: '确认关闭' }));

		await waitFor(() => expect(disableSms).toHaveBeenCalledWith('123456'));
		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith('短信验证 已关闭'),
		);
	});

	it('关闭邮箱：未发码时拒绝关闭（码必须由 disable 用途签发）', async () => {
		status({ emailEnabled: true, emailAddress: EMAIL });

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(cardAction('邮箱验证'));

		expect(screen.getByText('关闭 邮箱验证')).toBeInTheDocument();
		fireEvent.change(screen.getByPlaceholderText('邮箱验证 验证码'), {
			target: { value: '123456' },
		});
		fireEvent.click(screen.getByRole('button', { name: '确认关闭' }));

		await waitFor(() => expect(toastError).toHaveBeenCalledWith('请先发送验证码'));
		expect(disableEmail).not.toHaveBeenCalled();
	});
});
