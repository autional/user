import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestWrapper } from '@/test/wrapper';
import LoginHistoryPage from '@/app/security/login-history/page';
import { useAuditLogs } from '@/hooks/queries';
import { authMeAuditLogs } from '@autional/shared/generated/api';

vi.mock('@/hooks/use-toast', () => ({
	useToast: vi.fn(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() })),
}));

vi.mock('@/hooks/queries', () => ({
	useAuditLogs: vi.fn(),
}));

// UP-29：导出改为逐页直连 authMeAuditLogs（全量跨页），不再是列表数据的内存映射。
vi.mock('@autional/shared/generated/api', async () => {
	const actual = await vi.importActual<typeof import('@autional/shared/generated/api')>(
		'@autional/shared/generated/api',
	);
	return { ...actual, authMeAuditLogs: vi.fn() };
});

// 三态覆盖：空值（''）/ failed / success 各一行。
const AUDIT_ITEMS = [
	{
		id: 'row-empty',
		timestamp: '2026-10-04T08:00:00+08:00',
		ip: '10.0.0.1',
		userAgent: 'Mozilla/5.0 Chrome',
		status: '',
		reason: '',
		action: 'login',
	},
	{
		id: 'row-failed',
		timestamp: '2026-10-04T09:00:00+08:00',
		ip: '10.0.0.2',
		userAgent: 'Mozilla/5.0 Chrome',
		status: 'failed',
		reason: 'bad password',
		action: 'login',
	},
	{
		id: 'row-success',
		timestamp: '2026-10-04T10:00:00+08:00',
		ip: '10.0.0.3',
		userAgent: 'Mozilla/5.0 Chrome',
		status: 'success',
		reason: '',
		action: 'login',
	},
];

describe('LoginHistoryPage — UP-25 空值三态（AC-02-2/02-3）+ UP-100 位置列退役', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useAuditLogs).mockReturnValue({
			data: { items: AUDIT_ITEMS, total: AUDIT_ITEMS.length },
			isLoading: false,
			error: null,
		} as any);
		// 导出全量循环的数据源：默认与列表同数据（不足一页即收尾）。
		vi.mocked(authMeAuditLogs).mockResolvedValue({
			items: AUDIT_ITEMS,
			total: AUDIT_ITEMS.length,
		} as any);
	});

	it('表格：空 status 为「—」且不落成功/失败分支；位置列已退役（UP-100）', () => {
		render(<LoginHistoryPage />, { wrapper: TestWrapper });

		const table = screen.getByRole('table');
		expect(within(table).getAllByText('—')).toHaveLength(1); // 仅 row-empty 的 status（位置列已退役）
		expect(within(table).getAllByText('失败')).toHaveLength(1); // 仅 row-failed
		expect(within(table).getAllByText('成功')).toHaveLength(1); // 仅 row-success（空值不得计入）
		// UP-100：位置列的服务端数据链不存在（AuditLogResponse 无 location），列整体退役。
		expect(within(table).queryByText('位置')).not.toBeInTheDocument();
		expect(screen.queryByText('未知位置')).not.toBeInTheDocument();
	});

	it('CSV：与表格同值（空值「—」/ 语义值各自成立）；不含位置列', async () => {
		const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:test');
		Object.defineProperty(URL, 'createObjectURL', {
			value: createObjectURL,
			configurable: true,
			writable: true,
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			value: vi.fn(),
			configurable: true,
			writable: true,
		});
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		render(<LoginHistoryPage />, { wrapper: TestWrapper });
		fireEvent.click(screen.getByRole('button', { name: /导出/ }));

		await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
		const blob = createObjectURL.mock.calls[0][0];
		const csv = await blob.text();

		expect(csv.match(/"—"/g)).toHaveLength(1); // row-empty：status（与表格同值；位置列已退役）
		expect(csv.match(/"失败"/g)).toHaveLength(1);
		expect(csv.match(/"成功"/g)).toHaveLength(1);
		expect(csv).not.toContain('位置');
		expect(csv).not.toContain('未知位置');

		clickSpy.mockRestore();
	});

	it('UP-26：状态筛选走服务端 statusClass（failed→failure；all 不下发）', async () => {
		render(<LoginHistoryPage />, { wrapper: TestWrapper });

		// 初始 all：查询参数不携带 statusClass（服务端不筛）。
		expect(vi.mocked(useAuditLogs).mock.calls.at(-1)?.[0]).not.toHaveProperty('statusClass');

		// 失败 → status_class=failure（服务端值域），不是把 'failed' 原样丢给后端。
		fireEvent.click(screen.getByRole('button', { name: '失败' }));
		await waitFor(() => {
			expect(vi.mocked(useAuditLogs).mock.calls.at(-1)?.[0]).toMatchObject({
				statusClass: 'failure',
			});
		});

		// 成功 → success。
		fireEvent.click(screen.getByRole('button', { name: '成功' }));
		await waitFor(() => {
			expect(vi.mocked(useAuditLogs).mock.calls.at(-1)?.[0]).toMatchObject({
				statusClass: 'success',
			});
		});

		// 回到全部 → 参数移除。
		fireEvent.click(screen.getByRole('button', { name: '全部' }));
		await waitFor(() => {
			expect(vi.mocked(useAuditLogs).mock.calls.at(-1)?.[0]).not.toHaveProperty('statusClass');
		});
	});

	it('UP-100：关键词防抖后按 keyword 入参（输入中不打接口）', async () => {
		render(<LoginHistoryPage />, { wrapper: TestWrapper });

		const callsBefore = vi.mocked(useAuditLogs).mock.calls.length;
		const input = screen.getByPlaceholderText('搜索 IP / 设备 / 详情');

		fireEvent.change(input, { target: { value: '10.0.0.2' } });
		// 防抖窗口内不产生新查询参数（keyword 未定稿）。
		expect(vi.mocked(useAuditLogs).mock.calls.at(-1)?.[0]).not.toHaveProperty('keyword');

		await waitFor(() => {
			expect(vi.mocked(useAuditLogs).mock.calls.at(-1)?.[0]).toMatchObject({
				keyword: '10.0.0.2',
			});
		});
		expect(vi.mocked(useAuditLogs).mock.calls.length).toBeGreaterThan(callsBefore);
	});
});

