import { describe, expect, it } from 'vitest';
import { isReauthRequiredError } from '../queries/use-identifier-change';

// AC-010 / GAP-3 修复（TASK-083）：isReauthRequiredError 先精确匹配业务码 61002201，
// 仅当响应体无 code 字段时才回退 status===403；其他业务码（如 61002203+403）不误判为重认证。
describe('isReauthRequiredError (AC-010)', () => {
	it('code === 61002201 → true', () => {
		const err = { response: { status: 403, data: { code: 61002201 } } };
		expect(isReauthRequiredError(err)).toBe(true);
	});

	it('code === 61002203 + status 403 → false（验证码无效不触发重认证流）', () => {
		const err = { response: { status: 403, data: { code: 61002203 } } };
		expect(isReauthRequiredError(err)).toBe(false);
	});

	it('无 code 字段 + status 403 → true（R7 回退分支保留）', () => {
		const err = { response: { status: 403, data: {} } };
		expect(isReauthRequiredError(err)).toBe(true);
	});

	it('非纯数字包装串（如 "errors/61002201"）**不再**按重认证处理（契约要求纯数字码；收紧登记）', () => {
		const err = { response: { status: 200, data: { code: 'errors/61002201' } } };
		expect(isReauthRequiredError(err)).toBe(false);
	});

	it('包装串 "61002201" → true（String(code).includes 兼容）', () => {
		const err = { response: { status: 403, data: { code: '61002201' } } };
		expect(isReauthRequiredError(err)).toBe(true);
	});

	it('无 code + status 400 → false', () => {
		const err = { response: { status: 400, data: { code: 61002204 } } };
		expect(isReauthRequiredError(err)).toBe(false);
	});

	it('null/空 code + status 403 → true', () => {
		const err = { response: { status: 403, data: { code: null } } };
		expect(isReauthRequiredError(err)).toBe(true);
	});
});
