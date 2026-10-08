import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import { CDN_PIN, readBuildEnv } from '../../scripts/env.mjs';
import { REGION_COPY } from '../../scripts/region-copy.mjs';

const buildEnv = readBuildEnv();
const copy = REGION_COPY[buildEnv.defaultLang];
const CDN_ASSET_BASE = `${buildEnv.cdnHost}/ui/${CDN_PIN}`;

/**
 * index.html 区域占位符（{{TOKEN}}）替换单点——值全部来自 scripts/env.mjs + region-copy.mjs。
 * 未知占位符 fail-closed（防拼写错误静默漏替）。
 */
function regionPlugin(): Plugin {
  const tokens: Record<string, string> = {
    LANG: copy.locale,
    TITLE: copy.title,
    DESCRIPTION: copy.description,
    CDN_ASSET_BASE,
  };
  return {
    name: 'region-plugin',
    enforce: 'pre',
    transformIndexHtml(html) {
      return html.replace(/\{\{(\w+)\}\}/g, (raw, key: string) => {
        if (!(key in tokens)) {
          throw new Error(`[user] index.html 未知区域占位符: {{${key}}}`);
        }
        return tokens[key];
      });
    },
  };
}

function normalizeViteBase(p: string | undefined): string {
  if (!p || p === '/') return '/';
  if (p.includes('Program Files')) {
    throw new Error('MSYS2 path corruption detected on BASE_PATH: ' + p + '. Use PowerShell to build.');
  }
  return p.replace(/\/$/, '') + '/';
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_REGION': JSON.stringify(buildEnv.region),
    'import.meta.env.VITE_SITE_URL': JSON.stringify(buildEnv.siteUrl),
    'import.meta.env.VITE_DEFAULT_LANG': JSON.stringify(buildEnv.defaultLang),
    'import.meta.env.VITE_FALLBACK_LANG': JSON.stringify(buildEnv.fallbackLang),
  },
  plugins: [
    react(),
    regionPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'service-worker',
      filename: 'sw.js',
      manifest: false,
      // U83：全自动即时更新 —— 配合 sw.js 的 self.skipWaiting()/clients.claim()，
      // 客户端脚本在 activated(isUpdate) 时自动 reload（此前缺省 'prompt' 且无 onNeedRefresh
      // 消费方 ⇒ 新 SW 长期停在 waiting，修复对回访者不可见）。
      registerType: 'autoUpdate',
      injectManifest: {
        globDirectory: 'dist',
        globPatterns: ['**/*.{js,css,html,png,svg}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
    process.env.ANALYZE === 'true' && visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
  ].filter(Boolean),
  base: normalizeViteBase(process.env.BASE_PATH),
  resolve: {
    extensions: ['.mjs', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 13104,
    proxy: {
      '/bff': {
        target: process.env.VITE_API_PROXY_URL || 'http://localhost:11080',
        changeOrigin: true,
      },
      '/oauth/': {
        target: process.env.VITE_API_PROXY_URL || 'http://localhost:11080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 13104,
    proxy: {
      '/bff': {
        target: process.env.VITE_API_PROXY_URL || 'http://localhost:11080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // 分块策略与三个控制台对齐：同一套键名、同一套归属。同属一个产品的 portal
        // 不该因为「谁当年记得加 vendor 块」而让首屏体积差出一个量级。
        // antd / icons 必须单独成块：它们的更新节奏跟业务代码完全不同，
        // 混进入口块会让每次业务改动都要求用户重下整个 antd（admin 此前正是如此：入口块 2.7MB）。
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          // user 站不直接用 antd 的图标（它用 lucide）—— antd 内部要用的图标会跟着 antd 落在同一个块里，
          // 所以这里只列本站真的直接依赖的库。列一个不存在的模块会让 Rollup 直接报
          // 「Could not resolve entry module」，构建当场失败（实测踩过，和 recharts 那次同一个坑）。
          'vendor-ui': ['antd', 'lucide-react'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'shared-api': ['@autional/shared'],
        },
      },
    },
  },
});
