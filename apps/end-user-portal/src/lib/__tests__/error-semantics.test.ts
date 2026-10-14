import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
	ERROR_SEMANTICS,
	ERROR_SEMANTICS_META,
	MAX_RETRIES,
	UNPROVISIONED_CODES,
	errorCodeOf,
	isRetryableError,
	isNotFoundError,
	isUnauthorizedError,
	isUnprovisionedError,
	semanticsOfError,
	shouldRetry,
} from '@/lib/error-semantics';

/** 构造 axios 形状的错误：{ response: { status, data } }。 */
const httpErr = (status: number, code?: number | string) => ({
	response: { status, data: code === undefined ? {} : { code } },
});

describe('error-semantics —— 契约消费层', () => {
	it('生成的契约目录可用且规模自洽', () => {
		expect(ERROR_SEMANTICS_META.rowCount).toBeGreaterThan(0);
		expect(Object.keys(ERROR_SEMANTICS)).toHaveLength(ERROR_SEMANTICS_META.rowCount);
		expect(UNPROVISIONED_CODES.size).toBeGreaterThan(0);
	});

	it('事故回归（绿）：积分账户未开通 = 空态，不再当错误', () => {
		// 2026-10-14 novel-demo：/points 只认钱包码 61060101 → 61070010 落到「加载失败」
		expect(isUnprovisionedError(httpErr(404, 61070010))).toBe(true);
		expect(isUnprovisionedError(httpErr(404, 61060101))).toBe(true);
		// 后端 code 可能字符串序列化
		expect(isUnprovisionedError(httpErr(404, '61060101'))).toBe(true);
	});

	it('事故回归（红→绿对照）：旧写法确实漏判', () => {
		// 旧实现（已删除）：硬编码只认钱包码
		const legacyIsWalletNotCreated = (e: unknown) =>
			(e as { response?: { status?: number; data?: { code?: unknown } } })?.response?.status === 404 &&
			(e as { response?: { data?: { code?: unknown } } })?.response?.data?.code === 61060101;

		expect(legacyIsWalletNotCreated(httpErr(404, 61070010))).toBe(false); // 旧：漏判 → 错误态
		expect(isUnprovisionedError(httpErr(404, 61070010))).toBe(true); // 新：空态
	});

	it('不得误吞：非未开通的 404 / 非 404 / 空输入一律 false', () => {
		expect(isUnprovisionedError(httpErr(404, 61010004))).toBe(false); // 真 not found
		expect(isUnprovisionedError(httpErr(404))).toBe(false); // 无业务码
		expect(isUnprovisionedError(httpErr(500, 61060101))).toBe(false); // 同码但非 404
		expect(isUnprovisionedError(undefined)).toBe(false);
		expect(isUnprovisionedError(new Error('network'))).toBe(false);
	});

	it('重试策略：4xx（含 404）不重试；5xx/429/无状态码可重试', () => {
		expect(isRetryableError(httpErr(404, 61070010))).toBe(false);
		expect(isRetryableError(httpErr(400))).toBe(false);
		expect(isRetryableError(httpErr(401))).toBe(false);
		expect(isRetryableError(httpErr(403))).toBe(false);
		expect(isRetryableError(httpErr(409))).toBe(false);
		expect(isRetryableError(httpErr(429))).toBe(true);
		expect(isRetryableError(httpErr(500))).toBe(true);
		expect(isRetryableError(httpErr(503))).toBe(true);
		expect(isRetryableError(new Error('network'))).toBe(true); // 无状态码 → 可能是瞬时
	});

	it('重试策略唯一实现 shouldRetry：4xx 不重试 / 5xx·429·无状态码可重试 / 次数上限', () => {
		// 4xx（含 404）一律不重试
		expect(shouldRetry(0, httpErr(404, 61070010))).toBe(false);
		expect(shouldRetry(0, httpErr(403))).toBe(false);
		// 可重试类：首次允许
		expect(shouldRetry(0, httpErr(500))).toBe(true);
		expect(shouldRetry(0, httpErr(429))).toBe(true);
		expect(shouldRetry(0, new Error('network'))).toBe(true);
		// 次数上限：MAX_RETRIES 之后不再重试
		expect(shouldRetry(MAX_RETRIES, httpErr(503))).toBe(false);
	});

	it('errorCodeOf 与 getHttpStatus 形状对齐（F4）：err.code / err.data.code 也认', () => {
		expect(errorCodeOf({ status: 404, data: { code: 61070010 } })).toBe(61070010);
		expect(errorCodeOf({ code: 61070010 })).toBe(61070010);
		expect(errorCodeOf({ status: 404, data: { code: '61070010' } })).toBe(61070010);
		// 非整数/负值/无意义值不认
		expect(errorCodeOf({ code: 1.5 })).toBeUndefined();
		expect(errorCodeOf({ code: -1 })).toBeUndefined();
	});

	it('semanticsOfError / errorCodeOf：取码与兜底', () => {
		expect(errorCodeOf(httpErr(404, 61070010))).toBe(61070010);
		expect(errorCodeOf(httpErr(404, '61070010'))).toBe(61070010);
		expect(errorCodeOf({})).toBeUndefined();
		expect(errorCodeOf('nope')).toBeUndefined();

		expect(semanticsOfError(httpErr(404, 61070010))?.absence).toBe('unprovisioned');
		expect(semanticsOfError(httpErr(404, 61070010))?.uiObservation).toBe('empty_state');
		expect(semanticsOfError(httpErr(404, 61010004))?.uiObservation).toBe('not_found_page');
		// 未收录的码不得猜测
		expect(semanticsOfError(httpErr(404, 99999999))).toBeUndefined();
	});

	it('isNotFoundError / isUnauthorizedError：只认状态码', () => {
		expect(isNotFoundError(httpErr(404))).toBe(true);
		expect(isNotFoundError(httpErr(500))).toBe(false);
		expect(isNotFoundError(undefined)).toBe(false);
		expect(isUnauthorizedError(httpErr(401))).toBe(true);
		expect(isUnauthorizedError(httpErr(403))).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 反回归门（源码级）：把本次消灭的两类债变成"不可能再犯"。
// 依据审查建议「同类问题第二次出现 → 必须变成 lint / 门」，此处落为可执行门。
// ─────────────────────────────────────────────────────────────────────────────

// vitest 以 app 根为 cwd 运行；不用 import.meta.url（vitest 下非 file:// URL）。
const SRC = resolve(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (name === '__tests__' || name === 'test') continue;
			out.push(...sourceFiles(full));
			continue;
		}
		if (!/\.(ts|tsx)$/.test(name)) continue;
		if (/\.stories\.tsx$/.test(name)) continue;
		out.push(full);
	}
	return out;
}

/** 去掉行内尾注释（避免注释里的 `retry:` 造成假阳）；再判整行是否为注释行。 */
const stripInlineComment = (line: string) => line.replace(/\/\/.*$/, '');
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
/** 命中「重试相关配置」：retry 与 retryDelay（两者都能盖过全局默认）。 */
const RETRY_CONFIG_RE = /\b(retry|retryDelay)\s*[:=]/;

describe('反回归门（源码级）', () => {
	it('不得再出现硬编码钱包码特例（WALLET_NOT_CREATED_CODE / isWalletNotCreatedError）', () => {
		const hits: string[] = [];
		for (const f of sourceFiles(SRC)) {
			readFileSync(f, 'utf8')
				.split('\n')
				.forEach((l, i) => {
					if (!isComment(l) && /WALLET_NOT_CREATED_CODE|isWalletNotCreatedError/.test(l)) {
						hits.push(`${relative(SRC, f)}:${i + 1}`);
					}
				});
		}
		expect(hits).toEqual([]);
	});

	it('重试策略只能出现在 src/main.tsx（hook / 页面不得写 retry / retryDelay）', () => {
		const ALLOW = ['main.tsx'];
		const hits: string[] = [];
		for (const f of sourceFiles(SRC)) {
			const rel = relative(SRC, f).replace(/\\/g, '/');
			if (ALLOW.includes(rel)) continue;
			readFileSync(f, 'utf8')
				.split('\n')
				.forEach((l, i) => {
					if (isComment(l)) return;
					if (RETRY_CONFIG_RE.test(stripInlineComment(l))) hits.push(`${rel}:${i + 1}: ${l.trim()}`);
				});
		}
		expect(hits).toEqual([]);
	});

	it('不得重新引入已删除的过渡门面 @/lib/api-error', () => {
		const hits: string[] = [];
		for (const f of sourceFiles(SRC)) {
			if (readFileSync(f, 'utf8').includes('@/lib/api-error')) hits.push(relative(SRC, f));
		}
		expect(hits).toEqual([]);
	});
});
