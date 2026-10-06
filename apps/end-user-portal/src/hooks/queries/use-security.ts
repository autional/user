import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryResult,
	type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@autional/shared';
import {
	authMeSessions,
	authMeSessionsBySessionsDelete,
	authMeSessionsDelete,
	mfaStatusByStatus,
	mfaTotpEnablePost,
	mfaTotpVerifyPost,
	mfaTotpDisablePost,
	mfaBackupCodesGeneratePost,
	mfaMethodsByMethodsDelete,
	authMeWebauthnCredentials,
	authMeWebauthnCredentialsByWebauthnCredentialsDelete,
	authOauthAccounts,
	authOauthUnbindPost,
} from '@autional/shared/generated/api';
import type {
	SessionInfo,
	MFAStatus,
	TOTPSetup,
	PasskeyCredential,
	OAuthConnectionItem,
} from './types';
import { queryKeys } from './query-keys';

export function useSessions(
	page?: number,
	pageSize?: number,
): UseQueryResult<SessionInfo[], Error> {
	const { userId } = useAuth();
	return useQuery<SessionInfo[], Error>({
		// UP-40：queryKey 必须携带 page/pageSize，否则翻页参数变了查询键不变
		// → react-query 直接回放第一页缓存，翻页数据恒为第一页。
		queryKey: [...queryKeys.sessions, page, pageSize],
		queryFn: async () => {
			const res = await authMeSessions({ page, page_size: pageSize });
			return (res as { items?: SessionInfo[] }).items || [];
		},
		enabled: !!userId,
		retry: 1,
	});
}

export function useRevokeSession(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, string>({
		mutationFn: authMeSessionsBySessionsDelete,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sessions }),
	});
}

// U353 哨兵错误：exceptCurrent 分支无法唯一解析当前会话（0 个或 >1 个 isCurrentSession）。
// is_current_session 依赖令牌的 sid claim；铸造链缺 sid 时列表全为 false——按旧逻辑
// 会把当前会话一并删除（等同全登出自毁）。解析不出唯一当前会话时宁可拒绝执行。
export const CURRENT_SESSION_UNRESOLVABLE = 'current-session-unresolvable';

export function useRevokeAllSessions(): UseMutationResult<
	unknown,
	Error,
	{ exceptCurrent?: boolean }
> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, { exceptCurrent?: boolean }>({
		mutationFn: async (data) => {
			if (data.exceptCurrent) {
				const sessions = await authMeSessions({});
				const items = (sessions as { items?: SessionInfo[] }).items || [];
				const currentCount = items.filter((s) => s.isCurrentSession).length;
				if (currentCount !== 1) {
					throw new Error(CURRENT_SESSION_UNRESOLVABLE);
				}
				const others = items.filter((s) => !s.isCurrentSession);
				await Promise.all(others.map((s) => authMeSessionsBySessionsDelete(s.id)));
			} else {
				await authMeSessionsDelete();
			}
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sessions }),
	});
}

async function getMFAStatus(userId: string): Promise<MFAStatus> {
	return mfaStatusByStatus(userId) as Promise<MFAStatus>;
}

async function enableTOTP(): Promise<TOTPSetup> {
	return mfaTotpEnablePost({}) as Promise<TOTPSetup>;
}

async function verifyTOTP(data: { code: string; userId: string }): Promise<unknown> {
	return mfaTotpVerifyPost(data);
}

async function disableTOTP(data: { code: string; userId: string }): Promise<unknown> {
	return mfaTotpDisablePost(data);
}

async function generateBackupCodes(data?: {
	userId?: string;
}): Promise<{ codes?: string[]; message?: string }> {
	return mfaBackupCodesGeneratePost(data || {}) as Promise<{ codes?: string[]; message?: string }>;
}

export function useMFAStatus(): UseQueryResult<MFAStatus, Error> {
	const { userId } = useAuth();
	return useQuery<MFAStatus, Error>({
		queryKey: queryKeys.mfa(userId || ''),
		queryFn: () => getMFAStatus(userId || ''),
		enabled: !!userId,
		retry: 1,
	});
}

