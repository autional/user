import { useSessionActivity as useSharedSessionActivity } from '@autional/shared';

/** 会话活动心跳端点（用户面）。 */
const ACTIVITY_URL = '/bff/session/api/v1/sessions/me/activity';

/**
 * 会话活动心跳（NIST「activity resets inactivity」口径）。
 *
 * 逻辑在 `@autional/shared`（单一真源），这里只钉端点 ——
 * 取 token 用 shared 的 auth store（本门户登录即写该 store）。
 */
export function useSessionActivity(): void {
  useSharedSessionActivity({ endpoint: ACTIVITY_URL });
}
