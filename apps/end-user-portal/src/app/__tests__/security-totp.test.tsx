import { render, screen, fireEvent, within } from '@testing-library/react';
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
	useOAuthConnections,
	useUnbindOAuth,
} from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';

// UP-16 回归锁（AC-201 / AC-202）：TOTP 设置弹窗二维码字段语义。
// 修复前渲染 totpSetup.qrCodeUrl（otpauth:// 非图片地址 → <img> 裂图）；
// 修复后 qrCode（data:image/…）优先，缺失时回退 totpQrFail 占位 + secret 手动输入仍可见。
// 双字段同时在场的 mock 是刻意的：单边 mock 无法证明断言锁的是 qrCode 而非「恰好只有它」。

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

// 卡片按钮定位：标题 → 所在卡片容器 → 卡内唯一操作按钮。
function totpCardAction(): HTMLElement {
	const heading = screen.getByRole('heading', { name: 'TOTP 验证器' });
	const card = heading.closest('.rounded-lg') as HTMLElement;
	return within(card).getByRole('button');
}

describe('SecurityPage TOTP 二维码字段（UP-16 / AC-201, AC-202）', () => {
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

	it('qrCode（data:image/…）在场：<img>.src 用 qrCode，不落 otpauth:// 的 qrCodeUrl', async () => {
		vi.mocked(useEnableTOTP).mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({
				secret: 'JBSWY3DPEHPK3PXP',
				qrCode:
					'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
				qrCodeUrl: 'otpauth://totp/Autional:demo?secret=JBSWY3DPEHPK3PXP',
			}),
			isPending: false,
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(totpCardAction());

		const img = await screen.findByAltText('TOTP QR Code');
		const src = img.getAttribute('src') || '';
		expect(src.startsWith('data:image/')).toBe(true);
		expect(src).toContain('base64,');
		expect(src).not.toContain('otpauth');
		// secret 手动输入通道并存（降级之外的正常路径）
		expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
		expect(screen.getByText('开启 TOTP 验证')).toBeInTheDocument();
	});

	it('裸 base64（后端 GenerateQRCode 真实形状，无 data: 前缀）→ 渲染归一带 data:image/png;base64, 前缀', async () => {
		vi.mocked(useEnableTOTP).mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({
				secret: 'BARE-BASE64-SECRET',
				qrCode:
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
			}),
			isPending: false,
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(totpCardAction());

		const img = await screen.findByAltText('TOTP QR Code');
		const src = img.getAttribute('src') || '';
		expect(src.startsWith('data:image/png;base64,')).toBe(true);
		expect(src).toContain('iVBORw0KGgo');
	});

	it('qrCode 缺失（仅 qrCodeUrl）：totpQrFail 占位 + secret 手动输入可见，不卡死', async () => {
		vi.mocked(useEnableTOTP).mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({
				secret: 'ONLY-SECRET-654321',
				qrCodeUrl: 'otpauth://totp/Autional:demo?secret=ONLY-SECRET-654321',
			}),
			isPending: false,
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(totpCardAction());

		await screen.findByText('无法生成二维码');
		expect(screen.queryByAltText('TOTP QR Code')).not.toBeInTheDocument();
		expect(screen.getByText('ONLY-SECRET-654321')).toBeInTheDocument();
		expect(screen.getByText('开启 TOTP 验证')).toBeInTheDocument();
	});

	it('UP-19：开启流程验证码 input 有 label 关联（可访问名「输入 6 位验证码验证」）', async () => {
		vi.mocked(useEnableTOTP).mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({
				secret: 'LABEL-LOCK-SECRET',
				qrCode:
					'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
			}),
			isPending: false,
		} as never);

		render(<SecurityPage />, { wrapper: TestWrapper });
		fireEvent.click(totpCardAction());

		const codeInput = await screen.findByLabelText('输入 6 位验证码验证');
		expect(codeInput.tagName).toBe('INPUT');
	});
});
