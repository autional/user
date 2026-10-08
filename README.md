# Autional 用户中心

**域名**：[user.autional.cn](https://user.autional.cn)（cn）· [user.autional.com](https://user.autional.com)（com）
**技术栈**：Vite + React 19 + TypeScript + Tailwind CSS
**仓库**：[github.com/autional/user](https://github.com/autional/user)

个人资料、安全设置、会话与授权管理。

## 开发

```bash
pnpm install
pnpm dev      # http://localhost:13104（构建前自动生成 env.js/robots.txt）
pnpm build    # 构建产物：apps/end-user-portal/dist/
pnpm test     # Vitest 单元测试
```

## 部署（单源双区）

`main` → `user`（com）自动部署；`main` → `cn-user`（cn）自动部署。两区**同一份源**，
区域差异全部由 Vercel 项目环境变量在构建期注入（见 `docs/positioning/24`）：

| 变量 | com | cn |
| --- | --- | --- |
| `REGION` | `com` | `cn` |
| `SITE_URL` | `https://user.autional.com` | `https://user.autional.cn` |
| `DEFAULT_LANG` / `FALLBACK_LANG` | `en` | `zh` |
| `API_ORIGIN` | `https://api.autional.com` | `https://api.autional.cn` |
| `CDN_HOST` | `https://cdn.autional.com` | `https://cdn.autional.cn` |

- 路由/重写：`vercel.ts`（fail-closed：`API_ORIGIN` 缺失即构建失败）。
- 生成物（勿手改、勿入库）：`apps/end-user-portal/public/{env.js,robots.txt}` ← `scripts/gen-env.mjs`；区域文案在 `scripts/region-copy.mjs`。
- 本地无 env 时兜底 cn 值（与迁移前基线一致）。
