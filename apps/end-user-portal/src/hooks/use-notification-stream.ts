import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth, getAccessToken, isTokenExpired } from '@autional/shared';
import type { NotificationItem } from './queries';

interface NotificationStreamState {
	connected: boolean;
	lastEvent: NotificationItem | null;
	eventCount: number;
}

// P5-4：建流凭证 = JWT 保护端点签发的 60s 一次性票据。EventSource 无法携带 Authorization 头，
// access token 不再进入 URL（?token= 会留存于 CDN/网关访问日志，窗口内可重放）。
async function fetchStreamTicket(): Promise<string | null> {
	const { apiClient } = await import('@autional/shared');
	const res = await apiClient.post('/notification/api/v1/notifications/stream-ticket', {}); // @generated-api-exempt
	return (res.data as { ticket?: string } | undefined)?.ticket || null;
}

export function useNotificationStream() {
	const { userId } = useAuth();
	const [state, setState] = useState<NotificationStreamState>({
		connected: false,
		lastEvent: null,
		eventCount: 0,
	});
	const [authExpired, setAuthExpired] = useState(false);
	const esRef = useRef<EventSource | null>(null);
	const listenersRef = useRef<Set<(n: NotificationItem) => void>>(new Set());
	const retryCountRef = useRef(0);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const addListener = useCallback((fn: (n: NotificationItem) => void) => {
		listenersRef.current.add(fn);
		return () => {
			listenersRef.current.delete(fn);
		};
	}, []);

	useEffect(() => {
		if (!userId) return;

		if (!getAccessToken()) {
			setAuthExpired(true);
			return;
		}

		let disposed = false;

		const scheduleRetry = () => {
			retryCountRef.current += 1;
			if (retryCountRef.current <= 3) {
				const delay = 1000 * Math.pow(2, retryCountRef.current - 1);
				retryTimerRef.current = setTimeout(() => void connect(), delay);
			}
		};

		const connect = async () => {
			if (disposed) return;

			const currentToken = getAccessToken();
			if (!currentToken || isTokenExpired(currentToken)) {
				setAuthExpired(true);
				setState((s) => ({ ...s, connected: false }));
				return;
			}

			// 每轮连接先换新票据（一次性消费；断线重连 = 重新换票，天然规避原生
			// EventSource 自动重连复用已消费票据的 401 循环）。
			let ticket: string | null = null;
			try {
				ticket = await fetchStreamTicket();
			} catch (e) {
				console.warn(
					'[NotificationStream] stream-ticket fetch failed',
					(e as Error)?.message || '',
				);
			}
			if (disposed) return;
			if (!ticket) {
				setState((s) => ({ ...s, connected: false }));
				scheduleRetry();
				return;
			}

			const url = new URL('/bff/notification/api/v1/notifications/stream', window.location.origin);
			url.searchParams.set('ticket', ticket);

			const es = new EventSource(url.href);
			esRef.current = es;

			es.onopen = () => {
				retryCountRef.current = 0;
				setState((s) => ({ ...s, connected: true }));
			};

			es.onmessage = (event) => {
				try {
					const notification = JSON.parse(event.data) as NotificationItem;
					setState((s) => ({
						...s,
						lastEvent: notification,
						eventCount: s.eventCount + 1,
					}));
					listenersRef.current.forEach((fn) => fn(notification));
				} catch {
					// SSE 消息解析失败时跳过该事件
				}
			};

			es.onerror = () => {
				if (disposed) return;
				setState((s) => ({ ...s, connected: false }));
				es.close();
				scheduleRetry();
			};
		};

		void connect();

		return () => {
			disposed = true;
			if (retryTimerRef.current !== null) {
				clearTimeout(retryTimerRef.current);
				retryTimerRef.current = null;
			}
			esRef.current?.close();
			esRef.current = null;
			setState((s) => ({ ...s, connected: false }));
		};
	}, [userId]);

	return {
		...state,
		authExpired,
		addListener,
	};
}
