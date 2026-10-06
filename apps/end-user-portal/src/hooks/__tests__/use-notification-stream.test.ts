import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { mockPost, authState } = vi.hoisted(() => ({
	mockPost: vi.fn(),
	authState: {
		token: 'fake-access-token' as string | null,
		userId: 'user-1' as string | null,
	},
}));

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ userId: authState.userId }),
	getAccessToken: () => authState.token,
	isTokenExpired: () => false,
	apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

import { useNotificationStream } from '@/hooks/use-notification-stream';

// jsdom 无 EventSource 实现：记录每个实例，供断言 URL 并手动驱动事件
class FakeEventSource {
	static instances: FakeEventSource[] = [];
	url: string;
	onopen: (() => void) | null = null;
	onmessage: ((e: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	closed = false;
	constructor(url: string) {
		this.url = url;
		FakeEventSource.instances.push(this);
	}
	close() {
		this.closed = true;
	}
}

describe('useNotificationStream（P5-4 一次性票据建流）', () => {
	beforeEach(() => {
		vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
		FakeEventSource.instances = [];
		mockPost.mockReset();
		authState.token = 'fake-access-token';
		authState.userId = 'user-1';
	});

	it('先换一次性票据再以 ?ticket= 建流，URL 不含 access token', async () => {
		mockPost.mockResolvedValue({ data: { ticket: 't-123' } });

		const { result } = renderHook(() => useNotificationStream());

		await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

		// 票据端点经 Authorization 头调用（apiClient 拦截器注入），不落 URL
		expect(mockPost).toHaveBeenCalledWith('/notification/api/v1/notifications/stream-ticket', {});

		const url = new URL(FakeEventSource.instances[0].url);
		expect(url.pathname).toBe('/bff/notification/api/v1/notifications/stream');
		expect(url.searchParams.get('ticket')).toBe('t-123');
		expect(url.searchParams.has('token')).toBe(false);
		expect(FakeEventSource.instances[0].url).not.toContain('fake-access-token');

		act(() => FakeEventSource.instances[0].onopen?.());
		expect(result.current.connected).toBe(true);

		act(() =>
			FakeEventSource.instances[0].onmessage?.({
				data: JSON.stringify({ id: 'n1', title: 'hi' }),
			}),
		);
		expect(result.current.eventCount).toBe(1);
		expect(result.current.lastEvent).toMatchObject({ id: 'n1', title: 'hi' });
	});

	it('票据换取失败：不建流（fail-closed）', async () => {
		mockPost.mockRejectedValue(new Error('ticket endpoint down'));

		const { result, unmount } = renderHook(() => useNotificationStream());

		await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
		expect(FakeEventSource.instances).toHaveLength(0);
		expect(result.current.connected).toBe(false);
		expect(result.current.authExpired).toBe(false);
		unmount();
	});

	it('无 access token：置 authExpired，不发票据请求', async () => {
		authState.token = null;

		const { result } = renderHook(() => useNotificationStream());

		await waitFor(() => expect(result.current.authExpired).toBe(true));
		expect(mockPost).not.toHaveBeenCalled();
		expect(FakeEventSource.instances).toHaveLength(0);
	});

	it('流断开触发重连时重新换票（不复用已消费票据）', async () => {
		vi.useFakeTimers();
		try {
			mockPost
				.mockResolvedValueOnce({ data: { ticket: 't-first' } })
				.mockResolvedValueOnce({ data: { ticket: 't-second' } });

			const { unmount } = renderHook(() => useNotificationStream());

			await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
			expect(new URL(FakeEventSource.instances[0].url).searchParams.get('ticket')).toBe('t-first');

			act(() => FakeEventSource.instances[0].onerror?.());
			await vi.advanceTimersByTimeAsync(1000);

			await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
			expect(new URL(FakeEventSource.instances[1].url).searchParams.get('ticket')).toBe('t-second');
			expect(mockPost).toHaveBeenCalledTimes(2);
			unmount();
		} finally {
			vi.useRealTimers();
		}
	});
});
