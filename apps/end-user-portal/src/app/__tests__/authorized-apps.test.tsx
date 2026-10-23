import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { oauthConsents } from '@autional/shared/generated/api';
import { TestWrapper } from '@/test/wrapper';
import i18n from '@/i18n';
import AuthorizedAppsPage from '@/app/security/authorized-apps/page';
import {
	useAuthorizedApps,
	useRevokeAuthorizedApp,
	type AuthorizedAppItem,
} from '@/hooks/queries';

// 2026-10-23：用户门户「已授权应用」（OAuth consent 自助查看/撤销）。
// 回归锁：① 列表必须展示应用名而非只显示 client_id；② website 只允许 http/https；
//          ③ 撤销必须走 DELETE /oauth/consents/{id}（mutate 收 consent id，不是 client_id）。

vi.mock('@/hooks/queries', () => ({
	useAuthorizedApps: vi.fn(),
	useRevokeAuthorizedApp: vi.fn(),
	// 形状用例走 vi.importActual 取真实实现，此处仅为模块整体 mock 的形状占位。
}));

// 形状用例（真实 hook）需要的两层替身：
// ① useAuth 提供 userId（否则 enabled:false 不发请求）；② oauthConsents 用于伪造坏响应。
vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useAuth: () => ({ userId: 'u-test' }),
}));

vi.mock('@autional/shared/generated/api', async () => {
	const actual = await vi.importActual<typeof import('@autional/shared/generated/api')>(
		'@autional/shared/generated/api',
	);
	return { ...actual, oauthConsents: vi.fn() };
});

const revokeMutate = vi.fn();

function mockApps(apps: unknown[], opts: { isLoading?: boolean; error?: Error | null } = {}) {
	vi.mocked(useAuthorizedApps).mockReturnValue({
		data: apps,
		isLoading: opts.isLoading ?? false,
		error: opts.error ?? null,
	} as never);
}

