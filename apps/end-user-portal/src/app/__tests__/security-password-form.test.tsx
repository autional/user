import { render, screen, fireEvent } from '@testing-library/react';
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

/**
 * DevTools 密码语义回归锁（2026-10-27）——
 * 安全页「修改密码」表单：密码输入须在 <form> 内、带 autocomplete，
 * 且 form 内含 username 语义隐藏字段。这三条是 Chromium
 * 「Password field is not contained in a form / should have autocomplete /
 * should have username field」三条 VERBOSE [DOM] 警告清零的结构前提。
 * （真验证在 console 复采：VERBOSE [DOM] 密码告警归零。）
 */

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useAuth: () => ({ user: { id: 'u1', username: 'alice' }, userId: 'u1' }),
	useAuthStore: { getState: () => ({ currentTenantId: '' }) },
	extractApiError: (err: any, fallback: string) => ({
		code: err?.response?.data?.code,
		message: fallback,
	}),
	logout: vi.fn(),
	getAUTH_PAGES_URL: () => '/auth',
	API_BASE_URL: '',
	processPasswordForTransmission: vi.fn(),
	useTenantSlug: () => 'acme-corp',
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

beforeEach(() => {
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
	vi.mocked(useGenerateBackupCodes).mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
	vi.mocked(useResetTOTPMutation).mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
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
	vi.mocked(useOAuthConnections).mockReturnValue({ data: [], isLoading: false, error: null } as never);
	vi.mocked(useOAuthProviders).mockReturnValue({
		data: [],
		isLoading: false,
		isError: false,
	} as never);
	vi.mocked(useUnbindOAuth).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	vi.mocked(useToast).mockReturnValue({
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	} as never);
});

describe('SecurityPage 密码表单语义', () => {
	it('修改密码表单：密码输入在 form 内 + autocomplete + hidden username', () => {
		const { container } = render(<SecurityPage />, { wrapper: TestWrapper });

		fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

		const passwords = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
		expect(passwords).toHaveLength(3);
		expect(passwords[0].getAttribute('autocomplete')).toBe('current-password');
		expect(passwords[1].getAttribute('autocomplete')).toBe('new-password');
		expect(passwords[2].getAttribute('autocomplete')).toBe('new-password');

		const form = passwords[0].closest('form');
		expect(form).not.toBeNull();
		for (const password of passwords) {
			expect(password.closest('form')).toBe(form);
		}

		const username = form!.querySelector<HTMLInputElement>('input[name="username"]');
		expect(username).not.toBeNull();
		expect(username!.getAttribute('autocomplete')).toBe('username');
		expect(username!.value).toBe('alice');
	});
});
