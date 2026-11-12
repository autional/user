import { defineConfig } from '@playwright/test';

/**
 * 用户门户浏览器级冒烟（BFF 全量桩，无需后端 / 无需登录）。
 *
 * 目的：挡住只有浏览器里才看得见的问题——路由白屏、租户 slug 漏斗断裂、控制台报错、
 * 首屏渲染失败（单测把 shared 的 auth / bootstrap 链全 mock 掉了，测不到这些）。
 *
 * 与 refs/site-security 的 security-dashboard 同一套口径（本机 Chrome、CI 自带 Chromium），
 * 差别只有端口与 dev server 环境变量：
 *   - 端口 13941 + --strictPort：避免与本机其它站点（13104 / 13940 …）抢端口，
 *     也避免 vite 在端口被占时静默 +1 让 e2e 打到别人的 dev server 上。
 *   - FRONTEND_API_MODE=proxy：让 scripts/env.mjs 把 VITE_API_BASE_URL 落成同源 `/bff`，
 *     这样 page.route 拦截的请求不带跨域面（direct 模式是绝对源站 `API_ORIGIN/bff`，
 *     route.fulfill 的响应会被 CORS 拦；dev 下 direct 还会因缺 API_ORIGIN 直接抛错）。
 *   - 无 API_ORIGIN：proxy 模式不需要（scripts/env.mjs 只在 direct 模式下强制要求）。
 */
const PORT = 13941;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: './e2e',
	timeout: 90_000,
	expect: { timeout: 15_000 },
	// 同一 dev server + 同一份 bff 桩，并行跑没有收益，反而让控制台错误归属变模糊。
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: BASE_URL,
		// 本机用已安装的 Chrome（不下载浏览器）；CI 用 Playwright 自带 Chromium。
		...(process.env.CI ? {} : { channel: 'chrome' }),
		viewport: { width: 1440, height: 900 },
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'desktop' }],
	webServer: {
		// gen-env.mjs 先生成 public/env.js（index.html 里 <script src="/env.js"> 依赖它）
		command: `node ../../scripts/gen-env.mjs && pnpm exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: { FRONTEND_API_MODE: 'proxy' },
	},
});