describe('AuthorizedAppsPage — 已授权应用', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockApps([]);
		vi.mocked(useRevokeAuthorizedApp).mockReturnValue({
			mutate: revokeMutate,
			isPending: false,
		} as never);
	});

	it('展示应用名/权限/授权时间，并给出 http(s) 的「打开应用」链接', () => {
		mockApps([
			{
				id: 'consent-1',
				clientId: 'client-novel',
				clientName: 'Novel Demo',
				website: 'https://novel.example.com',
				scopes: 'openid profile email',
				grantedAt: '2026-10-01T08:00:00Z',
			},
		]);

		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('Novel Demo')).toBeInTheDocument();
		expect(screen.getByText('client-novel')).toBeInTheDocument();
		// 权限标签本地化（openid → 登录身份）
		expect(screen.getByText('登录身份')).toBeInTheDocument();

		const openLink = screen.getByRole('link', { name: /打开应用/ });
		expect(openLink).toHaveAttribute('href', 'https://novel.example.com/');
		expect(openLink).toHaveAttribute('rel', 'noopener noreferrer');
	});

	it('别名优先展示（metadata.alias → 全名 → client_id 的同一优先级）', () => {
		mockApps([
			{
				id: 'consent-alias',
				clientId: 'client-alias',
				clientName: 'Novel Demo Full Name',
				alias: '小说',
				scopes: 'openid',
				grantedAt: '2026-10-04T08:00:00Z',
			},
		]);

		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('小说')).toBeInTheDocument();
		expect(screen.queryByText('Novel Demo Full Name')).not.toBeInTheDocument();
		// 原始 client_id 仍展示（可追溯）
		expect(screen.getByText('client-alias')).toBeInTheDocument();
	});

	it('缺失元信息回退展示 client_id，且非法 website（javascript:）不渲染链接', () => {
		mockApps([
			{
				id: 'consent-2',
				clientId: 'client-orphan',
				website: 'javascript:alert(1)',
				scopes: 'openid',
				grantedAt: '2026-10-02T08:00:00Z',
			},
		]);

		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		// clientName 缺失 → 用 client_id 当标题（同一文本出现两处：标题 + 灰字 id）
		expect(screen.getAllByText('client-orphan').length).toBeGreaterThan(0);
		expect(screen.queryByRole('link', { name: /打开应用/ })).not.toBeInTheDocument();
	});

	it('撤销：确认弹窗 → 传 consent id 调 DELETE，成功后提示', async () => {
		mockApps([
			{
				id: 'consent-9',
				clientId: 'client-nextchat',
				clientName: 'NextChat',
				website: 'https://chat.example.com',
				scopes: 'openid profile',
				grantedAt: '2026-10-03T08:00:00Z',
			},
		]);
		revokeMutate.mockImplementation((id: string, opts?: { onSuccess?: () => void }) => {
			opts?.onSuccess?.();
		});

		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		fireEvent.click(screen.getByRole('button', { name: /撤销授权/ }));

		// 弹窗内的确认按钮（行内按钮名是「撤销授权」，不冲突）
		fireEvent.click(screen.getByRole('button', { name: '确认撤销' }));

		expect(revokeMutate).toHaveBeenCalledTimes(1);
		// 第一个参数必须是 consent 记录 id（DELETE /oauth/consents/{id}），不是 client_id
		expect(revokeMutate.mock.calls[0][0]).toBe('consent-9');
	});

	it('空列表 → 空态文案', () => {
		mockApps([]);
		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });
		expect(screen.getByText('暂无已授权的应用')).toBeInTheDocument();
	});

	it('加载失败 → 错误态（不渲染空态假象）', () => {
		mockApps([], { error: new Error('boom') });
		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });
		expect(screen.getByText(/授权列表加载失败/)).toBeInTheDocument();
		// 第 2 轮补：错误态不得同时给出空态结论（坏响应 ≠「你没有授权任何应用」）
		expect(screen.queryByText('暂无已授权的应用')).not.toBeInTheDocument();
	});

	// —— 以下为测试服务补写（2026-10-23）：safeHref 边界 + 撤销失败态 ——

	it('协议相对 URL（//evil.com）不渲染「打开应用」（防跳转到第三方域）', () => {
		mockApps([
			{
				id: 'consent-pr',
				clientId: 'client-proto-rel',
				clientName: 'ProtoRel',
				website: '//evil.example.com',
				scopes: 'openid',
				grantedAt: '2026-10-04T08:00:00Z',
			},
		]);

		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('ProtoRel')).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /打开应用/ })).not.toBeInTheDocument();
	});

	it('logoUri 伪协议（javascript:/data:）不渲染 <img>，回落首字母头像', () => {
		mockApps([
			{
				id: 'consent-logo',
				clientId: 'client-badlogo',
				clientName: 'BadLogo',
				logoUri: 'javascript:alert(1)',
				scopes: 'openid',
				grantedAt: '2026-10-05T08:00:00Z',
			},
			{
				id: 'consent-logo2',
				clientId: 'client-datalogo',
				clientName: 'DataLogo',
				logoUri: 'data:image/svg+xml,<svg onload="alert(1)"/>',
				scopes: 'openid',
				grantedAt: '2026-10-06T08:00:00Z',
			},
		]);

		const { container } = render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		expect(container.querySelectorAll('img')).toHaveLength(0);
		// 首字母头像仍在（有内容可辨认，不是空白行）
		expect(screen.getByText('B')).toBeInTheDocument();
		expect(screen.getByText('D')).toBeInTheDocument();
	});

	it('合法的 http(s) logoUri 会渲染头像 <img>', () => {
		mockApps([
			{
				id: 'consent-logo-ok',
				clientId: 'client-oklogo',
				clientName: 'OkLogo',
				logoUri: 'https://cdn.example.com/logo.png',
				scopes: 'openid',
				grantedAt: '2026-10-07T08:00:00Z',
			},
		]);

		const { container } = render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		const imgs = container.querySelectorAll('img');
		expect(imgs).toHaveLength(1);
		expect(imgs[0]).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
		expect(imgs[0]).toHaveAttribute('aria-hidden', 'true');
	});

	it('撤销失败 → 弹窗保持打开（不伪装成功），且不重复提交', () => {		mockApps([
			{
				id: 'consent-fail',
				clientId: 'client-fail',
				clientName: 'Failing',
				website: 'https://fail.example.com',
				scopes: 'openid',
				grantedAt: '2026-10-08T08:00:00Z',
			},
		]);
		// mutate 立刻回调 onError（模拟 DELETE /oauth/consents/{id} 5xx）
		revokeMutate.mockImplementation(
			(_id: string, opts?: { onError?: (e: unknown) => void }) => {
				opts?.onError?.(new Error('boom'));
			},
		);

		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		fireEvent.click(screen.getByRole('button', { name: /撤销授权/ }));
		fireEvent.click(screen.getByRole('button', { name: '确认撤销' }));

		expect(revokeMutate).toHaveBeenCalledTimes(1);
		// 失败后弹窗必须还在：关掉会让用户误以为已撤销
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '确认撤销' })).toBeInTheDocument();
	});

	it('US-2 场景「应用未登记官网」：website 为空 → 该行不显示「打开应用」', () => {
		mockApps([
			{
				id: 'consent-noweb',
				clientId: 'client-noweb',
				clientName: 'NoWeb',
				scopes: 'openid',
				grantedAt: '2026-10-09T08:00:00Z',
			},
		]);

		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('NoWeb')).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /打开应用/ })).not.toBeInTheDocument();
		// 但不影响撤销入口
		expect(screen.getByRole('button', { name: /撤销授权/ })).toBeInTheDocument();
	});

	it('US-3 场景「撤销后的真实语义」：只承诺令牌失效 + 可能需重新登录，不承诺立即踢出', () => {
		mockApps([
			{
				id: 'consent-sem',
				clientId: 'client-sem',
				clientName: 'Semantics',
				scopes: 'openid',
				grantedAt: '2026-10-10T08:00:00Z',
			},
		]);

		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		// 页面级说明必须写明「令牌立即失效」「应用内可能也需要重新登录」
		expect(screen.getByText(/令牌立即失效/)).toBeInTheDocument();
		expect(screen.getByText(/重新登录/)).toBeInTheDocument();

		// 确认弹窗里同样给这条边界（撤销 ≠ back-channel logout）
		fireEvent.click(screen.getByRole('button', { name: /撤销授权/ }));
		expect(screen.getByText(/应用内可能需要重新登录/)).toBeInTheDocument();
		// 不得出现越界承诺
		expect(screen.queryByText(/立即退出|立即登出|强制下线/)).not.toBeInTheDocument();
	});
});

