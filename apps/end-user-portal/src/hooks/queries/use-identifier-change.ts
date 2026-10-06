import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getCurrentTenantId, processPasswordForTransmission } from '@autional/shared';
import {
	authMeReauthenticatePost,
	authMePhoneChangePost,
	authMePhoneVerifyPost,
	authMeEmailChangePost,
	authMeEmailVerifyPost,
	authMeEmailChangeCancelPost,
	authMePhoneChangeCancelPost,
	authMeSessionsDelete,
	PublicAuthConfigByAuthConfig,
} from '@autional/shared/generated/api';
import { queryKeys } from './query-keys';

const STEP_UP_HEADER = 'X-StepUp-Token';

/**
 * 以可选 step-up token 调用生成 API 函数。
 * 生成函数签名固定 (data)，不支持 per-call config（api.ts 无 config 参数）；
 * X-StepUp-Token 通过共享 apiClient 默认头临时注入，try/finally 保证单次请求后清理。
 * 对话框流程串行（mutateAsync 同步 await），窗口内并发请求将携带该头但后端仅敏感路由校验，
 * 影响可忽略（见 #3 报告剩余风险）。
 */
async function withStepUpToken<T>(
	stepUpToken: string | undefined,
	fn: () => Promise<T>,
): Promise<T> {
	if (!stepUpToken) return fn();
	apiClient.defaults.headers.common[STEP_UP_HEADER] = stepUpToken;
	try {
		return await fn();
	} finally {
		delete apiClient.defaults.headers.common[STEP_UP_HEADER];
	}
}

/**
 * 标识变更（手机号/邮箱）前端 hooks。
 * 流程: change（发起 pending）→ verify（验证码确认）→ 成功 → 可选"退出其他设备"。
 * 重认证: change 返回 403 reauth_required 时，先调 reAuthenticate 拿 step-up token，再带 X-StepUp-Token 重试。
 */

export interface ReAuthenticateResult {
	stepUpToken?: string;
	expiresIn?: number;
}

/**
 * 按租户密码传输模式预 hash 当前密码（与 delete-account 流程一致）。
 * 后端 VerifyPassword 直接对比存储哈希，不内部 hash —— hash 模式租户必须传 sha256(raw|tenantId)。
 */
async function hashPasswordForTenant(rawPassword: string): Promise<string> {
	const tenantId = getCurrentTenantId() || '';
	const authConfig = await PublicAuthConfigByAuthConfig(tenantId);
	// 2026-08-17 安全修复：禁止静默回退 plain。
	// 后端恒返回 password_transmission（GetPasswordPolicy 有全局默认兜底）；
	// undefined/空串 = 契约错误，必须抛错暴露，不能降级明文（hash/symmetric 租户会 61000104）。
	const mode = authConfig?.passwordPolicy?.passwordTransmission;
	if (mode === undefined || mode === '' || mode === null) {
		throw new Error(
			'password transmission mode is missing from tenant auth-config (contract error)',
		);
	}
	const result = await processPasswordForTransmission(rawPassword, mode, tenantId, undefined);
	return result.password;
}

/** 重认证（step-up）：验证当前密码，返回 step-up token */
async function reAuthenticate(password: string): Promise<ReAuthenticateResult> {
	const hashed = await hashPasswordForTenant(password);
	// 生成 API（TASK-096）：返回 apiClient 拦截器解包后的 payload { stepUpToken, expiresIn }，
	// 与前端 handleReauth 的 res.stepUpToken 消费方式精确匹配。
	const res = await authMeReauthenticatePost({ password: hashed });
	return (res || {}) as ReAuthenticateResult;
}

export function useReAuthenticate() {
	return useMutation<ReAuthenticateResult, Error, string>({
		mutationFn: reAuthenticate,
	});
}

/** 发起手机号变更（pending 两阶段第一步）
 *  生成 API（TASK-096 遗留项迁移）：body 用 camelCase（ChangePhoneRequest），
 *  apiClient 请求拦截器自动转 snake_case（new_phone），与后端 DTO 一致；
 *  stepUpToken 经 withStepUpToken 注入 X-StepUp-Token 头（重认证 403 重试必须携带）。 */
async function changePhone(newPhone: string, password: string, stepUpToken?: string) {
	const hashed = await hashPasswordForTenant(password);
	return withStepUpToken(stepUpToken, () => authMePhoneChangePost({ newPhone, password: hashed }));
}