export function useEnableTOTP(): UseMutationResult<TOTPSetup, Error, void> {
	return useMutation<TOTPSetup, Error, void>({
		mutationFn: enableTOTP,
	});
}

export function useVerifyTOTP(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	const { userId } = useAuth();
	return useMutation<unknown, Error, string>({
		mutationFn: (code: string) => verifyTOTP({ code, userId: userId || '' }),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mfa(userId || '') }),
	});
}

export function useDisableTOTP(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	const { userId } = useAuth();
	return useMutation<unknown, Error, string>({
		mutationFn: (code: string) => disableTOTP({ code, userId: userId || '' }),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mfa(userId || '') }),
	});
}

export function useGenerateBackupCodes(): UseMutationResult<
	{ codes?: string[]; message?: string },
	Error,
	void
> {
	const { userId } = useAuth();
	return useMutation<{ codes?: string[]; message?: string }, Error, void>({
		mutationFn: () => generateBackupCodes({ userId: userId || '' }),
	});
}

async function resetTOTP(userId: string): Promise<unknown> {
	// 删除当前用户的 TOTP 配置（非 Primary 无码删；Primary → 服务端 61040084 拒绝）。
	// 复用 same-user 护栏（service-core require_same.go），调用面仅限 user_id 自身。
	return mfaMethodsByMethodsDelete('totp', { user_id: userId });
}

export function useResetTOTPMutation(): UseMutationResult<unknown, Error, void> {
	const qc = useQueryClient();
	const { userId } = useAuth();
	return useMutation<unknown, Error, void>({
		mutationFn: () => resetTOTP(userId || ''),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mfa(userId || '') }),
	});
}

async function getPasskeys(): Promise<PasskeyCredential[]> {
	// 2026-08-17 修复：authMeWebauthnCredentials 经 apiClient 拦截器已解包为数组本身
	// （原 `(data as {data?: PasskeyCredential[]})?.data` 对数组取 .data 永远 undefined → 列表恒空）
	const data = await authMeWebauthnCredentials();
	return (Array.isArray(data) ? data : (data as { items?: PasskeyCredential[] })?.items) || [];
}

async function deletePasskey(id: string): Promise<unknown> {
	return authMeWebauthnCredentialsByWebauthnCredentialsDelete(id);
}

export function usePasskeys(): UseQueryResult<PasskeyCredential[], Error> {
	return useQuery<PasskeyCredential[], Error>({
		queryKey: queryKeys.passkeys,
		queryFn: getPasskeys,
		retry: 1,
	});
}

export function useDeletePasskey(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, string>({
		mutationFn: deletePasskey,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.passkeys }),
	});
}

async function getOAuthConnections(): Promise<OAuthConnectionItem[]> {
	// UP-15：admin 级端点（/admin/users/{id}/oauth-connections）对 user 入口平面恒 403
	// （网关 entry_plane_forbidden，含租户 admin 零豁免）；换自助端点 /auth/oauth/accounts
	// （从 JWT context 取当前用户）。原 catch{return []} 吞错会把 403 渲染成「暂无绑定」假空态，
	// 此处放行错误 → useOAuthConnections 的 error 态由页面显式呈现。
	const data = (await authOauthAccounts()) as { accounts?: OAuthConnectionItem[] };
	return data?.accounts || [];
}

async function unbindOAuthConnection(provider: string) {
	await authOauthUnbindPost({ provider });
}

export function useOAuthConnections(): UseQueryResult<OAuthConnectionItem[], Error> {
	const { userId } = useAuth();
	return useQuery<OAuthConnectionItem[], Error>({
		queryKey: queryKeys.oauthConnections(userId || ''),
		queryFn: getOAuthConnections,
		enabled: !!userId,
		retry: 1,
	});
}

export function useUnbindOAuth(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	const { userId } = useAuth();
	return useMutation<unknown, Error, string>({
		mutationFn: unbindOAuthConnection,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.oauthConnections(userId || '') }),
	});
}