// —— 测试服务补写（2026-10-23 第 2 轮）：响应形状异常必须显形，不得回落假空态 ——
// 旧实现 `Array.isArray(items) ? items : []` 把「响应坏了」渲染成「暂无已授权的应用」
// （安全自省页上的错误结论）；现实现 throw → react-query error → 页面 ErrorState。
// 本块**绕过上面的整体模块 mock**（vi.importActual 取真实 hook），锁住两条相反口径：
// 坏形状 → error + data undefined；空数组 / 历史 {items:[...]} → 正常成功。
describe('useAuthorizedApps — /oauth/consents 响应形状（真实 hook）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	async function realAuthorizedAppsHook() {
		const mod = await vi.importActual<typeof import('@/hooks/queries')>('@/hooks/queries');
		return mod.useAuthorizedApps;
	}

	// 每个用例独立 QueryClient：共用会串缓存（同 queryKey 回放上一条结果）
	function freshWrapper() {
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		return function Wrapper({ children }: { children: ReactNode }) {
			return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
		};
	}

	it.each([
		['null', null],
		['空对象', {}],
		['嵌套 {data:[]}', { data: [] }],
		['字符串', 'not-an-array'],
	])('形状异常（%s）→ error 态，data 不下发 []', async (_label, bad) => {
		vi.mocked(oauthConsents).mockResolvedValue(bad as never);
		const useRealHook = await realAuthorizedAppsHook();

		const { result } = renderHook(() => useRealHook(), { wrapper: freshWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error?.message).toContain('unexpected /oauth/consents response shape');
		expect(result.current.data).toBeUndefined();
	});

	it('空数组是合法的「无授权」，不得被当成异常', async () => {
		vi.mocked(oauthConsents).mockResolvedValue([] as never);
		const useRealHook = await realAuthorizedAppsHook();

		const { result } = renderHook(() => useRealHook(), { wrapper: freshWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([]);
	});

	it('历史 {items:[...]} 形态仍兼容（不误判为异常）', async () => {
		const items = [{ id: 'c1', clientId: 'client-1' }] as AuthorizedAppItem[];
		vi.mocked(oauthConsents).mockResolvedValue({ items } as never);
		const useRealHook = await realAuthorizedAppsHook();

		const { result } = renderHook(() => useRealHook(), { wrapper: freshWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(items);
	});
});

// 回归锁（审查 F1）：文案标点必须跟语言走 —— 中文用全角「：」，英文必须 ASCII ": "。
// 修复前冒号硬编码在 JSX 里，英文界面会渲染出 "Authorized on：..."。
describe('AuthorizedAppsPage — 语言相关的标点与文案', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// clearAllMocks 不清 mockImplementation —— 撤销用例留下的 onSuccess 实现会渗到本组。
		revokeMutate.mockReset();
		mockApps([
			{
				id: 'consent-en',
				clientId: 'client-en',
				clientName: 'Novel Demo',
				scopes: 'openid profile',
				grantedAt: '2026-10-01T08:00:00Z',
			},
		]);
		vi.mocked(useRevokeAuthorizedApp).mockReturnValue({
			mutate: revokeMutate,
			isPending: false,
		} as never);
	});

	it('英文界面无全角冒号（Authorized on: / Permissions:）', async () => {
		await act(async () => {
			await i18n.changeLanguage('en-US');
		});
		try {
			render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

			expect(screen.getByText(/Authorized on: /)).toBeInTheDocument();
			expect(screen.getByText('Permissions:')).toBeInTheDocument();
			// 渲染文本里不得出现全角冒号（含授权时间与权限两处）
			expect(screen.queryByText(/：/)).not.toBeInTheDocument();
		} finally {
			await act(async () => {
				await i18n.changeLanguage('zh-CN');
			});
		}
	});

	it('中文界面用全角冒号（授权时间：/ 权限：）', () => {
		render(<AuthorizedAppsPage />, { wrapper: TestWrapper });

		expect(screen.getByText(/授权时间：/)).toBeInTheDocument();
		expect(screen.getByText('权限：')).toBeInTheDocument();
	});
});
