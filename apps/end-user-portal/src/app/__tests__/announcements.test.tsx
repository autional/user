import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestWrapper } from '@/test/wrapper';
import AnnouncementsPage from '@/app/announcements/page';
import { useAnnouncements } from '@/hooks/queries';

// UP-88 回归锁：忽略公告必须持久化。旧实现是纯内存 state，重新挂载（等效刷新）后公告复活。

const authState = vi.hoisted(() => ({ userId: 'u-ann' }));

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ user: { id: authState.userId } }),
}));

vi.mock('@/hooks/queries', () => ({
	useAnnouncements: vi.fn(),
}));

const ANNS = [
	{
		id: 'ann-1',
		title: '公告一',
		content: '内容一',
		publishAt: '2026-10-01T08:00:00+08:00',
		createdAt: '2026-10-01T08:00:00+08:00',
	},
	{
		id: 'ann-2',
		title: '公告二',
		content: '内容二',
		publishAt: '2026-10-02T08:00:00+08:00',
		createdAt: '2026-10-02T08:00:00+08:00',
	},
];

describe('AnnouncementsPage — UP-88 忽略持久化（per-user localStorage）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		authState.userId = 'u-ann';
		vi.mocked(useAnnouncements).mockReturnValue({
			data: { items: ANNS, total: ANNS.length },
			isLoading: false,
			error: null,
		} as any);
	});

	it('忽略后重新挂载仍保持忽略（旧实现复活）；per-user 键互不影响', async () => {
		const first = render(<AnnouncementsPage />, { wrapper: TestWrapper });
		expect(screen.getByText('公告一')).toBeInTheDocument();
		expect(screen.getByText('公告二')).toBeInTheDocument();

		// 卡片内「忽略」按钮（每张卡一个）。name 精确匹配 —— 卡片本体的整行大按钮
		// 可访问名包含标题与「忽略」子串，用正则会把它也命中。
		const dismissButtons = screen.getAllByRole('button', { name: '忽略' });
		expect(dismissButtons).toHaveLength(2);
		fireEvent.click(dismissButtons[0]);

		await waitFor(() => expect(screen.queryByText('公告一')).not.toBeInTheDocument());
		expect(screen.getByText('公告二')).toBeInTheDocument();
		// 已写入 per-user 键。
		expect(localStorage.getItem(`announcements-dismissed:${authState.userId}`)).toContain('ann-1');
		first.unmount();

		// 同用户重挂载（等效刷新）：被忽略的公告不再复活。
		const second = render(<AnnouncementsPage />, { wrapper: TestWrapper });
		await waitFor(() => expect(screen.queryByText('公告一')).not.toBeInTheDocument());
		expect(screen.getByText('公告二')).toBeInTheDocument();
		second.unmount();

		// 换用户：其忽略记录独立（ann-1 对 u-other 仍是可见的）。
		authState.userId = 'u-other';
		render(<AnnouncementsPage />, { wrapper: TestWrapper });
		await waitFor(() => expect(screen.getByText('公告一')).toBeInTheDocument());
		expect(screen.getByText('公告二')).toBeInTheDocument();
	});

	it('UP-87：展开=平级透明覆盖 button（aria-expanded + 可访问名=标题）；DOM 无 button 嵌套 button', async () => {
		render(<AnnouncementsPage />, { wrapper: TestWrapper });
		await screen.findByText('公告一');

		// 旧结构：外层整卡 button 内又嵌「忽略」button（HTML 非法，AT 行为不确定）
		expect(document.querySelectorAll('button button')).toHaveLength(0);

		const cover = screen.getByRole('button', { name: '公告一' });
		expect(cover.tagName).toBe('BUTTON');
		expect(cover).toHaveAttribute('aria-expanded', 'false');
		// 「忽略」是抬升的平级按钮，不是覆盖层后代
		const dismiss = screen.getAllByRole('button', { name: '忽略' })[0];
		expect(cover.contains(dismiss)).toBe(false);

		fireEvent.click(cover);
		expect(cover).toHaveAttribute('aria-expanded', 'true');
		// 展开面板出现第三种「忽略」按钮（dismissAndClose 文案同为「忽略」）
		expect(screen.getAllByRole('button', { name: '忽略' })).toHaveLength(3);

		fireEvent.click(cover);
		expect(cover).toHaveAttribute('aria-expanded', 'false');
		expect(screen.getAllByRole('button', { name: '忽略' })).toHaveLength(2);
	});
});
