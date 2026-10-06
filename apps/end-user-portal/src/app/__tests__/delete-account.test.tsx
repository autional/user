import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestWrapper } from '@/test/wrapper';
import DeleteAccountPage from '@/app/security/delete-account/page';

const mockNavigate = vi.fn();
const mockPost = vi.fn().mockResolvedValue({ data: {} });
const mockLogout = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('react-router', async () => {
	const actual = await vi.importActual('react-router');
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

vi.mock('@autional/shared', () => ({
	apiClient: {
		post: (...args: any[]) => mockPost(...args),
	},
	extractApiError: (err: any, fallback: string) => ({
		message: err?.response?.data?.message || fallback,
	}),
	logout: (...args: any[]) => mockLogout(...args),
	// UP-13：页面已改调 getAUTH_PAGES_URL()（函数）；普通对象 mock 必须提供同名键，
	// 否则页面调用 undefined → 直接崩溃。此处键名与页面 import 严格一致。
	getAUTH_PAGES_URL: () => '/auth',
	getCurrentTenantId: () => '',
	useTenantSlug: () => 'acme-corp',
	processPasswordForTransmission: (password: string) => ({
		password,
		passwordTransmission: 'plain',
	}),
}));

vi.mock('@autional/shared/generated/api', () => ({
	authMeDeleteAccountPost: (...args: any[]) => mockPost(...args),
	PublicAuthConfigByAuthConfig: async () => ({
		passwordPolicy: { passwordTransmission: 'plain' },
	}),
}));

vi.mock('@/hooks/use-toast', () => ({
	useToast: () => ({
		success: mockToastSuccess,
		error: mockToastError,
	}),
}));

function typeConfirmText(value: string) {
	const input = screen.getByPlaceholderText('DELETE');
	fireEvent.change(input, { target: { value } });
}

function typePassword(value: string) {
	const input = screen.getByPlaceholderText('请输入当前密码');
	fireEvent.change(input, { target: { value } });
}

async function waitForDeleteEnabled() {
	await waitFor(() => {
		const deleteButton = screen.getByText('永久删除我的账户').closest('button');
		expect(deleteButton).not.toBeDisabled();
	});
}

async function setupAndType() {
	render(<DeleteAccountPage />, { wrapper: TestWrapper });
	typePassword('mypassword');
	typeConfirmText('DELETE');
	await waitForDeleteEnabled();
}

describe('DeleteAccountPage', () => {
	beforeEach(() => {
		mockPost.mockReset();
		mockPost.mockResolvedValue({ data: {} });
		mockNavigate.mockReset();
		mockLogout.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();
	});

	it('renders the delete confirmation page with warning text', () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		expect(screen.getByText('删除账户')).toBeInTheDocument();
		expect(screen.getByText('根据GDPR规定永久删除您的账户和数据')).toBeInTheDocument();
		expect(screen.getByText('警告：此操作不可逆')).toBeInTheDocument();
		expect(screen.getByText('永久删除我的账户')).toBeInTheDocument();
	});

	it('renders all consequence warnings', () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		expect(screen.getByText('您的个人资料将被永久删除')).toBeInTheDocument();
		expect(screen.getByText('所有历史记录和数据将被清除')).toBeInTheDocument();
		expect(screen.getByText('无法再使用该账号登录任何服务')).toBeInTheDocument();
		expect(screen.getByText('数据将在30天保留期后被彻底清除')).toBeInTheDocument();
	});

	it('renders the confirmation input with DELETE placeholder', () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		const input = screen.getByPlaceholderText('DELETE');
		expect(input).toBeInTheDocument();
	});

	it('renders cancel and delete buttons', () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		expect(screen.getByText('取消')).toBeInTheDocument();
		expect(screen.getByText('永久删除我的账户')).toBeInTheDocument();
	});

	it('delete button is disabled when confirmation text does not match DELETE', () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		const deleteButton = screen.getByText('永久删除我的账户').closest('button');
		expect(deleteButton).toBeDisabled();
	});

	it('delete button remains disabled when user types partial match', async () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		typePassword('mypassword');
		typeConfirmText('DELET');

		await waitFor(() => {
			const deleteButton = screen.getByText('永久删除我的账户').closest('button');
			expect(deleteButton).toBeDisabled();
		});
	});

	it('delete button is disabled when user types lowercase delete', async () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		typePassword('mypassword');
		typeConfirmText('delete');

		await waitFor(() => {
			const deleteButton = screen.getByText('永久删除我的账户').closest('button');
			expect(deleteButton).toBeDisabled();
		});
	});

	it('delete button becomes enabled when user types DELETE', async () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		typePassword('mypassword');
		typeConfirmText('DELETE');

		await waitForDeleteEnabled();
	});

	it('delete button is disabled when DELETE is typed but contains extra characters', async () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		typePassword('mypassword');
		typeConfirmText('DELETE ');

		await waitFor(() => {
			const deleteButton = screen.getByText('永久删除我的账户').closest('button');
			expect(deleteButton).toBeDisabled();
		});
	});

	it('calls delete API when delete button is clicked', async () => {
		await setupAndType();

		fireEvent.click(screen.getByText('永久删除我的账户'));

		await waitFor(() => {
			expect(mockPost).toHaveBeenCalledWith({
				password: 'mypassword',
				password_transmission: 'plain',
			});
		});
	});

	it('logs out and shows success toast after successful deletion', async () => {
		await setupAndType();

		vi.useFakeTimers();
		fireEvent.click(screen.getByText('永久删除我的账户'));

		await vi.runAllTimersAsync();

		expect(mockToastSuccess).toHaveBeenCalledWith('账户已成功删除');
		// U350 复查：带租户 slug 直连 auth 站登录页（裸 /login 经入口路由会剥旗标）
		expect(mockLogout).toHaveBeenCalledWith('/auth/acme-corp/login?account_deleted=true');

		vi.useRealTimers();
	});

	it('shows error toast when deletion fails', async () => {
		mockPost.mockRejectedValueOnce({
			response: { data: { message: '删除账户失败，请稍后重试' } },
		});

		await setupAndType();

		vi.useFakeTimers();
		fireEvent.click(screen.getByText('永久删除我的账户'));

		await vi.runAllTimersAsync();

		expect(mockToastError).toHaveBeenCalled();

		vi.useRealTimers();
	});

	it('displays inline error message when deletion fails', async () => {
		mockPost.mockRejectedValueOnce({
			response: { data: { message: '删除账户失败，请稍后重试' } },
		});

		await setupAndType();

		fireEvent.click(screen.getByText('永久删除我的账户'));

		await waitFor(() => {
			expect(screen.getByText('删除账户失败，请稍后重试')).toBeInTheDocument();
		});
	});

	it('cancel button navigates back to security page', () => {
		render(<DeleteAccountPage />, { wrapper: TestWrapper });

		fireEvent.click(screen.getByText('取消'));

		expect(mockNavigate).toHaveBeenCalledWith('/acme-corp/security');
	});

	it('delete button shows loading state while submitting', async () => {
		await setupAndType();

		mockPost.mockResolvedValue(new Promise(() => {}));

		fireEvent.click(screen.getByText('永久删除我的账户'));

		await waitFor(() => {
			expect(mockPost).toHaveBeenCalled();
		});

		expect(screen.getByText('删除中...')).toBeInTheDocument();

		mockPost.mockResolvedValue({ data: {} });
	});

	it('clear error when retrying after a failed attempt', async () => {
		mockPost.mockRejectedValueOnce({
			response: { data: { message: '删除账户失败，请稍后重试' } },
		});

		await setupAndType();

		fireEvent.click(screen.getByText('永久删除我的账户'));

		await waitFor(() => {
			expect(screen.getByText('删除账户失败，请稍后重试')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('永久删除我的账户'));

		await waitFor(() => {
			expect(screen.queryByText('删除账户失败，请稍后重试')).not.toBeInTheDocument();
		});
	});
});
