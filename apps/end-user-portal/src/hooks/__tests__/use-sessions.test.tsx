import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authMeSessions } from '@autional/shared/generated/api';
import { useSessions } from '@/hooks/queries/use-security';

// UP-40 回归锁：翻页参数必须进 queryKey。旧实现 key 恒 ['sessions']，
// 翻到第 2 页时 react-query 视为同一查询直接回放第 1 页缓存 —— 数据永远停在第一页。

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ userId: 'u-test' }),
}));

vi.mock('@autional/shared/generated/api', async () => {
	const actual = await vi.importActual<typeof import('@autional/shared/generated/api')>(
		'@autional/shared/generated/api',
	);
	return { ...actual, authMeSessions: vi.fn() };
});

function createWrapper(qc: QueryClient) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
	};
}

describe('useSessions 翻页（UP-40）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('page 变化触发新查询并返回第二页数据（而非回放第一页缓存）', async () => {
		vi.mocked(authMeSessions).mockResolvedValue({ items: [{ id: 's-page1' }] } as any);
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const { result, rerender } = renderHook(({ page }) => useSessions(page, 10), {
			wrapper: createWrapper(qc),
			initialProps: { page: 1 },
		});

		await waitFor(() =>
			expect(authMeSessions).toHaveBeenCalledWith({ page: 1, page_size: 10 }),
		);
		await waitFor(() => expect(result.current.data).toEqual([{ id: 's-page1' }]));

		vi.mocked(authMeSessions).mockResolvedValue({ items: [{ id: 's-page2' }] } as any);
		rerender({ page: 2 });

		// 新查询键 → 重新请求第二页（旧实现此处零请求、data 仍为第一页）。
		await waitFor(() =>
			expect(authMeSessions).toHaveBeenLastCalledWith({ page: 2, page_size: 10 }),
		);
		await waitFor(() => expect(result.current.data).toEqual([{ id: 's-page2' }]));
	});
});
