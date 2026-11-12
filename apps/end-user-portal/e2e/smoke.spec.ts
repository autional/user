import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * 用户门户浏览器冒烟（BFF 全量桩）。
 *
 * 为什么要有这一层：站点是**纯 API 门户**，单测把 `@autional/shared` 的
 * auth / bootstrap / 租户白名单链全 mock 掉了，于是「路由白屏」「租户 slug 漏斗断裂」
 * 「401 抢跑登录跳转」「控制台报错」这类问题单测永远发现不了。
 *
 * 做法：不发真后端、不走登录 —— 用 localStorage 预置一份持久化会话（zustand persist 的
 * `autional-auth-v1`），再把 `/bff/**` 全量拦截成**源码验证过的真实信封形状**。
 * 本站同时存在两种信封，混用会假绿，所以逐个对照源码写了：
 *   - axios 客户端（identity / wallet / point / mfa / profile / billing / tenant 目录）走
 *     `{ code, message, data, timestamp }`：响应拦截器解 `data` 并转 camelCase
 *     （shared/api/client.ts 的 response 拦截器）。
 *   - 公开租户**名单**走裸 `fetch`（shared/components/TenantIndexGuard.tsx:60），后端是
 *     dto_base.ListResponse，数组在**顶层 `items`**（解析顺序 items → data → 原对象）。
 *   - 通知未读数也用 ListResponse（`useUnreadNotifications` 读 `res.data.items`，
 *     拦截器把顶层 items 折成 `{ items, total, pagination }`）。
 */

const SLUG = 'demo';
const TENANT_ID = '01JDEMOTENANT000000000001';
const USER_ID = 'user-smoke';
/** zustand persist 的存储键（shared/auth/create-auth-store.ts 的默认 `name`）。 */
const AUTH_STORAGE_KEY = 'autional-auth-v1';
/**
 * 纯终端用户角色（非管理面）：AppLayout 落「概览」侧栏，不触发任何管理面端点。
 * 权限集与 `/auth/me/permissions` 桩保持一致 —— bootstrap 会把它写回 store。
 */
const ROLE = 'member';
const PERMISSIONS = ['profile:read', 'wallet:read', 'point:read', 'notification:read', 'mfa:read'];

/** exp = 2100-01-01：避免被 shared 的 isTokenExpired 判过期，触发 refresh 分支跑偏。 */
const ACCESS_TOKEN = (() => {
	const encode = (payload: Record<string, unknown>) =>
		Buffer.from(JSON.stringify(payload)).toString('base64url');
	return [
		encode({ alg: 'none', typ: 'JWT' }),
		encode({ sub: USER_ID, exp: 4102444800, tenant_id: TENANT_ID }),
		'smoke',
	].join('.');
})();

const TIMESTAMP = '2026-01-01T00:00:00Z';

const json = (data: unknown) => ({
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify(data),
});

/** 标准信封（axios 拦截器解 data 后转 camelCase）。 */
const envelope = (data: unknown) => json({ code: 0, message: 'ok', data, timestamp: TIMESTAMP });

/** ListResponse 信封（数组在顶层 items，不走 data 分支）。 */
const listResponse = (items: unknown[]) =>
	json({ code: 0, message: 'ok', items, total: items.length, timestamp: TIMESTAMP });

/**
 * 控制台错误噪声白名单。
 * 只放「不是本次冒烟要抓的问题」的噪声；其余一律必须为 0 —— 否则这条断言就失去意义。
 *
 * 资源类：被桩短接的 SSE 收尾、favicon 之类 404，是浏览器自己打的，不是应用代码。
 */
const CONSOLE_NOISE = [/Failed to load resource/i, /net::ERR_/i];

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const text = msg.text();
		if (CONSOLE_NOISE.some((re) => re.test(text))) return;
		errors.push(`[console.error] ${text}`);
	});
	return errors;
}