// W3g（UP-28/UP-29）回归锁：分页尺寸控件与全量导出 —— 旧实现两者都是「欺骗性控件」。
describe('LoginHistoryPage — UP-28 分页尺寸 / UP-29 全量导出', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useAuditLogs).mockReturnValue({
			data: { items: AUDIT_ITEMS, total: AUDIT_ITEMS.length },
			isLoading: false,
			error: null,
		} as any);
		vi.mocked(authMeAuditLogs).mockResolvedValue({
			items: AUDIT_ITEMS,
			total: AUDIT_ITEMS.length,
		} as any);
	});

	it('UP-28：尺寸切换（20 条/页）真实生效 → 查询参数 pageSize=20', async () => {
		// total>50 时 antd 才显示尺寸切换；给 60 条让控件出现。
		vi.mocked(useAuditLogs).mockReturnValue({
			data: { items: AUDIT_ITEMS, total: 60 },
			isLoading: false,
			error: null,
		} as any);

		render(<LoginHistoryPage />, { wrapper: TestWrapper });
		expect(vi.mocked(useAuditLogs).mock.calls.at(-1)?.[0]).toMatchObject({ page: 1, pageSize: 10 });

		fireEvent.mouseDown(screen.getByRole('combobox'));
		// 选项门户到 body；按文案前缀找「20」（中英 locale 的 items_per_page 文案都收）。
		const option20 = await waitFor(() => {
			const opt = Array.from(document.querySelectorAll('.ant-select-item-option')).find((el) =>
				el.textContent?.trim().startsWith('20'),
			);
			expect(opt).toBeTruthy();
			return opt as HTMLElement;
		});
		fireEvent.click(option20);

		await waitFor(() => {
			expect(vi.mocked(useAuditLogs).mock.calls.at(-1)?.[0]).toMatchObject({ pageSize: 20 });
		});
	});

	it('UP-29：导出逐页拉全量（pageSize=100）而非仅当前页；文件名用本地日期', async () => {
		const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:test');
		Object.defineProperty(URL, 'createObjectURL', {
			value: createObjectURL,
			configurable: true,
			writable: true,
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			value: vi.fn(),
			configurable: true,
			writable: true,
		});
		let downloadName = '';
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(function (this: HTMLAnchorElement) {
				downloadName = this.download;
			});

		// 第一页拉满 100 条（表示还有后续页），第二页 1 条收尾 → 两页数据都要进 CSV。
		const firstBatch = Array.from({ length: 100 }, (_, i) => ({
			id: `exp-${i}`,
			timestamp: '2026-10-04T08:00:00+08:00',
			ip: `10.9.0.${i}`,
			userAgent: 'Mozilla/5.0 Chrome',
			status: 'success',
			reason: '',
			action: 'login',
		}));
		const lastBatch = [
			{
				id: 'exp-last',
				timestamp: '2026-10-04T09:00:00+08:00',
				ip: '10.9.9.9',
				userAgent: 'Mozilla/5.0 Firefox',
				status: 'failed',
				reason: 'boom',
				action: 'login',
			},
		];
		vi.mocked(authMeAuditLogs)
			.mockResolvedValueOnce({ items: firstBatch, total: 101 } as any)
			.mockResolvedValueOnce({ items: lastBatch, total: 101 } as any);
		// 页面本身只显示当前页 10 条 —— 旧实现导出只有这 10 条。
		vi.mocked(useAuditLogs).mockReturnValue({
			data: { items: firstBatch.slice(0, 10), total: 101 },
			isLoading: false,
			error: null,
		} as any);

		render(<LoginHistoryPage />, { wrapper: TestWrapper });
		fireEvent.click(screen.getByRole('button', { name: /导出/ }));

		await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
		const csv = await createObjectURL.mock.calls[0][0].text();

		// 两页都以导出规格请求（页大小 100，不是页面当前的 10）。
		expect(vi.mocked(authMeAuditLogs).mock.calls[0][0]).toMatchObject({
			page: 1,
			pageSize: 100,
			action: 'login',
		});
		expect(vi.mocked(authMeAuditLogs).mock.calls[1][0]).toMatchObject({ page: 2, pageSize: 100 });
		// 第二页的行也进了 CSV（旧实现不含）。
		expect(csv).toContain('"10.9.9.9"');
		expect(csv).toContain('"boom"');

		// 文件名 = 本地日期（toISOString 的 UTC 日期在东八区 0-8 点会写成前一天）。
		const now = new Date();
		const expectDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
			now.getDate(),
		).padStart(2, '0')}`;
		expect(downloadName).toBe(`login-history-${expectDate}.csv`);

		clickSpy.mockRestore();
	});
});
