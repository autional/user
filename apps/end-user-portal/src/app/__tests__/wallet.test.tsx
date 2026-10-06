import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestWrapper } from '@/test/wrapper';
import WalletPage from '@/app/wallet/page';
import { useQueries } from '@tanstack/react-query';
import { useWalletTransactions, useRedeemCoupon, useCreateWallet } from '@/hooks/queries';

vi.mock('@/components/ui/Skeleton', () => ({
	SkeletonCard: () =>
		React.createElement('div', { className: 'animate-pulse', 'data-testid': 'skeleton-card' }),
	SkeletonRow: () =>
		React.createElement('div', { className: 'animate-pulse', 'data-testid': 'skeleton-row' }),
}));

vi.mock('@autional/shared', () => ({
	useAuth: vi.fn(() => ({ userId: 'u1' })),
	useAuthStore: vi.fn((selector?: (s: any) => any) => {
		const state = { user: { id: 'u1', username: 'test' } };
		return selector ? selector(state) : state;
	}),
}));

vi.mock('@/hooks/use-toast', () => ({
	useToast: vi.fn(() => ({
		success: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock('@tanstack/react-query', async () => {
	const actual = await vi.importActual('@tanstack/react-query');
	return {
		...actual,
		useQueries: vi.fn(),
	};
});

vi.mock('@/hooks/queries', () => ({
	useWalletTransactions: vi.fn(),
	useRedeemCoupon: vi.fn(),
	useCreateWallet: vi.fn(),
	queryKeys: {
		wallet: vi.fn(() => ['wallet']),
		walletStats: vi.fn(() => ['walletStats']),
		walletCoupons: vi.fn(() => ['walletCoupons']),
		walletBalanceHistory: vi.fn(() => ['walletBalanceHistory']),
	},
	getWalletBalance: vi.fn(),
	getWalletStats: vi.fn(),
	getWalletCoupons: vi.fn(),
	getWalletBalanceHistory: vi.fn(),
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

const mockBalance = {
	walletId: 'w1',
	currency: 'CNY',
	availableBalance: '15000.00',
	frozenBalance: '500.00',
};

const mockTransactions = {
	items: [
		{
			id: 'tx1',
			type: 'deposit',
			amount: '2000.00',
			description: '充值',
			status: 'completed',
			createdAt: '2026-06-01T10:00:00Z',
		},
		{
			id: 'tx2',
			type: 'withdraw',
			amount: '500.00',
			description: '提现',
			status: 'pending',
			createdAt: '2026-06-02T14:30:00Z',
		},
	],
	total: 2,
};

const mockStats = {
	transactionCount: 128,
	totalDeposits: '50000.00',
	totalWithdrawals: '20000.00',
	averageTransaction: '234.38',
};

const mockCoupons = {
	items: [
		{
			id: 'c1',
			code: 'SAVE20',
			name: '满减券',
			type: 'discount',
			value: '20',
			minAmount: '100.00',
			status: 'unused',
			validUntil: '2026-12-31T00:00:00Z',
		},
	],
	total: 1,
};

const mockHistory = {
	items: [
		{
			date: '2026-06-01',
			amount: '2000.00',
			balanceBefore: '13000.00',
			balanceAfter: '15000.00',
			transactionId: 'tx1',
			type: 'deposit',
		},
	],
};

const emptyQueryResult = (refetch?: ReturnType<typeof vi.fn>) => ({
	data: undefined,
	isLoading: false,
	error: null,
	refetch: refetch ?? vi.fn(),
});

describe('WalletPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useQueries).mockReturnValue([
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
		]);
		vi.mocked(useWalletTransactions).mockReturnValue({
			data: undefined,
			isLoading: false,
			error: null,
		} as any);
		vi.mocked(useRedeemCoupon).mockReturnValue(createMockMutation() as any);
		vi.mocked(useCreateWallet).mockReturnValue(createMockMutation() as any);
	});

	it('renders loading state when balance is loading', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: undefined, isLoading: true, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
		]);

		const { container } = render(<WalletPage />, { wrapper: TestWrapper });

		expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
	});

	it('renders error state when balance fails to load', () => {
		const mockRefetch = vi.fn();
		vi.mocked(useQueries).mockReturnValue([
			{
				data: undefined,
				isLoading: false,
				error: new Error('Network error'),
				refetch: mockRefetch,
			},
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
		]);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('钱包信息加载失败')).toBeInTheDocument();
	});

	it('renders create-wallet CTA only for 404 with code 61060101', () => {
		vi.mocked(useQueries).mockReturnValue([
			{
				data: undefined,
				isLoading: false,
				error: { response: { status: 404, data: { code: 61060101 } } },
				refetch: vi.fn(),
			},
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
		]);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('暂无钱包数据')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '开通钱包' })).toBeInTheDocument();
		expect(screen.queryByText('钱包信息加载失败')).not.toBeInTheDocument();
	});

	it('keeps error state for other 404 codes (no CTA)', () => {
		vi.mocked(useQueries).mockReturnValue([
			{
				data: undefined,
				isLoading: false,
				error: { response: { status: 404, data: { code: 999999 } } },
				refetch: vi.fn(),
			},
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
		]);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('钱包信息加载失败')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: '开通钱包' })).not.toBeInTheDocument();
	});

	it('clicking CTA creates the wallet for the current user', () => {
		vi.mocked(useQueries).mockReturnValue([
			{
				data: undefined,
				isLoading: false,
				error: { response: { status: 404, data: { code: 61060101 } } },
				refetch: vi.fn(),
			},
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
		]);
		const mutate = vi.fn();
		vi.mocked(useCreateWallet).mockReturnValue({ ...createMockMutation(), mutate } as any);

		render(<WalletPage />, { wrapper: TestWrapper });
		fireEvent.click(screen.getByRole('button', { name: '开通钱包' }));

		expect(mutate).toHaveBeenCalledWith({ userId: 'u1' });
	});

	it('renders wallet balance card with available balance, frozen, currency, and coupon count', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: mockBalance, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			{ data: mockCoupons, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
		]);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('钱包')).toBeInTheDocument();
		expect(screen.getByText('可用余额')).toBeInTheDocument();
		expect(screen.getByText('¥15,000.00')).toBeInTheDocument();
		expect(screen.getByText('冻结金额')).toBeInTheDocument();
		expect(screen.getByText('¥500.00')).toBeInTheDocument();
		expect(screen.getByText('币种')).toBeInTheDocument();
		expect(screen.getByText('CNY')).toBeInTheDocument();
		expect(screen.getByText('可用优惠券')).toBeInTheDocument();
	});

	it('renders transaction history with type, amount, status and date', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: mockBalance, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
		]);
		vi.mocked(useWalletTransactions).mockReturnValue({
			data: mockTransactions,
			isLoading: false,
			error: null,
		} as any);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('交易记录')).toBeInTheDocument();
		expect(screen.getAllByText('充值').length).toBe(2);
		expect(screen.getAllByText('提现').length).toBe(2);
		expect(screen.getByText('已完成')).toBeInTheDocument();
		expect(screen.getByText('处理中')).toBeInTheDocument();
		expect(screen.getByText('+¥2,000.00')).toBeInTheDocument();
		expect(screen.getByText('-¥500.00')).toBeInTheDocument();
	});

	it('renders empty transaction list when no transactions', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: mockBalance, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			emptyQueryResult(),
			emptyQueryResult(),
		]);
		vi.mocked(useWalletTransactions).mockReturnValue({
			data: { items: [], total: 0 },
			isLoading: false,
			error: null,
		} as any);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('暂无交易记录')).toBeInTheDocument();
	});

	it('renders coupon redemption section with coupon list and input', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: mockBalance, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			{ data: mockCoupons, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
		]);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('优惠券')).toBeInTheDocument();
		expect(screen.getByText('满减券')).toBeInTheDocument();
		expect(screen.getByText('可用')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('输入优惠券码')).toBeInTheDocument();
		expect(screen.getByText('兑换')).toBeInTheDocument();
	});

	it('renders stats section with transaction counts and totals', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: mockBalance, isLoading: false, error: null, refetch: vi.fn() },
			{ data: mockStats, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			emptyQueryResult(),
		]);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('交易笔数')).toBeInTheDocument();
		expect(screen.getByText('128')).toBeInTheDocument();
		expect(screen.getByText('总充值')).toBeInTheDocument();
		expect(screen.getByText('¥50,000')).toBeInTheDocument();
		expect(screen.getByText('总提现')).toBeInTheDocument();
		expect(screen.getByText('¥20,000')).toBeInTheDocument();
		expect(screen.getByText('平均交易')).toBeInTheDocument();
		expect(screen.getByText('¥234.38')).toBeInTheDocument();
	});

	it('renders balance history when history data is available', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: mockBalance, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			emptyQueryResult(),
			{ data: mockHistory, isLoading: false, error: null, refetch: vi.fn() },
		]);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('余额变动历史')).toBeInTheDocument();
		expect(screen.getByText('¥2,000.00')).toBeInTheDocument();
		expect(screen.getByText('¥13,000.00')).toBeInTheDocument();
		expect(screen.getAllByText('¥15,000.00').length).toBe(2);
	});

	it('shows redeem success message when coupon redemption succeeds', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: mockBalance, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			{ data: mockCoupons, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
		]);
		vi.mocked(useRedeemCoupon).mockReturnValue({
			...createMockMutation(),
			isSuccess: true,
		} as any);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('优惠券兑换成功')).toBeInTheDocument();
	});

	it('shows redeem error message when coupon redemption fails', () => {
		vi.mocked(useQueries).mockReturnValue([
			{ data: mockBalance, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
			{ data: mockCoupons, isLoading: false, error: null, refetch: vi.fn() },
			emptyQueryResult(),
		]);
		vi.mocked(useRedeemCoupon).mockReturnValue({
			...createMockMutation(),
			isError: true,
		} as any);

		render(<WalletPage />, { wrapper: TestWrapper });

		expect(screen.getByText('兑换失败，请检查优惠券码')).toBeInTheDocument();
	});
});
