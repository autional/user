import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { walletsPost } from '@autional/shared/generated/api';
import { useCreateWallet } from '@/hooks/queries/use-wallet';

vi.mock('@autional/shared/generated/api', async () => {
	const actual = await vi.importActual<typeof import('@autional/shared/generated/api')>(
		'@autional/shared/generated/api',
	);
	return { ...actual, walletsPost: vi.fn() };
});

function createWrapper(qc: QueryClient) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
	};
}

describe('useCreateWallet（TASK-UF2-18 首次接线 walletsPost）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('posts body.userId = 当前用户（服务端同体校验前提），成功后 invalidate 钱包查询', async () => {
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
		vi.mocked(walletsPost).mockResolvedValue({ walletId: 'w-new' });

		const { result } = renderHook(() => useCreateWallet(), { wrapper: createWrapper(qc) });
		result.current.mutate({ userId: 'u-current' });

		await waitFor(() => expect(walletsPost).toHaveBeenCalledTimes(1));
		expect(walletsPost).toHaveBeenCalledWith({ userId: 'u-current', currency: 'CNY' });
		await waitFor(() =>
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['wallet', 'u-current'] }),
		);
	});

	it('mutation 失败向上抛出（不吞错，由页面错误态承接）', async () => {
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		vi.mocked(walletsPost).mockRejectedValue(new Error('create failed'));

		const { result } = renderHook(() => useCreateWallet(), { wrapper: createWrapper(qc) });

		await expect(result.current.mutateAsync({ userId: 'u1' })).rejects.toThrow('create failed');
	});
});
