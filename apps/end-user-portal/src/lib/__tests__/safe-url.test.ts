import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from '@/lib/safe-url';

// 2026-10-23：应用元数据（website / logo_uri）由应用方填写，属半可信数据。
// 这层是唯一的外链白名单，任何协议绕过都意味着 XSS / 钓鱼，必须逐类锁死。

describe('safeExternalUrl', () => {
	it('放行 http/https 并规范化', () => {
		expect(safeExternalUrl('https://novel.example.com')).toBe('https://novel.example.com/');
		expect(safeExternalUrl('http://a.example.com/path?q=1')).toBe('http://a.example.com/path?q=1');
	});

	it('拒绝脚本/数据/本地协议', () => {
		for (const bad of [
			'javascript:alert(1)',
			'JaVaScRiPt:alert(1)',
			'  javascript:alert(1)  ',
			'java\nscript:alert(1)',
			'data:text/html,<script>alert(1)</script>',
			'blob:https://evil.example.com/x',
			'file:///etc/passwd',
			'vbscript:msgbox(1)',
		]) {
			expect(safeExternalUrl(bad), bad).toBeUndefined();
		}
	});

	it('拒绝协议相对与畸形地址', () => {
		for (const bad of [
			'//evil.com',
			'\\\\evil.com',
			'/relative/path',
			'https://',
			'https://a b',
			'not a url',
			'',
			'   ',
			null,
			undefined,
		]) {
			expect(safeExternalUrl(bad), String(bad)).toBeUndefined();
		}
	});
});
