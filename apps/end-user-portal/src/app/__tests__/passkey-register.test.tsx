import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { TestWrapper } from '@/test/wrapper';
import PasskeyRegisterPage from '@/app/security/passkeys/register/page';

// UP-91-A 回归锁（AC-701/702/703）：WebAuthn begin 的 user_name 仅作凭据 label（服务端身份取自 JWT），
// 无 username 账号回退 email；两者皆空 → 不发请求 + 明确提示（否则后端 required 校验恒 400）。
// UP-91-C 回归锁（AC-704）：begin 响应真实 wire 形状为 {publicKey:{…}}（DataResponse 信封 +
// 响应拦截器解包后仍留 publicKey 层），页面必须取 .publicKey 再解码 challenge/user.id。

const h = vi.hoisted(() => ({
	user: {} as { id?: string; username?: string; email?: string },
	begin: vi.fn(),
	complete: vi.fn(),
	authConfig: vi.fn(),
}));

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ user: h.user, userId: h.user?.id || '' }),
	useAuthStore: { getState: () => ({ currentTenantId: 'tenant-1' }) },
	extractApiError: (err: any, fallback: string) => ({ message: err?.message || fallback }),
	processPasswordForTransmission: (password: string) => ({
		password,
		passwordTransmission: 'plain',
	}),
	useTenantSlug: () => 'acme-corp',
	logout: vi.fn(),
	getAUTH_PAGES_URL: () => '/auth',
}));

vi.mock('@autional/shared/generated/api', () => ({
	authWebauthnRegisterBeginPost: h.begin,
	authWebauthnRegisterCompletePost: h.complete,
	PublicAuthConfigByAuthConfig: h.authConfig,
}));

vi.mock('@/hooks/use-toast', () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

beforeAll(() => {
	// jsdom 无 WebAuthn：仅需通过 `!window.PublicKeyCredential` 支持性检查，
	// 后续 navigator.credentials 缺失会走 catch（不影响 begin 请求体断言）。
	Object.defineProperty(window, 'PublicKeyCredential', {
		configurable: true,
		writable: true,
		value: class PublicKeyCredentialStub {},
	});
});

async function startAndSubmitPassword() {
	render(<PasskeyRegisterPage />, { wrapper: TestWrapper });
	fireEvent.click(screen.getByText('开始注册'));
	const input = await screen.findByPlaceholderText('请输入当前密码');
	fireEvent.change(input, { target: { value: 'mypassword' } });
	fireEvent.click(screen.getByText('继续'));
}

describe('PasskeyRegisterPage begin 身份字段（UP-91-A / AC-701, AC-702, AC-703）', () => {
	beforeEach(() => {
		h.begin.mockReset();
		// 真实响应形状：拦截器解包后 options 位于 publicKey 层（非扁平 {challenge}——扁平 mock 曾掩盖生产缺陷）
		h.begin.mockResolvedValue({ publicKey: { challenge: 'AAAA' } });
		h.complete.mockReset();
		h.authConfig.mockReset();
		h.authConfig.mockResolvedValue({ passwordPolicy: { passwordTransmission: 'plain' } });
	});

	it('AC-701：无 username → user_name/display_name 均回退 email', async () => {
		h.user = { id: 'u1', email: 'demo@example.com' };
		await startAndSubmitPassword();

		await waitFor(() => expect(h.begin).toHaveBeenCalledTimes(1));
		const body = h.begin.mock.calls[0][0];
		expect(body.user_name).toBe('demo@example.com');
		expect(body.display_name).toBe('demo@example.com');
		expect(body.password).toBe('mypassword');
		expect(body.password_transmission).toBe('plain');
	});

	it('AC-702：有 username → 仍优先取 username（优先级不回归）', async () => {
		h.user = { id: 'u1', username: 'alice', email: 'alice@example.com' };
		await startAndSubmitPassword();

		await waitFor(() => expect(h.begin).toHaveBeenCalledTimes(1));
		const body = h.begin.mock.calls[0][0];
		expect(body.user_name).toBe('alice');
		expect(body.display_name).toBe('alice');
	});

	it('AC-703：username/email 皆空 → 零请求 + 明确错误提示（不静默）', async () => {
		h.user = { id: 'u1' };
		await startAndSubmitPassword();

		await screen.findByText('无法获取用户名或邮箱，请先完善账号信息');
		expect(h.begin).not.toHaveBeenCalled();
		// 守卫在 auth-config 拉取之前短路，彻底不发任何网络请求
		expect(h.authConfig).not.toHaveBeenCalled();
	});

	it('AC-704：begin 真实形状 {publicKey:{…}} → 取 .publicKey 解锁链路；challenge/user.id 解码为 ArrayBuffer，complete 回传 base64url', async () => {
		h.user = { id: 'u1', email: 'demo@example.com' };
		h.begin.mockResolvedValue({
			publicKey: {
				challenge: 'AQID',
				rp: { id: 'autional.cn', name: 'Autional' },
				user: { id: 'AQID', name: 'demo@example.com', displayName: 'demo@example.com' },
				pubKeyCredParams: [
					{ alg: -8, type: 'public-key' },
					{ alg: -7, type: 'public-key' },
					{ alg: -257, type: 'public-key' },
				],
				timeout: 300000,
				attestation: 'none',
			},
		});
		const create = vi.fn().mockResolvedValue({
			id: 'cred-1',
			rawId: new Uint8Array([1, 2, 3]).buffer,
			type: 'public-key',
			response: {
				attestationObject: new Uint8Array([4, 5, 6]).buffer,
				clientDataJSON: new Uint8Array([7, 8, 9]).buffer,
			},
		});
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			writable: true,
			value: { create },
		});
		h.complete.mockResolvedValue({ id: 'cred-1' });

		await startAndSubmitPassword();

		await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
		const sent = create.mock.calls[0][0].publicKey;
		// 'AQID' base64url → 字节 [1,2,3]，必须是 ArrayBuffer（WebAuthn 要求二进制）
		expect(sent.challenge).toBeInstanceOf(ArrayBuffer);
		expect(Array.from(new Uint8Array(sent.challenge))).toEqual([1, 2, 3]);
		expect(sent.user.id).toBeInstanceOf(ArrayBuffer);
		expect(Array.from(new Uint8Array(sent.user.id))).toEqual([1, 2, 3]);

		await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1));
		const cred = h.complete.mock.calls[0][0].credential;
		// [1,2,3]→'AQID'、[4,5,6]→'BAUG'、[7,8,9]→'BwgJ'（base64url 无填充）
		expect(cred.raw_id).toBe('AQID');
		expect(cred.response.attestation_object).toBe('BAUG');
		expect(cred.response.client_data_json).toBe('BwgJ');
	});

	it('UP-93：password 步骤含隐藏 username 域（password manager/AT 输入目的识别，WCAG 1.3.5）', async () => {
		h.user = { id: 'u1', username: 'alice', email: 'alice@example.com' };
		render(<PasskeyRegisterPage />, { wrapper: TestWrapper });
		fireEvent.click(screen.getByText('开始注册'));
		await screen.findByPlaceholderText('请输入当前密码');

		// 隐藏域走容器级查询（hidden 元素不参与可访问树 / role 查询）
		const hiddenUser = document.querySelector(
			'input[name="username"][autocomplete="username"]',
		) as HTMLInputElement | null;
		expect(hiddenUser).not.toBeNull();
		expect(hiddenUser!.type).toBe('text');
		expect(hiddenUser!.hidden).toBe(true);
		// 取值与注册回退链同源（username 优先）
		expect(hiddenUser!.value).toBe('alice');
	});
});
