import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestWrapper } from '@/test/wrapper';
import PointsPage from '@/app/points/page';
import {
	usePointAccount,
	usePointTransactions,
	useExpiringPoints,
	usePointStats,
	usePointValue,
	usePointRiskScore,
	useCreateWallet,
} from '@/hooks/queries';

vi.mock('@/components/ui/Skeleton', () => ({
	SkeletonCard: () =>
		React.createElement('div', { className: 'animate-pulse', 'data-testid': 'skeleton-card' }),
	SkeletonRow: () =>
		React.createElement('div', { className: 'animate-pulse', 'data-testid': 'skeleton-row' }),
}));

vi.mock('@/hooks/use-auth-guard', () => ({
	useAuthGuard: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
	useToast: vi.fn(() => ({
		success: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock('@autional/shared', () => ({
	useAuth: vi.fn(() => ({ userId: 'user1' })),
	useAuthStore: vi.fn(() => ({
		user: { id: 'user1', name: 'Test User' },
		getAccessToken: vi.fn(() => 'mock-token'),
	})),
	getAccessToken: vi.fn(() => 'mock-token'),
}));

vi.mock('@/hooks/queries', () => ({
	usePointAccount: vi.fn(),
	usePointTransactions: vi.fn(),
	useExpiringPoints: vi.fn(),
	usePointStats: vi.fn(),
	usePointValue: vi.fn(),
	usePointRiskScore: vi.fn(),
	useCreateWallet: vi.fn(),
}));

function createMockMutation() {
	return {
		mutate: vi.fn(),
		mutateAsync: vi.fn().mockResolvedValue({}),
		isPending: false,
		isSuccess: false,
		isError: false,
	};
}

const mockAccount = {
	userId: 'user1',
	balance: 15000,
	frozenBalance: 500,
};

const mockExpiringData = {
	totalExpiring: 1000,
	expiringPoints: [
		{ amount: 500, source: 'signup_bonus', daysLeft: 3 },
		{ amount: 500, source: 'daily_login', daysLeft: 7 },
	],
};

const mockStats = {
	totalEarned: 20000,
	totalSpent: 5000,
	earnedThisMonth: 2000,
	spentThisMonth: 800,
};

// UP-50：服务端 cash_value 为 decimal 裸字符串（service-point point_query.go 计算、审计实测 "18"），
// 页面补「¥」单位。mock 复刻真实契约形状，不再用臆造的已格式化串。
const mockValue = {
	cashValue: '18',
};

const mockRisk = {
	riskScore: 85,
	riskLevel: 'low',
};

const mockTransactions = {
	items: [
		{ id: 'tx1', type: 'earn', amount: 500, source: '签到', createdAt: '2026-05-20T10:00:00Z' },
		{ id: 'tx2', type: 'spend', amount: -100, source: '兑换', createdAt: '2026-05-19T15:30:00Z' },
	],
	total: 2,
};

function defaultMocks() {
	vi.mocked(usePointAccount).mockReturnValue({
		data: mockAccount,
		isLoading: false,
		error: null,
		refetch: vi.fn(),
	} as any);
	vi.mocked(usePointTransactions).mockReturnValue({
		data: mockTransactions,
		isLoading: false,
		error: null,
	} as any);
	vi.mocked(useExpiringPoints).mockReturnValue({
		data: mockExpiringData,
		isLoading: false,
		error: null,
	} as any);
	vi.mocked(usePointStats).mockReturnValue({
		data: mockStats,
		isLoading: false,
		error: null,
	} as any);
	vi.mocked(usePointValue).mockReturnValue({
		data: mockValue,
		isLoading: false,
		error: null,
	} as any);
	vi.mocked(usePointRiskScore).mockReturnValue({
		data: mockRisk,
		isLoading: false,
		error: null,
	} as any);
}

describe('PointsPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		defaultMocks();
		vi.mocked(useCreateWallet).mockReturnValue(createMockMutation() as any);
	});

	it('renders loading state', () => {
		vi.mocked(usePointAccount).mockReturnValue({
			data: undefined,
			isLoading: true,
			error: null,
		} as any);

		const { container } = render(<PointsPage />, { wrapper: TestWrapper });

		expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
	});

	it('renders point balance cards with account data', () => {
		render(<PointsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('积分中心')).toBeInTheDocument();
		expect(screen.getByText('可用积分')).toBeInTheDocument();
		expect(screen.getByText('15,000')).toBeInTheDocument();
		expect(screen.getByText('冻结积分')).toBeInTheDocument();
		expect(screen.getByText('500')).toBeInTheDocument();
		expect(screen.getByText('可兑换现金')).toBeInTheDocument();
		expect(screen.getByText('¥18')).toBeInTheDocument();
		expect(screen.getByText('风险评分')).toBeInTheDocument();
		expect(screen.getByText('85分')).toBeInTheDocument();
		expect(screen.getByText('即将过期')).toBeInTheDocument();
	});

	it('shows account cards while transactions are still loading', () => {
		vi.mocked(usePointTransactions).mockReturnValue({
			data: undefined,
			isLoading: true,
			error: null,
		} as any);

		render(<PointsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('积分中心')).toBeInTheDocument();
		expect(screen.getByText('15,000')).toBeInTheDocument();
		expect(screen.getByText('500')).toBeInTheDocument();
		expect(screen.getByText('¥18')).toBeInTheDocument();
		expect(screen.getByText('暂无积分数据')).toBeInTheDocument();
	});

	it('renders transaction history', () => {
		render(<PointsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('交易记录')).toBeInTheDocument();
		expect(screen.getByText('签到')).toBeInTheDocument();
		expect(screen.getByText('兑换')).toBeInTheDocument();
		expect(screen.getByText('获得')).toBeInTheDocument();
		expect(screen.getByText('消费')).toBeInTheDocument();
		expect(screen.getByText('+500')).toBeInTheDocument();
		expect(screen.getByText('-100')).toBeInTheDocument();
	});

	it('renders error state', () => {
		vi.mocked(usePointAccount).mockReturnValue({
			data: undefined,
			isLoading: false,
			error: new Error('Network error'),
			refetch: vi.fn(),
		} as any);

		render(<PointsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('积分信息加载失败')).toBeInTheDocument();
	});

	it('renders create-wallet CTA for 404 with code 61060101 and calls it with current user', () => {
		const mutate = vi.fn();
		vi.mocked(useCreateWallet).mockReturnValue({ ...createMockMutation(), mutate } as any);
		vi.mocked(usePointAccount).mockReturnValue({
			data: undefined,
			isLoading: false,
			error: { response: { status: 404, data: { code: 61060101 } } },
			refetch: vi.fn(),
		} as any);

		render(<PointsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('暂无积分数据')).toBeInTheDocument();
		const cta = screen.getByRole('button', { name: '开通钱包' });
		fireEvent.click(cta);

		expect(mutate).toHaveBeenCalledWith({ userId: 'user1' }, expect.objectContaining({ onSuccess: expect.any(Function) }));
	});

	it('keeps error state for other 404 codes (no CTA)', () => {
		vi.mocked(usePointAccount).mockReturnValue({
			data: undefined,
			isLoading: false,
			error: { response: { status: 404, data: { code: 999999 } } },
			refetch: vi.fn(),
		} as any);

		render(<PointsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('积分信息加载失败')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: '开通钱包' })).not.toBeInTheDocument();
	});

	it('renders expiring points section when expiring points exist', () => {
		render(<PointsPage />, { wrapper: TestWrapper });

		expect(screen.getByText('即将过期的积分')).toBeInTheDocument();
		expect(screen.getByText('3 天后过期')).toBeInTheDocument();
		expect(screen.getByText('7 天后过期')).toBeInTheDocument();
		expect(screen.getByText('1,000积分')).toBeInTheDocument();
	});
});