/** 预置持久化会话：localStorage 在每次导航前写入（addInitScript 每条文档都执行）。 */
async function seedSession(page: Page) {
	await page.addInitScript(
		({ key, token, tenantId, role, permissions, userId }) => {
			window.localStorage.setItem(
				key,
				JSON.stringify({
					state: {
						user: {
							id: userId,
							email: 'smoke@example.com',
							username: 'smoke',
							status: 'active',
						},
						accessToken: token,
						refreshToken: token,
						tenants: [{ id: tenantId, name: 'Demo Tenant', role }],
						currentTenantId: tenantId,
						permissions,
						isAuthenticated: true,
					},
					version: 1,
				}),
			);
		},
		{
			key: AUTH_STORAGE_KEY,
			token: ACCESS_TOKEN,
			tenantId: TENANT_ID,
			role: ROLE,
			permissions: PERMISSIONS,
			userId: USER_ID,
		},
	);
}

/** `/bff/**` 全量桩。未知端点兜底返回空 data（保证不出现 4xx/5xx 噪声）。 */
async function mockApi(page: Page) {
	await page.route('**/bff/**', async (route: Route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname.replace(/^\/bff/, '');

		// ── 启动链（TenantRootRedirect / TenantIndexGuard / BrandingInitializer）──────
		// 公开租户名单：裸 fetch + ListResponse（`items` 在顶层，不是 `data`）
		if (path === '/tenant/api/v1/tenant/public/tenants') {
			return route.fulfill(
				listResponse([{ id: TENANT_ID, name: SLUG, slug: SLUG }]),
			);
		}
		// 公开单租户（品牌）：extractBranding 读不到 logo/主色即返回 null，页面回落设计系统缺省色。
		if (path === `/tenant/api/v1/tenant/public/tenants/${SLUG}`) {
			return route.fulfill(envelope({ id: TENANT_ID, name: SLUG, slug: SLUG }));
		}
		// 门户目录（AppLayout 的 PortalSwitcher）：空列表 ⇒ 切换器按 Gainsight 规则自动隐藏，
		// 冒烟面收敛到「首屏能不能渲染」，不把无关接口的成败混进断言。
		if (/^\/tenant\/api\/v1\/tenants\/[^/]+\/applications$/.test(path)) {
			return route.fulfill(listResponse([]));
		}

		// ── 认证 bootstrap（useBootstrap → auth-queries）─────────────────────────
		if (path === '/identity/api/v1/auth/me/permissions') {
			return route.fulfill(envelope(PERMISSIONS));
		}
		if (path === '/identity/api/v1/auth/me/tenants') {
			return route.fulfill(envelope([{ id: TENANT_ID, name: 'Demo Tenant', role: ROLE }]));
		}
		if (path === '/identity/api/v1/auth/me') {
			return route.fulfill(
				envelope({
					id: USER_ID,
					email: 'smoke@example.com',
					username: 'smoke',
					status: 'active',
				}),
			);
		}

		// ── 概览页数据（shape 对齐页面读取的字段名：camelCase）──────────────────
		// 头像：空 URL ⇒ Avatar 回落首字母（不产生 <img> 失败请求）。
		if (path === '/profile/api/v1/profile/avatar') {
			return route.fulfill(envelope({ avatarUrl: '' }));
		}
		if (path === `/wallet/api/v1/wallets/${USER_ID}/balance`) {
			return route.fulfill(
				envelope({ availableBalance: '128.00', balance: '128.00', currency: 'CNY' }),
			);
		}
		if (path === `/point/api/v1/points/${USER_ID}`) {
			return route.fulfill(envelope({ available: 320, balance: 320 }));
		}
		// 未读通知：ListResponse（页面读 `res.data.items`）
		if (path === '/notification/api/v1/notifications/unread') {
			return route.fulfill(listResponse([]));
		}
		if (path === `/mfa/api/v1/mfa/status/${USER_ID}`) {
			return route.fulfill(
				envelope({ totpEnabled: true, smsEnabled: false, emailEnabled: false }),
			);
		}
		// 功能开关（AppLayout 的 nhi 门）：`featureGates` 缺失即回落 env，行为与线上空开关一致。
		if (path === '/billing/api/v1/billing/feature-gates') {
			return route.fulfill(envelope({ featureGates: [] }));
		}

		// ── 通知 SSE：先换一次性票据，再建流 ─────────────────────────────────────
		if (path === '/notification/api/v1/notifications/stream-ticket') {
			return route.fulfill(envelope({ ticket: 'smoke-ticket' }));
		}
		// 给一段合法的空流：EventSource 收尾后会按重连策略再换票（噪声已在白名单）。
		if (path === '/notification/api/v1/notifications/stream') {
			return route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: ': connected\n\n',
			});
		}

		return route.fulfill(envelope({}));
	});
}

