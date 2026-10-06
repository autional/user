import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router';
import { TenantSlugProvider, useAuthStore } from '@autional/shared';
import AppLayout from '@/components/layout/AppLayout';
import InvoicesPage from '@/app/billing/invoices/page';
import { queryKeys } from '@/hooks/queries';
import { TestWrapper } from '@/test/wrapper';

// 这个 story 的目标**不是**页面内容，而是**外壳本身**（计划 L24）：
// 在此之前，对比度闸门的 AA2（图标是控件唯一视觉内容时必须 ≥3:1）一个样本都量不到 ——
// 四个目标页里，admin 的 /404 在外壳之外（headers 0 / asides 0），
// 另外几条页面 story 的取景框用的是 PortalChrome 的**占位**顶栏，里面连一个 button 都没有。
//
// 这里渲染的是 **user 门户真实的 AppLayout**：真导航项、真的 Bell / Megaphone / ThemeToggle /
// PortalSwitcher / LanguageSwitcher / UserMenu，全是站点代码给 AppShell 的 props。
// 被替换的只有两样，而且都是「数据」不是「结构」：
//   ① 取数 —— 真实查询键 + 预置缓存（第 25 轮的口径，不替换任何模块）；
//   ② 鉴权守卫 —— 生产由 RequireAuth 拦，这里直接把 AppLayout 挂在路由上。
//
// ⚠ 一条必须记住的雷（侦察实测）：**不要给 user.id，也不要调 AuthService.setAuth**。
// AppLayout 的 useNotificationStream 一旦同时拿到 userId 与非 JWT 的假 token，会判定会话过期 →
// refreshAccessToken().catch(logout(authUrl)) → auth-trace 直接 window.location.href = 目标地址，
// 整个 iframe 会跳走，闸门量到的就是一张空白页。user.id 留空时该 hook 直接短路。
const TENANT = 'tenant_demo';

// 十一种状态各一条的发票数据（与 invoices.stories 同一份口径，表头五档徽标只在真实底色上才看得出对比度）
const invoicesData = {
	total: 5,
	items: [
		{ id: 'inv_001', invoiceNumber: 'INV-2026-0001', amount: '1280.00', plan: '企业版', status: 'paid', createdAt: '2026-06-01T10:30:00Z' },
		{ id: 'inv_002', invoiceNumber: 'INV-2026-0002', amount: '1280.00', plan: '企业版', status: 'pending', createdAt: '2026-07-01T10:30:00Z' },
		{ id: 'inv_003', invoiceNumber: 'INV-2026-0003', amount: '399.00', plan: '专业版', status: 'overdue', createdAt: '2026-05-01T10:30:00Z' },
		{ id: 'inv_004', invoiceNumber: 'INV-2026-0004', amount: '399.00', plan: '专业版', status: 'refunded', createdAt: '2026-04-01T10:30:00Z' },
		{ id: 'inv_005', invoiceNumber: 'INV-2026-0005', amount: '99.00', plan: '基础版', status: 'cancelled', createdAt: '2026-03-01T10:30:00Z' },
	],
};

function Seeded({ children }: { children: React.ReactNode }) {
	const [client] = useState(() => {
		const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		c.setQueryData(queryKeys.invoices(TENANT, { page: 1, pageSize: 20 }), invoicesData);
		// 门户目录：PortalSwitcher 在 portals.length < 2 时返回 null，所以要给 ≥2 条才看得见那个按钮。
		// code 取「无门槛」的几个（platform 要平台租户成员、admin/security 要管理面角色），
		// 否则可见性镜像会把它们过滤掉，切换器又不渲染了。
		// featureGates 也播一下：不播它，外壳会去请求 /bff/billing/...（静态托管下 404）
		// —— 那是一条「闸门量到的页面依赖一个必然失败的请求」的噪音，与页面长相无关。
		c.setQueryData(['featureGates'], { featureGates: [] });
		c.setQueryData(['portal-catalog', 'self', TENANT], [
			{ code: 'user', name: '用户门户', order: 1 },
			{ code: 'status', name: '服务状态', order: 2 },
			{ code: 'docs', name: '开发者文档', order: 3 },
		]);
		return c;
	});
	// 租户上下文来自共享的 auth store；直接置位，不替换模块。
	// user 只给展示字段，**刻意不给 id**（理由见文件头那条雷）。
	useAuthStore.setState({
		tenants: [
			{ id: TENANT, name: '示例租户', role: 'member' },
			{ id: 'tenant_other', name: '第二个租户', role: 'member' },
		],
		currentTenantId: TENANT,
		user: { username: 'story-user', email: 'story@example.com' },
	} as never);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta: Meta<typeof AppLayout> = {
	title: 'Shell/UserAppShell',
	component: AppLayout,
	parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof AppLayout>;

// TestWrapper 提供 i18n / 主题 / antd / Toast / 路由器（与 main.tsx 同一套栈）；
// initialEntries 给的是**深链** —— 只有落在 /:tenantSlug/billing/invoices 上，
// 真实导航项的选中态与面包屑才是生产里的样子（停在 '/' 量到的不是产品）。
export const Default: Story = {
	render: () => (
		// Seeded 必须在测试栈**之外**：它给的是 QueryClient（外壳的未读通知 / 门户目录 /
		// 发票表都从它取数）。少了这一层，整页只剩「No QueryClient set」一条错误。
		<Seeded>
			<TestWrapper initialEntries={[`/${TENANT}/billing/invoices`]}>
				<TenantSlugProvider value={TENANT}>
					<Routes>
						<Route path="/:tenantSlug" element={<AppLayout />}>
							<Route path="billing/invoices" element={<InvoicesPage />} />
						</Route>
					</Routes>
				</TenantSlugProvider>
			</TestWrapper>
		</Seeded>
	),
};
