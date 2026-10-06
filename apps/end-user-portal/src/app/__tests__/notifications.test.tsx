import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestWrapper } from '@/test/wrapper';
import NotificationsPage from '@/app/notifications/page';

// UP-71 回归锁（AC-501）：字段名 read → isRead 之后，已读闭环必须真的走通：
// 未读（isRead:false）→ 点「标记已读」→ 真实 useMarkNotificationRead（invalidate ['notifications'] 前缀，
// 覆盖侧栏 unreadNotifications 徽标缓存）→ 重拉 isRead:true → 未读计数 0 / 圆点消失。
// 用真 hooks + 假 generated api + 真 QueryClient（mock 掉整层 hooks 就锁不住字段名与失效前缀）。

const h = vi.hoisted(() => ({
	list: vi.fn(),
	markRead: vi.fn(),
	markAllRead: vi.fn(),
	deleteNotification: vi.fn(),
	announcements: vi.fn(),
}));

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ user: { id: 'u1' }, userId: 'u1' }),
	useAuthStore: { getState: () => ({ currentTenantId: '' }) },
	extractApiError: (err: any, fallback: string) => ({ message: err?.message || fallback }),
	apiClient: { get: vi.fn() },
	logout: vi.fn(),
	getAUTH_PAGES_URL: () => '/auth',
	API_BASE_URL: '',
	useTenantSlug: () => 'acme-corp',
}));

vi.mock('@autional/shared/generated/api', () => ({
	notifications: h.list,
	notificationsReadByNotificationsPut: h.markRead,
	notificationsReadAllPut: h.markAllRead,
	notificationsByNotificationsDelete: h.deleteNotification,
	announcements: h.announcements,
}));

vi.mock('@/hooks/use-toast', () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const pagination = {
	page: 1,
	pageSize: 10,
	total: 1,
	totalPages: 1,
	hasNext: false,
	hasPrev: false,
};

const unreadItem = {
	id: 'n1',
	title: '安全提醒',
	content: '检测到新设备登录',
	type: 'security',
	isRead: false,
	createdAt: '2026-10-04T00:00:00Z',
};

const readItem = { ...unreadItem, isRead: true };

function renderPage() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const utils = render(
		<TestWrapper>
			<QueryClientProvider client={qc}>
				<NotificationsPage />
			</QueryClientProvider>
		</TestWrapper>,
	);
	return { qc, ...utils };
}

describe('NotificationsPage 已读闭环（UP-71 / AC-501）', () => {
	beforeEach(() => {
		h.list.mockReset();
		h.markRead.mockReset();
		h.markRead.mockResolvedValue({});
	});

	it('未读 → 标记已读 → invalidate([notifications]) 前缀覆盖 unread 缓存 → 重拉 isRead:true → 计数 0/圆点消失', async () => {
		h.list
			.mockResolvedValueOnce({ items: [unreadItem], total: 1, pagination })
			.mockResolvedValue({ items: [readItem], total: 1, pagination });

		const { qc } = renderPage();
		// 预置侧栏徽标缓存（['notifications','unread'] 前缀下），验证失效覆盖
		qc.setQueryData(['notifications', 'unread'], [unreadItem]);
		const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

		// 该段落同时拼接了总数（"… · 共 1 条"），用正则做子串匹配
		expect(await screen.findByText(/本页有 1 条未读通知/)).toBeInTheDocument();
		expect(screen.getByText('标记已读')).toBeInTheDocument();
		expect(document.querySelector('.bg-primary-500')).not.toBeNull();

		fireEvent.click(screen.getByText('标记已读'));

		// 真实 mutation → generated api 入参为通知 id
		await waitFor(() => expect(h.markRead).toHaveBeenCalledWith('n1'));
		// 失效前缀 = ['notifications']（非 exact），覆盖 unreadNotifications
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] });
		await waitFor(() =>
			expect(qc.getQueryState(['notifications', 'unread'])?.isInvalidated).toBe(true),
		);

		// 主列表重拉 → isRead:true → 计数 0 / 圆点消失 / 按钮消失
		await screen.findByText(/本页暂无未读通知/);
		expect(screen.queryByText('标记已读')).not.toBeInTheDocument();
		expect(document.querySelector('.bg-primary-500')).toBeNull();
		expect(h.list).toHaveBeenCalledTimes(2);
	});
});