test.describe('用户门户冒烟', () => {
	test.beforeEach(async ({ page }) => {
		await seedSession(page);
		await mockApi(page);
	});

	test('裸根 / 返回 200，且有会话时漏斗到租户总览', async ({ page }) => {
		const errors = collectErrors(page);

		// waitUntil: 'commit' —— 该页是一条「立即整页跳走」的漏斗路由（TenantRootRedirect），
		// 等 load 会在跳转中途被中断（假红），只取文档响应状态这一件事。
		const response = await page.goto('/', { waitUntil: 'commit' });
		expect(response?.status(), 'GET / 的 HTTP 状态').toBe(200);

		// 裸根不得停在空白页：有会话 + 公开名单命中 → /<slug>/（源码 TenantRootRedirect 口径）。
		// 注意 URL 上会带一跳溯源参数 `?rt=<层>.funnel-slug.<id>`（auth-trace 的 decorateTarget），
		// 断言因此只认路径 /demo/，不认整个字符串。
		await expect(page).toHaveURL(new RegExp(`/${SLUG}/(\\?.*)?$`));
		// 问候语证明「会话 + 资料」真的落到了页面上（h1 里还有头像首字母，故用 toContainText）。
		await expect(page.locator('main h1')).toContainText('smoke');

		// 跳转后仍有接口在路上（bootstrap / 概览），给它们落定再判控制台干净。
		await page.waitForTimeout(1_500);
		expect(errors.join('\n'), '控制台/pageerror').toBe('');
	});

	test('租户总览渲染：标题与统计卡可见，且无未捕获异常', async ({ page }) => {
		const errors = collectErrors(page);

		const response = await page.goto(`/${SLUG}/`);
		expect(response?.status()).toBe(200);

		// ④ 稳定元素：AppPageHeader 的 h1（i18n 问候语；cn 区为「你好，{{name}}」）。
		//    它是「真的渲染出来了」的证据，而不是 Suspense 的 LoadingScreen 占位。
		//    语言断言用正则兜住 zh/en 两区（探测链只读 localStorage，缺省 = 区域默认）。
		const heading = page.locator('main h1');
		await expect(heading).toContainText(/你好|Hello/);
		await expect(heading).toContainText('smoke');

		// 统计卡标题只在「四个查询都落定且无错」时才出现（loading 是骨架、error 是 ErrorState），
		// 因此这几条同时证明 wallet / point 桩的**信封形状**是对的。
		const main = page.locator('main');
		await expect(main.getByText('钱包余额')).toBeVisible();
		await expect(main.getByText('可用积分')).toBeVisible();
		await expect(main.getByText('安全状态')).toBeVisible();
		// MFA 桩 totpEnabled=true → 「MFA 已启用」；读错形状会退化成「MFA 未启用」。
		await expect(main.getByText('MFA 已启用')).toBeVisible();

		// ② 非白屏：主体有可见文本，且没有把 undefined 直接喷到脸上。
		const text = await main.innerText();
		expect(text.trim().length).toBeGreaterThan(0);
		expect(text).not.toContain('undefined');

		// ③ 给迟到的报错留窗口（SSE 重连 / 头像补读 / react-query 重试都在这之后落定）。
		await page.waitForTimeout(2_000);
		expect(errors.join('\n'), '控制台/pageerror').toBe('');
	});

	test('未知租户 slug 渲染 404（白名单守卫没被绕过）', async ({ page }) => {
		const errors = collectErrors(page);

		const response = await page.goto('/not-a-tenant/');
		// SPA 由 vite 回落 index.html，HTTP 仍 200；404 是前端按公开名单判定的
		// （RequireAuth 放行 → TenantIndexGuard 用名单比对后渲染 not-found 页）。
		expect(response?.status()).toBe(200);

		await expect(page.getByText('页面未找到')).toBeVisible();
		await expect(page.getByRole('link', { name: '返回概览' })).toBeVisible();
		await page.waitForTimeout(1_000);
		expect(errors.join('\n'), '控制台/pageerror').toBe('');
	});
});
