import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthService } from '@autional/shared';
import WalletPage from './page';
import { queryKeys } from '@/hooks/queries';
import { TestWrapper } from '@/test/wrapper';
import { PortalChrome } from '@/test/portal-chrome';

// 这个 story 渲染的是**真实的页面组件**，只把「取数」换成预置的查询缓存。
//
// 为什么不用 vi.mock（本目录此前的三个页面 story 都是那么写的）：
// vi 来自 vitest，而 Storybook 跑在浏览器里 —— 导入它会直接抛
// 「Cannot read properties of undefined (reading 'customEqualityTesters')」，页面根本渲染不出来。
// 那三个老 story 因此一直是坏的，只是没人打开 Storybook 看（计划 L4）。
// 预置 React Query 缓存 + 置位 AuthService 这条路不需要替换任何模块：
// 查询键是真实的生产键，组件是真实组件，所以「看到的样子」就是线上的样子。
const USER_ID = 'test-user-001';

let realFetch: typeof fetch | undefined;
/** 把传输层挂住 → 页面停在加载态。替换的是 fetch，不是业务模块。 */
function stallFetch() {
	realFetch = realFetch ?? globalThis.fetch;
	globalThis.fetch = () => new Promise<Response>(() => {});
}
function restoreFetch() {
	if (realFetch) { globalThis.fetch = realFetch; realFetch = undefined; }
}

function Seeded({ seed, children }: { seed?: (c: QueryClient) => void; children: React.ReactNode }) {
	const [client] = useState(() => {
		const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		seed?.(c);
		return c;
	});
	// 用户/租户上下文来自共享的 auth store；直接置位，不替换模块。
	if (AuthService.getUser()?.id !== USER_ID) {
		AuthService.setAuth('story-access-token', 'story-refresh-token', {
			id: USER_ID,
			username: 'story-user',
			email: 'story@example.com',
		} as never);
	}
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta: Meta<typeof WalletPage> = {
	title: 'Pages/Wallet',
	component: WalletPage,
	parameters: { layout: 'fullscreen' },
	// 页面 story 一律套上真实外壳：外框归 AppShell，页面自己不再带内边距（第 28 轮）。
	decorators: [(Story) => (
		<PortalChrome>
			<Story />
		</PortalChrome>
	)],
};

export default meta;
type Story = StoryObj<typeof WalletPage>;

const balanceData = {
	walletId: 'wl_test',
	currency: 'CNY',
	availableBalance: '12580.50',
	frozenBalance: '500.00',
};
const statsData = {
	transactionCount: 156,
	totalDeposits: '45000',
	totalWithdrawals: '32000',
	averageTransaction: '288.46',
};
const couponsData = {
	items: [
		{ id: 'c1', code: 'SAVE20', name: '20元优惠券', type: 'cash', value: '20', minAmount: '100', status: 'unused', validUntil: '2026-12-31T23:59:59Z' },
		{ id: 'c2', code: 'HALF50', name: '五折券', type: 'discount', value: '50', minAmount: '200', status: 'unused', validUntil: '2026-08-15T23:59:59Z' },
	],
	total: 2,
};
const transactionsData = {
	items: [
		{ id: 'tx_001', type: 'deposit', amount: '500.00', description: '充值', status: 'completed', createdAt: '2026-06-01T10:30:00Z' },
		{ id: 'tx_002', type: 'withdraw', amount: '200.00', description: '提现', status: 'completed', createdAt: '2026-06-02T14:20:00Z' },
		{ id: 'tx_003', type: 'transfer_out', amount: '300.00', description: '转账至用户@lisi', status: 'pending', createdAt: '2026-06-08T09:15:00Z' },
	],
	total: 3,
};
const historyData = {
	items: [
		{ type: 'deposit', amount: '500.00', balanceBefore: '1000.00', balanceAfter: '1500.00', date: '2026-06-01', transactionId: 'tx_001' },
		{ type: 'withdraw', amount: '-200.00', balanceBefore: '1500.00', balanceAfter: '1300.00', date: '2026-06-02', transactionId: 'tx_002' },
	],
	total: 2,
};

const seedNormal = (c: QueryClient) => {
	c.setQueryData(queryKeys.wallet(USER_ID), balanceData);
	c.setQueryData(queryKeys.walletStats(USER_ID), statsData);
	c.setQueryData(queryKeys.walletCoupons(USER_ID), couponsData);
	c.setQueryData(queryKeys.walletBalanceHistory(USER_ID), historyData);
	c.setQueryData(queryKeys.walletTransactions(USER_ID, 1, 20), transactionsData);
};

const restore = [async () => { restoreFetch(); return {}; }];

export const Loading: Story = {
	loaders: [async () => { stallFetch(); return {}; }],
	render: () => (
		<Seeded>
			<TestWrapper>
				<WalletPage />
			</TestWrapper>
		</Seeded>
	),
};

export const Normal: Story = {
	loaders: restore,
	render: () => (
		<Seeded seed={seedNormal}>
			<TestWrapper>
				<WalletPage />
			</TestWrapper>
		</Seeded>
	),
};

export const Empty: Story = {
	loaders: restore,
	render: () => (
		<Seeded
			seed={(c) => {
				c.setQueryData(queryKeys.wallet(USER_ID), balanceData);
				c.setQueryData(queryKeys.walletStats(USER_ID), {
					transactionCount: 0,
					totalDeposits: '0',
					totalWithdrawals: '0',
					averageTransaction: '0',
				});
				c.setQueryData(queryKeys.walletCoupons(USER_ID), { items: [], total: 0 });
				c.setQueryData(queryKeys.walletBalanceHistory(USER_ID), { items: [], total: 0 });
				c.setQueryData(queryKeys.walletTransactions(USER_ID, 1, 20), { items: [], total: 0 });
			}}
		>
			<TestWrapper>
				<WalletPage />
			</TestWrapper>
		</Seeded>
	),
};

// 错误态**不预置任何缓存**：Storybook 里没有后端，真实请求会失败，页面走的就是真实错误路径。
// 这正是「不替换模块」的额外好处 —— 连错误分支都是真的跑出来的。
export const Error: Story = {
	loaders: restore,
	render: () => (
		<Seeded>
			<TestWrapper>
				<WalletPage />
			</TestWrapper>
		</Seeded>
	),
};
