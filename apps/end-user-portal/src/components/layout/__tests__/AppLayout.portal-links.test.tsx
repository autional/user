// 2026-11-02（方案 W2/W3）：用户中心顶部控件的站外出口与切换器收窄回归锁。
//
// 用户门户的切换器收窄后，普通终端用户通常只剩 user 一项 → PortalSwitcher 会整体隐藏
// （Gainsight 规则）。因此这里同时锁住「隐藏是预期」，以及「用户菜单接管了那三条出口」。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// 与生产同一条初始化路径：i18n 实例 + registerUiI18n（@autional/ui 的通用文案）
import '@/i18n';
import AppLayout from '../AppLayout';
import zhCN from '@/i18n/locales/zh-CN.json';
import enUS from '@/i18n/locales/en-US.json';

const mockCatalog = vi.hoisted(() => ({
	value: { portals: [] as Array<{ code: string; name?: string; url: string }> },
}));
const mockLogout = vi.hoisted(() => vi.fn());

vi.mock('@autional/shared', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@autional/shared')>();
	return {
		...actual,
		useAuth: () => ({
			user: { id: 'u1', username: 'tester', email: 'tester@example.com' },
			currentTenantId: 't1',
			isAuthenticated: true,
		}),
		useBootstrap: () => 'ready',
		useLogout: () => mockLogout,
		useTenantSlug: () => 'demo',
		usePortalCatalog: () => ({
			portals: mockCatalog.value.portals,
			allPortals: mockCatalog.value.portals,
			isLoading: false,
			isError: false,
			refetch: () => {},
		}),
		// getter 必须在模块边界覆盖（内部引用真实 getPortalUrl，只覆盖 getPortalUrl 无效）
		getDEVELOPER_PORTAL_URL: () => 'https://developer.example.com',
		getSTATUS_PAGE_URL: () => 'https://status.example.com',
		getLANDING_SITE_URL: () => 'https://www.example.com',
	};
});

vi.mock('@/hooks/use-tenant', () => ({
	useTenant: () => ({
		tenants: [{ id: 't1', name: 'Acme', role: 'member' }],
		currentTenant: { id: 't1', name: 'Acme' },
		switchTenant: vi.fn(),
	}),
}));
vi.mock('@/hooks/queries', () => ({
	useUnreadNotifications: () => ({ unreadCount: 0, total: 0 }),
}));
vi.mock('@/hooks/use-notification-stream', () => ({
	useNotificationStream: () => ({ lastEvent: null, addListener: () => () => {}, authExpired: false }),
}));
vi.mock('@/hooks/use-route-labels', () => ({
	useRouteLabels: () => ({}),
}));

function renderLayout() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={['/demo']}>
				<AppLayout />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('用户中心 · 站外出口与切换器收窄', () => {
	beforeEach(() => {
		mockCatalog.value = { portals: [] };
		mockLogout.mockClear();
	});

	it('i18n 键是顶层平铺键（keySeparator:false 口径）', () => {
		for (const key of ['nav.docs', 'nav.statusPage', 'nav.officialSite']) {
			expect(Object.prototype.hasOwnProperty.call(zhCN, key), key + ' 必须在 zh-CN 顶层').toBe(true);
			expect(Object.prototype.hasOwnProperty.call(enUS, key), key + ' 必须在 en-US 顶层').toBe(true);
		}
	});

	it('用户菜单有三条站外出口，登出为末项', async () => {
		const user = userEvent.setup();
		renderLayout();

		await user.click(screen.getByLabelText('用户菜单'));

		expect(screen.getByRole('menuitem', { name: '文档' })).toHaveAttribute(
			'href',
			'https://developer.example.com',
		);
		expect(screen.getByRole('menuitem', { name: '服务状态' })).toHaveAttribute(
			'href',
			'https://status.example.com',
		);
		expect(screen.getByRole('menuitem', { name: '官方网站' })).toHaveAttribute(
			'href',
			'https://www.example.com',
		);

		const items = screen.getAllByRole('menuitem');
		expect(items[items.length - 1]).toHaveTextContent('退出登录');
	});

	it('纯终端用户：过滤后只剩 user 一项，切换器整体隐藏（预期行为）', () => {
		mockCatalog.value = {
			portals: [
				{ code: 'user', name: '用户中心', url: 'https://user.example.com/demo' },
				{ code: 'status', name: '状态页', url: 'https://status.example.com' },
				{ code: 'trust', name: '信任中心', url: 'https://trust.example.com' },
				{ code: 'developer', name: '开发者门户', url: 'https://developer.example.com' },
			],
		};
		renderLayout();

		expect(screen.queryByLabelText('切换门户')).not.toBeInTheDocument();
	});

	it('多控制台用户：切换器只保留控制台', async () => {
		mockCatalog.value = {
			portals: [
				{ code: 'user', name: '用户中心', url: 'https://user.example.com/demo' },
				{ code: 'admin', name: '管理后台', url: 'https://admin.example.com/demo' },
				{ code: 'security', name: '安全中心', url: 'https://security.example.com/demo' },
				{ code: 'status', name: '状态页', url: 'https://status.example.com' },
				{ code: 'brand', name: '品牌入口', url: 'https://brand.example.com' },
			],
		};
		const user = userEvent.setup();
		renderLayout();

		await user.click(screen.getByLabelText('切换门户'));

		expect(screen.getByRole('menuitem', { name: '管理后台' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: '安全中心' })).toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: '状态页' })).not.toBeInTheDocument();
		expect(screen.queryByRole('menuitem', { name: '品牌入口' })).not.toBeInTheDocument();
	});
});
