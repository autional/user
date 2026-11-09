import { useEffect, useRef } from 'react';
import { decodeJwtPayload, getAccessToken } from '@autional/shared';

/** 会话活动心跳端点（用户面）。 */
const ACTIVITY_URL = '/bff/session/api/v1/sessions/me/activity';
const PING_INTERVAL = 5 * 60_000;
const TICK_INTERVAL = 60_000;
const INTERACTION_FRESH = 5 * 60_000;

function str(source: Record<string, unknown> | null | undefined, key: string): string {
	const value = source?.[key];
	return typeof value === 'string' ? value : '';
}

/**
 * 会话活动心跳（NIST「activity resets inactivity」口径）。
 * 只在「页面可见 + 最近 5 分钟有交互」时上报；失败静默。
 * 服务端首次心跳把会话切到闲置策略（opt-in），未接心跳的客户端不受影响。
 */
export function useSessionActivity(): void {
	const lastInteraction = useRef(Date.now());
	const lastPing = useRef(0);

	useEffect(() => {
		const mark = () => {
			lastInteraction.current = Date.now();
		};
		const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
		events.forEach((name) => window.addEventListener(name, mark, { passive: true }));

		const ping = () => {
			const token = getAccessToken();
			if (!token) return;
			if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
			const now = Date.now();
			if (now - lastInteraction.current > INTERACTION_FRESH) return;
			if (now - lastPing.current < PING_INTERVAL) return;
			const claims = decodeJwtPayload(token);
			const custom = (claims?.custom ?? null) as Record<string, unknown> | null;
			const sid = str(custom, 'sid') || str(custom, 'session_id') || str(claims, 'session_id');
			if (!sid) return;
			lastPing.current = now;
			const headers: Record<string, string> = {
				Accept: 'application/json',
				Authorization: 'Bearer ' + token,
			};
			const tenant = str(claims, 'tenant_id') || str(custom, 'tenant_id');
			const app = str(claims, 'app_id') || str(custom, 'app_id');
			if (tenant) headers['X-Tenant-ID'] = tenant;
			if (app) headers['X-App-ID'] = app;
			void fetch(ACTIVITY_URL, { method: 'POST', headers, credentials: 'omit' }).catch(() => undefined);
		};

		const timer = window.setInterval(ping, TICK_INTERVAL);
		const onVisible = () => {
			if (document.visibilityState === 'visible') ping();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			events.forEach((name) => window.removeEventListener(name, mark));
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, []);
}
