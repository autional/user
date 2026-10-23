/**
 * 外链白名单（用户可见的第三方 URL 统一入口）。
 *
 * 输入来自服务端元数据（应用的 `website` / `logo_uri`），属**半可信**数据：
 * 应用方可以填任意字符串。渲染成 `<a href>` / `<img src>` 前必须过这一层，
 * 否则 `javascript:` / `data:` / `blob:` 会成为 XSS / 钓鱼入口。
 *
 * 规则：
 * - 只放行 `http:` / `https:`（协议小写归一后比较）。
 * - 必须能解析成绝对 URL 且带主机名（`https://` 空主机视为非法）。
 * - 无法解析 / 协议不符 → 返回 `undefined`，调用方**不渲染**该链接/图片。
 *
 * 返回 `parsed.toString()`（规范化后的绝对地址），避免原样回填带来的歧义。
 */
export function safeExternalUrl(raw?: string | null): string | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	if (!trimmed) return undefined;

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
		if (!parsed.hostname) return undefined;
		return parsed.toString();
	} catch {
		// 协议相对（//evil.com）、裸路径、非法端口/字符都会落到这里
		return undefined;
	}
}
