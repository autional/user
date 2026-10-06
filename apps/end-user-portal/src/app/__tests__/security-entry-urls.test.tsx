import { render, screen, within, fireEvent } from '@testing-library/react';
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
	useOAuthConnections,
	useUnbindOAuth,
} from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';

// UP-13 回归锁（AC-102）：security 页入口 URL 必须以 mock 基址开头、且不含被插值的函数源码文本。
// 修复前把别名符号当常量插值进 URL（该导出实为函数）→ 字符串内嵌 function 源码文本 → 404。
// UP-90：Passkey 卡由外跳 auth 站收敛为门户内导航（/security/passkeys/register），断言随之改探针形态。

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ user: { id: 'u1' }, userId: 'u1' }),
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
	useOAuthConnections: vi.fn(),
	useUnbindOAuth: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

// jsdom 不实现导航：替换 location 为可写存根，捕获 window.location.href 赋值。
const locationStub: { href: string } = { href: '' };

const openSpy = vi.fn();

function cardAction(title: string): HTMLElement {
	const heading = screen.getByRole('heading', { name: title });
	const card = heading.closest('.rounded-lg') as HTMLElement;
	return within(card).getByRole('button');
}

// UP-90 后 Passkey 走内部导航（MemoryRouter 内），用探针读路由落点。
function LocationProbe() {
	const { pathname, search } = useLocation();
	return <div data-testid="location">{pathname + search}</div>;
}

beforeAll(() => {
	Object.defineProperty(window, 'location', {
		configurable: true,
		writable: true,
		value: locationStub,
	});
});

describe('SecurityPage entry URLs (UP-13 / AC-102)', () => {
	beforeEach(() => {
		locationStub.href = '';
		openSpy.mockReset();
		vi.spyOn(window, 'open').mockImplementation(openSpy as never);

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
		vi.mocked(useOAuthConnections).mockReturnValue({ data: [], isLoading: false, error: null } as never);
		vi.mocked(useUnbindOAuth).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		vi.mocked(useToast).mockReturnValue({
			success: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
		} as never);
	});

	it('MFA 设置入口跳转 /auth/mfa-setup 且不含函数源码文本', () => {
		render(<SecurityPage />, { wrapper: TestWrapper });

		fireEvent.click(cardAction('短信验证'));

		expect(locationStub.href).toBe('/auth/mfa-setup');
		expect(locationStub.href.startsWith('/auth/')).toBe(true);
		expect(locationStub.href).not.toContain('function');
	});

	it('Passkey 入口内部导航到门户注册页（带 slug）且不含函数源码文本（UP-90 收敛）', () => {
		render(
			<>
				<SecurityPage />
				<LocationProbe />
			</>,
			{ wrapper: TestWrapper },
		);

		fireEvent.click(cardAction('Passkey'));

		// 收敛后不再外跳 auth 站（其页自述「注册已移至账户中心」，外跳只会弹回本门户）。
		expect(openSpy).not.toHaveBeenCalled();
		const path = screen.getByTestId('location').textContent || '';
		expect(path).toBe('/acme-corp/security/passkeys/register');
		expect(path.startsWith('/acme-corp/')).toBe(true);
		expect(path).not.toContain('function');
	});
});
