import { render, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestWrapper } from '@/test/wrapper';
import { IdentifierChangeDialog } from '@/components/profile/IdentifierChangeDialog';

/**
 * DevTools 密码语义回归锁（2026-10-27）——
 * 手机号/邮箱变更对话框（submit 步与 reauth 步）的密码输入须在 <form> 内、
 * 带 autocomplete，且 form 内含 username 语义隐藏字段。
 * 这三条是 Chromium「Password field is not contained in a form / should have
 * autocomplete / should have username field」三条 VERBOSE [DOM] 警告清零的结构前提。
 * 另锁：表单化后 Enter/requestSubmit 走同一提交路径，空值不发请求。
 */

const mocks = vi.hoisted(() => ({
	changePhone: vi.fn(),
	verifyPhone: vi.fn(),
	changeEmail: vi.fn(),
	verifyEmail: vi.fn(),
	reauth: vi.fn(),
	revoke: vi.fn(),
	cancelEmail: vi.fn(),
	cancelPhone: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	toastInfo: vi.fn(),
	toastWarning: vi.fn(),
}));

vi.mock('@/hooks/queries/use-identifier-change', () => ({
	useChangePhone: () => ({ mutateAsync: mocks.changePhone, isPending: false }),
	useVerifyPhoneChange: () => ({ mutateAsync: mocks.verifyPhone, isPending: false }),
	useChangeEmail: () => ({ mutateAsync: mocks.changeEmail, isPending: false }),
	useVerifyEmailChangeByIdentifier: () => ({ mutateAsync: mocks.verifyEmail, isPending: false }),
	useReAuthenticate: () => ({ mutateAsync: mocks.reauth, isPending: false }),
	useRevokeOtherSessions: () => ({ mutateAsync: mocks.revoke, isPending: false }),
	useCancelEmailChange: () => ({ mutateAsync: mocks.cancelEmail, isPending: false }),
	useCancelPhoneChange: () => ({ mutateAsync: mocks.cancelPhone, isPending: false }),
	isReauthRequiredError: (err: unknown) => Boolean((err as { reauth?: boolean })?.reauth),
}));

vi.mock('@/hooks/use-toast', () => ({
	useToast: () => ({
		success: mocks.toastSuccess,
		error: mocks.toastError,
		info: mocks.toastInfo,
		warning: mocks.toastWarning,
	}),
}));

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useAuth: () => ({ user: { id: 'u1', username: 'alice' }, userId: 'u1' }),
	extractApiError: (_err: unknown, fallback: string) => ({ message: fallback }),
}));

function renderDialog(kind: 'phone' | 'email' = 'email') {
	return render(<IdentifierChangeDialog kind={kind} open onClose={vi.fn()} />, {
		wrapper: TestWrapper,
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('IdentifierChangeDialog 密码表单语义', () => {
	it('submit 步：密码在 form 内 + current-password + hidden username', () => {
		const { baseElement } = renderDialog('email');

		const password = baseElement.querySelector<HTMLInputElement>('input[type="password"]')!;
		expect(password).not.toBeNull();
		const form = password.closest('form');
		expect(form).not.toBeNull();
		expect(password.getAttribute('autocomplete')).toBe('current-password');

		const username = form!.querySelector<HTMLInputElement>('input[name="username"]');
		expect(username).not.toBeNull();
		expect(username!.getAttribute('autocomplete')).toBe('username');
		expect(username!.value).toBe('alice');
	});

	it('reauth 步：密码在 form 内 + current-password + hidden username', async () => {
		mocks.changeEmail.mockRejectedValue({ reauth: true });
		const { baseElement } = renderDialog('email');

		const newValue = baseElement.querySelector<HTMLInputElement>('input[type="email"]')!;
		fireEvent.change(newValue, { target: { value: 'new@example.com' } });
		fireEvent.change(baseElement.querySelector('input[type="password"]')!, {
			target: { value: 'secret' },
		});
		fireEvent.submit(baseElement.querySelector('form')!);

		await waitFor(() => {
			expect(mocks.changeEmail).toHaveBeenCalled();
		});

		const passwords = baseElement.querySelectorAll<HTMLInputElement>('input[type="password"]');
		expect(passwords).toHaveLength(1);
		const form = passwords[0].closest('form');
		expect(form).not.toBeNull();
		expect(passwords[0].getAttribute('autocomplete')).toBe('current-password');
		expect(form!.querySelector('input[name="username"]')).not.toBeNull();
	});

	it('表单提交走同一路径；空值不发请求', async () => {
		const { baseElement } = renderDialog('email');

		fireEvent.submit(baseElement.querySelector('form')!);
		await Promise.resolve();
		expect(mocks.changeEmail).not.toHaveBeenCalled();

		mocks.changeEmail.mockResolvedValue(undefined);
		fireEvent.change(baseElement.querySelector('input[type="email"]')!, {
			target: { value: 'new@example.com' },
		});
		fireEvent.change(baseElement.querySelector('input[type="password"]')!, {
			target: { value: 'secret' },
		});
		fireEvent.submit(baseElement.querySelector('form')!);

		await waitFor(() => {
			expect(mocks.changeEmail).toHaveBeenCalledWith(
				expect.objectContaining({ newEmail: 'new@example.com', password: 'secret' }),
			);
		});
	});

	it('reauth 步：空密码提交不发请求', async () => {
		mocks.changeEmail.mockRejectedValue({ reauth: true });
		const { baseElement } = renderDialog('email');

		fireEvent.change(baseElement.querySelector('input[type="email"]')!, {
			target: { value: 'new@example.com' },
		});
		fireEvent.change(baseElement.querySelector('input[type="password"]')!, {
			target: { value: 'secret' },
		});
		fireEvent.submit(baseElement.querySelector('form')!);

		// 进入 reauth 步：新值输入消失，只剩密码框。
		await waitFor(() => {
			expect(baseElement.querySelector('input[type="email"]')).toBeNull();
		});

		const reauthForm = baseElement.querySelector('form')!;
		fireEvent.submit(reauthForm);
		await Promise.resolve();
		expect(mocks.reauth).not.toHaveBeenCalled();

		mocks.reauth.mockResolvedValue({ stepUpToken: 'tok' });
		mocks.changeEmail.mockResolvedValue(undefined);
		fireEvent.change(reauthForm.querySelector('input[type="password"]')!, {
			target: { value: 'secret2' },
		});
		fireEvent.submit(reauthForm);

		await waitFor(() => {
			expect(mocks.reauth).toHaveBeenCalledWith('secret2');
		});
	});
});
