import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	authMeSessions,
	authMeSessionsBySessionsDelete,
	authMeSessionsDelete,
} from '@autional/shared/generated/api';
import {
	useRevokeAllSessions,
	CURRENT_SESSION_UNRESOLVABLE,
} from '@/hooks/queries/use-security';

// U353 防自毁回归锁：exceptCurrent 分支必须能唯一解析当前会话（恰 1 个 isCurrentSession），
// 否则中止并抛哨兵错误。历史令牌缺 sid 时列表全 false——旧实现会 filter(!isCurrentSession)
// 后逐条删除，把当前会话一并删掉（等效全登出自毁）。

vi.mock('@autional/shared/generated/api', async () => {
	const actual = await vi.importActual<typeof import('@autional/shared/generated/api')>(
		'@autional/shared/generated/api',
	);
	return {
		...actual,
		authMeSessions: vi.fn(),
		authMeSessionsBySessionsDelete: vi.fn(),
		authMeSessionsDelete: vi.fn(),
	};
});

function createWrapper(qc: QueryClient) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
	};
}

function makeHook() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return renderHook(() => useRevokeAllSessions(), { wrapper: createWrapper(qc) });
}

describe('useRevokeAllSessions exceptCurrent 防自毁守卫（U353）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('0 个当前会话（历史令牌缺 sid 的自毁场景）→ 抛哨兵且零删除', async () => {
		vi.mocked(authMeSessions).mockResolvedValue({
			items: [
				{ id: 's1', isCurrentSession: false },
				{ id: 's2', isCurrentSession: false },
			],
		});

		const { result } = makeHook();

		await expect(result.current.mutateAsync({ exceptCurrent: true })).rejects.toThrow(
			CURRENT_SESSION_UNRESOLVABLE,
		);
		expect(authMeSessionsBySessionsDelete).not.toHaveBeenCalled();
		expect(authMeSessionsDelete).not.toHaveBeenCalled();
	});

	it('多于 1 个当前会话（标记歧义）→ 抛哨兵且零删除', async () => {
		vi.mocked(authMeSessions).mockResolvedValue({
			items: [
				{ id: 's1', isCurrentSession: true },
				{ id: 's2', isCurrentSession: true },
			],
		});

		const { result } = makeHook();

		await expect(result.current.mutateAsync({ exceptCurrent: true })).rejects.toThrow(
			CURRENT_SESSION_UNRESOLVABLE,
		);
		expect(authMeSessionsBySessionsDelete).not.toHaveBeenCalled();
	});

	it('恰 1 个当前会话 → 仅删除其他会话，不触碰当前会话', async () => {
		vi.mocked(authMeSessions).mockResolvedValue({
			items: [
				{ id: 'cur', isCurrentSession: true },
				{ id: 'o1', isCurrentSession: false },
				{ id: 'o2', isCurrentSession: false },
			],
		});
		vi.mocked(authMeSessionsBySessionsDelete).mockResolvedValue(undefined);

		const { result } = makeHook();

		await expect(result.current.mutateAsync({ exceptCurrent: true })).resolves.toBeUndefined();
		expect(authMeSessionsBySessionsDelete).toHaveBeenCalledTimes(2);
		expect(authMeSessionsBySessionsDelete).toHaveBeenCalledWith('o1');
		expect(authMeSessionsBySessionsDelete).toHaveBeenCalledWith('o2');
		expect(authMeSessionsBySessionsDelete).not.toHaveBeenCalledWith('cur');
		expect(authMeSessionsDelete).not.toHaveBeenCalled();
	});

	it('普通全注销路径（无 exceptCurrent）→ 直调 authMeSessionsDelete，行为不变', async () => {
		vi.mocked(authMeSessionsDelete).mockResolvedValue(undefined);

		const { result } = makeHook();

		await expect(result.current.mutateAsync({})).resolves.toBeUndefined();
		expect(authMeSessionsDelete).toHaveBeenCalledTimes(1);
		expect(authMeSessionsBySessionsDelete).not.toHaveBeenCalled();
	});
});
