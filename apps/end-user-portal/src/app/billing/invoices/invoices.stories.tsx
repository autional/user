import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@autional/shared';
import InvoicesPage from './page';
import { queryKeys } from '@/hooks/queries';
import { TestWrapper } from '@/test/wrapper';
import { PortalChrome } from '@/test/portal-chrome';

// 这个 story 是**表格改造的视觉证据**：渲染的是真实页面组件，只把「取数」换成了预置的查询缓存。
// 表头底色 / 边框 / 行高 / 分页外观全部来自设计系统下发的 antd 组件级令牌 ——
// 与控制台那 156 处 antd Table 是同一份令牌，所以「用户门户的表格长得像不像同一个产品」是可以看的。
//
// 为什么不用 vi.mock（本目录此前的页面 story 都是那么写的）：
// vi 来自 vitest，而 Storybook 跑在浏览器里 —— 导入它会直接抛
// 「Cannot read properties of undefined (reading 'customEqualityTesters')」，页面根本渲染不出来。
// 那三个老 story 因此一直是坏的，只是没人打开 Storybook 看。
// 预置 React Query 缓存这条路不需要任何模块替换：用的是真实的生产查询键与真实组件。
const TENANT = 'tenant_demo';

function Seeded({ data, children }: { data: unknown; children: React.ReactNode }) {
	const [client] = useState(() => {
		const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		c.setQueryData(queryKeys.invoices(TENANT, { page: 1, pageSize: 20 }), data);
		return c;
	});
	// 租户上下文来自共享的 auth store；直接置位，不替换模块。
	useAuthStore.setState({ currentTenantId: TENANT } as never);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta: Meta<typeof InvoicesPage> = {
	title: 'Pages/Invoices',
	component: InvoicesPage,
	parameters: { layout: 'fullscreen' },
	// 页面 story 一律套上真实外壳：外框归 AppShell，页面自己不再带内边距（第 28 轮）。
	decorators: [(Story) => (
		<PortalChrome>
			<Story />
		</PortalChrome>
	)],
};

export default meta;
type Story = StoryObj<typeof InvoicesPage>;

// 五种状态各来一条：徽标的口径是设计系统的 -soft/-text 配对（success/warning/danger/info/neutral），
// 只有在真实底色上才能看出对比度够不够。
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

export const Default: Story = {
	render: () => (
		<Seeded data={invoicesData}>
			<TestWrapper>
				<InvoicesPage />
			</TestWrapper>
		</Seeded>
	),
};

export const Empty: Story = {
	render: () => (
		<Seeded data={{ total: 0, items: [] }}>
			<TestWrapper>
				<InvoicesPage />
			</TestWrapper>
		</Seeded>
	),
};
