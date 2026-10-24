import { routes, type Rewrite, type VercelConfig } from '@vercel/config/v1';

/**
 * 用户中心（user.autional.com / user.autional.cn）的**唯一源站**（B3 单源双区）。
 *
 * 上游 API origin 值 **不写入本仓**，取自 Vercel 项目环境变量 `API_ORIGIN`
 * （cn 项目 = https://api.autional.cn，com 项目 = https://api.autional.com）。
 * 未设置时 **故意抛错**（fail-closed），避免静默产出坏路由。
 *
 * rewrites 承接原 vercel.json 全集（/bff、/api/v1、/oauth/callback 直通、/oauth、/tenant）；
 * `/(.*)` 兜底保持 SPA 语义（rewrites 在文件系统检查后生效，静态资源不受影响）。
 */
const rawOrigin = process.env.API_ORIGIN;

if (!rawOrigin) {
  throw new Error(
    '[user] 缺少环境变量 API_ORIGIN（Vercel 项目设置里配置后重新部署）',
  );
}

const ORIGIN = rawOrigin.replace(/\/+$/, '');

// SPA 兜底只在浏览器导航（Accept: text/html）时生效：缺的 /assets/*.js、/sitemap.xml 等
// 返回真 404，不再被兜成 200 的 index.html（软 404 + 错缓存）。与 status 站同一写法。
const spaFallback: Rewrite = {
  source: '/(.*)',
  destination: '/index.html',
  has: [{ type: 'header', key: 'accept', value: { re: 'text/html' } }],
};

export const config: VercelConfig = {
  framework: 'vite',
  installCommand: 'pnpm install --frozen-lockfile',
  buildCommand: 'pnpm --filter @autional/end-user-portal... build',
  outputDirectory: 'apps/end-user-portal/dist',
  rewrites: [
    routes.rewrite('/bff/:path*', `${ORIGIN}/bff/:path*`),
    routes.rewrite('/api/v1/:path*', `${ORIGIN}/api/v1/:path*`),
    routes.rewrite('/oauth/callback', '/index.html'),
    routes.rewrite('/oauth/:path*', `${ORIGIN}/oauth/:path*`),
    routes.rewrite('/tenant/:path*', `${ORIGIN}/tenant/:path*`),
    spaFallback,
  ],
};
