import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestWrapper } from '@/test/wrapper';
import SubscribePage from '@/app/billing/subscribe/page';

// UP-60 回归锁（WCAG 2.1.1 键盘）：套餐卡此前是 div[onClick] —— 键盘不可达、选中态无程序化语义。
// 修复后：每卡一枚透明覆盖 button（aria-pressed 选中态 + 可访问名=套餐名），原生 button 即键盘可达；
// 卡内「订阅」CTA 抬到 z-10 之上独立触发（本测试只锁选择，不点击资金类 CTA）。

const h = vi.hoisted(() => ({
	subscribe: vi.fn(),
}));

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('@/hooks/use-tenant', () => ({
	useTenant: () => ({ currentTenantId: 'tenant-1' }),
}));

vi.mock('@/hooks/queries', () => ({
	usePublicPlans: vi.fn(),
	useSubscription: vi.fn(),
	useSubscribe: vi.fn(),
}));

import { usePublicPlans, useSubscription, useSubscribe } from '@/hooks/queries';

const PLANS = [
	{
		id: 'p-basic',
		plan: 'basic',
		name: 'Basic',
		description: '基础版',
		monthlyPrice: '99',
		yearlyPrice: '990',
		features: ['基础功能'],
	},
	{
		id: 'p-pro',
		plan: 'pro',
		name: 'Pro',
		description: '专业版',
		monthlyPrice: '499',
		yearlyPrice: '4990',
		features: ['全部功能'],
	},
];

function renderPage() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<TestWrapper>
			<QueryClientProvider client={qc}>
				<SubscribePage />
			</QueryClientProvider>
		</TestWrapper>,
	);
}

describe('SubscribePage 套餐卡键盘可达（UP-60）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(usePublicPlans).mockReturnValue({
			data: { items: PLANS },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);
		vi.mocked(useSubscription).mockReturnValue({ data: undefined } as any);
		h.subscribe.mockResolvedValue({});
		vi.mocked(useSubscribe).mockReturnValue({
			mutateAsync: h.subscribe,
			isPending: false,
		} as any);
	});

	it('每卡=真 button（原生键盘可达）+ 可访问名=套餐名 + aria-pressed 互斥选中态', async () => {
		renderPage();
		await screen.findByText('选择套餐');

		const proCover = screen.getByRole('button', { name: 'Pro' });
		// 真 button 元素 = Tab 可达 + Enter/Space 激活（此前 div 无 tabindex/键盘事件）
		expect(proCover.tagName).toBe('BUTTON');
		expect(proCover).toHaveAttribute('aria-pressed', 'false');
		const basicCover = screen.getByRole('button', { name: 'Basic' });
		expect(basicCover).toHaveAttribute('aria-pressed', 'false');

		// 选择 Pro：程序化选中态翻转 + CTA 出现；仅选择、零资金调用
		fireEvent.click(proCover);
		expect(proCover).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: '订阅' })).toBeInTheDocument();
		expect(h.subscribe).not.toHaveBeenCalled();

		// 互斥：改选 Basic 后 Pro 回落
		fireEvent.click(basicCover);
		expect(basicCover).toHaveAttribute('aria-pressed', 'true');
		expect(proCover).toHaveAttribute('aria-pressed', 'false');
		expect(h.subscribe).not.toHaveBeenCalled();
	});
});

// UP-58/61 回归锁：①服务端 features 键映射本地化 + quotas 参数重建；②月付价升序排序；
// ③isPopular 徽标；④当前套餐胶囊显示名（服务端 name 优先，非 plan 代码）；⑤未收录键透传。
const PLANS_58 = [
	{
		id: 'p-pro',
		plan: 'pro',
		name: 'Pro',
		description: '专业版',
		monthlyPrice: '499',
		yearlyPrice: '4990',
		features: ['billing.plans.feature.max_users', 'billing.plans.feature.mfa_enabled', 'vendor.raw.key'],
		quotas: { maxUsers: 10 },
		isPopular: true,
	},
	{
		id: 'p-basic',
		plan: 'basic',
		name: 'Basic',
		description: '基础版',
		monthlyPrice: '99',
		yearlyPrice: '990',
		features: ['billing.plans.feature.sso_enabled'],
		quotas: {},
	},
];

describe('SubscribePage 套餐文案/排序/徽标（UP-58/61）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(usePublicPlans).mockReturnValue({
			data: { items: PLANS_58 },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);
		vi.mocked(useSubscription).mockReturnValue({
			data: { plan: 'pro', billingCycle: 'monthly' },
		} as any);
		vi.mocked(useSubscribe).mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as any);
	});

	it('服务端 feature 键映射本地化 + quotas 重建数值参数（UP-58）', async () => {
		renderPage();
		await screen.findByText('选择套餐');
		expect(screen.getByText('多因素认证（MFA）')).toBeInTheDocument();
		expect(screen.getByText('单点登录（SSO）')).toBeInTheDocument();
		// max_users 丢参后从 quotas.maxUsers 重建（"最多 10 名用户"）
		expect(screen.getByText('最多 10 名用户')).toBeInTheDocument();
		// 未收录键透传（服务端新增建议/特性时不致断裂）
		expect(screen.getByText('vendor.raw.key')).toBeInTheDocument();
	});

	it('卡片按月付价升序 + isPopular 显示「推荐」徽标（UP-61）', async () => {
		renderPage();
		await screen.findByText('选择套餐');
		const headings = screen.getAllByRole('heading', { level: 3 });
		// fixture 故意 Pro(499) 在前，排序后 Basic(99) 必须在前面
		expect(headings[0]).toHaveTextContent('Basic');
		expect(headings[1]).toHaveTextContent('Pro');
		expect(screen.getByText('推荐')).toBeInTheDocument();
	});

	it('当前套餐胶囊用套餐显示名而非 plan 代码（UP-61）', async () => {
		renderPage();
		await screen.findByText('选择套餐');
		const badge = screen.getByText(/当前套餐/, { selector: 'span' });
		expect(badge.textContent).toContain('Pro');
		expect(badge.textContent).toContain('按月');
	});
});