export function useChangePhone() {
	return useMutation<unknown, Error, { newPhone: string; password: string; stepUpToken?: string }>({
		mutationFn: ({ newPhone, password, stepUpToken }) =>
			changePhone(newPhone, password, stepUpToken),
	});
}

/** 验证手机号变更（pending 两阶段第二步） */
async function verifyPhoneChange(code: string) {
	// 生成 API（TASK-096）：body { code } 与后端 VerifyChangeRequest 一致
	return authMePhoneVerifyPost({ code });
}

export function useVerifyPhoneChange() {
	const qc = useQueryClient();
	return useMutation<unknown, Error, string>({
		mutationFn: verifyPhoneChange,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profile }),
	});
}

/** 发起邮箱变更（pending 两阶段第一步）
 *  生成 API（TASK-096 遗留项迁移）：body 用 camelCase（ChangeEmailRequest），
 *  apiClient 请求拦截器自动转 snake_case（new_email），与后端 DTO 一致；
 *  stepUpToken 经 withStepUpToken 注入 X-StepUp-Token 头（重认证 403 重试必须携带）。 */
async function changeEmail(newEmail: string, password: string, stepUpToken?: string) {
	const hashed = await hashPasswordForTenant(password);
	return withStepUpToken(stepUpToken, () => authMeEmailChangePost({ newEmail, password: hashed }));
}

export function useChangeEmail() {
	return useMutation<unknown, Error, { newEmail: string; password: string; stepUpToken?: string }>({
		mutationFn: ({ newEmail, password, stepUpToken }) =>
			changeEmail(newEmail, password, stepUpToken),
	});
}

/** 验证邮箱变更（pending 两阶段第二步） */
async function verifyEmailChange(code: string) {
	// 生成 API（TASK-096）：body { code } 与后端 VerifyChangeRequest 一致
	return authMeEmailVerifyPost({ code });
}

export function useVerifyEmailChangeByIdentifier() {
	const qc = useQueryClient();
	return useMutation<unknown, Error, string>({
		mutationFn: verifyEmailChange,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profile }),
	});
}

/** 退出其他设备（保留当前会话；session-service exclude_session_id） */
async function revokeOtherSessions() {
	return authMeSessionsDelete();
}

export function useRevokeOtherSessions() {
	return useMutation<unknown, Error, void>({
		mutationFn: () => revokeOtherSessions(),
	});
}

/** 取消邮箱变更（S5.1 cancel-pending，TASK-086 端点） */
async function cancelEmailChange() {
	// 生成 API（TASK-096）：无 body；后端 CancelEmailChange 不绑定 JSON，幂等语义一致
	return authMeEmailChangeCancelPost();
}

export function useCancelEmailChange() {
	const qc = useQueryClient();
	return useMutation<unknown, Error, void>({
		mutationFn: () => cancelEmailChange(),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profile }),
	});
}

/** 取消手机号变更（S5.1 cancel-pending，TASK-086 端点） */
async function cancelPhoneChange() {
	// 生成 API（TASK-096）：无 body；后端 CancelPhoneChange 不绑定 JSON，幂等语义一致
	return authMePhoneChangeCancelPost();
}

export function useCancelPhoneChange() {
	const qc = useQueryClient();
	return useMutation<unknown, Error, void>({
		mutationFn: () => cancelPhoneChange(),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profile }),
	});
}

/** 识别后端 403 reauth_required（61002201）错误（AC-010，GAP-3 修复）
 *  ① code===61002201（含包装串）→ true（精确匹配优先）
 *  ② 响应体无 code 字段 → 回退 status===403 → true（R7 保留回退）
 *  ③ 其他业务码（如 61002203 验证码无效 + 403）→ false（不误判为重认证）
 */
export function isReauthRequiredError(err: unknown): boolean {
	const anyErr = err as { response?: { status?: number; data?: { code?: number | string } } };
	const code = anyErr?.response?.data?.code;
	// ① 业务码精确匹配（含包装串兼容）
	if (code === 61002201 || String(code).includes('61002201')) return true;
	// ② 无 code 字段 → 回退 HTTP 403
	if (code === undefined || code === null || code === '') {
		if (anyErr?.response?.status === 403) return true;
	}
	// ③ 其他业务码（含 61002203+403）→ false
	return false;
}
