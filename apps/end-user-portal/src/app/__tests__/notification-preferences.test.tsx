import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestWrapper } from '@/test/wrapper';
import NotificationPreferencesPage from '@/app/notifications/preferences/page';

// UP-74-A 回归锁（AC-601/602/604/605；探针 UF1-09 判 P2）：
// 读侧改按 channels.email.types 派生（旧读路径取后端从不返回的 typePrefs → 全 ON 假象）；
// 请求体删死字段 typePrefs；全关保存 UI 层禁止（后端对空 types 跳过持久化 = 假成功）；
// channels 三开关往返不回归。真 hooks + 假 generated api + 真 QueryClient。

const h = vi.hoisted(() => ({
	prefsGet: vi.fn(),
	prefsPut: vi.fn(),
}));

vi.mock('@autional/shared', () => ({
	useAuth: () => ({ user: { id: 'u1' }, userId: 'u1' }),
	useAuthStore: { getState: () => ({ currentTenantId: '' }) },
	extractApiError: (err: any, fallback: string) => ({ message: err?.message || fallback }),
	logout: vi.fn(),
	getAUTH_PAGES_URL: () => '/auth',
	API_BASE_URL: '',
	useTenantSlug: () => 'acme-corp',
}));

vi.mock('@autional/shared/generated/api', () => ({
	notificationsPreferencesByPreferences: h.prefsGet,
	notificationsPreferencesByPreferencesPut: h.prefsPut,
}));

vi.mock('@/hooks/use-toast', () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const ALL_TYPES = ['security', 'account', 'billing', 'marketing', 'system'];

const initialPrefs = {
	channels: {
		email: { enabled: true, types: [...ALL_TYPES] },
		sms: { enabled: true, types: [...ALL_TYPES] },
		push: { enabled: false, types: [...ALL_TYPES] },
		inApp: { enabled: true, types: [...ALL_TYPES] },
	},
};

const ALL_TYPE_LABELS = [
	'账户安全相关通知',
	'账户信息变更通知',
	'账单和支付相关通知',
	'产品更新和优惠活动',
	'系统公告和维护通知',
];

function rowSwitch(label: string): HTMLElement {
	const row = screen.getByText(label).closest('.justify-between');
	if (!row) throw new Error(`开关行未找到：${label}`);
	return within(row as HTMLElement).getByRole('switch');
}

function renderPage() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<TestWrapper>
			<QueryClientProvider client={qc}>
				<NotificationPreferencesPage />
			</QueryClientProvider>
		</TestWrapper>,
	);
}

describe('NotificationPreferencesPage（UP-74-A / AC-601, AC-602, AC-604, AC-605）', () => {
	beforeEach(() => {
		h.prefsGet.mockReset();
		h.prefsPut.mockReset();
		h.prefsPut.mockImplementation(async (_userId: string, body: unknown) => body);
	});

	it('AC-601/602：关 marketing → 保存 → 三通道 types 同集合且不含 marketing、无 typePrefs → 重挂载 marketing=OFF 其余 ON', async () => {
		h.prefsGet.mockResolvedValue(initialPrefs);
		const first = renderPage();
		await screen.findByText('通知偏好设置');

		const marketing = rowSwitch('产品更新和优惠活动');
		await waitFor(() => expect(marketing).toHaveAttribute('aria-checked', 'true'));
		fireEvent.click(marketing);
		expect(marketing).toHaveAttribute('aria-checked', 'false');

		fireEvent.click(screen.getByRole('button', { name: '保存偏好' }));
		await waitFor(() => expect(h.prefsPut).toHaveBeenCalledTimes(1));

		const [putUserId, body] = h.prefsPut.mock.calls[0] as [string, any];
		expect(putUserId).toBe('u1');
		// AC-602：请求载荷无死字段 typePrefs（键集恰为 emailEnabled/smsEnabled/pushEnabled/channels/userId）
		expect('typePrefs' in body).toBe(false);
		expect(Object.keys(body).sort()).toEqual([
			'channels',
			'emailEnabled',
			'pushEnabled',
			'smsEnabled',
			'userId',
		]);
		// 写侧四通道同集合（email 为权威源的前提），且 marketing 已剔除
		const expected = ['security', 'account', 'billing', 'system'];
		for (const ch of ['email', 'sms', 'push', 'inApp']) {
			expect([...body.channels[ch].types].sort()).toEqual([...expected].sort());
		}
		expect(body.channels.email.types).not.toContain('marketing');

		// 重挂载（持久化形状 = put 载荷原样，探针 UF1-09 已验证写侧同集合语义）
		first.unmount();
		h.prefsGet.mockReset();
		h.prefsGet.mockResolvedValue({ channels: body.channels });
		renderPage();
		await screen.findByText('通知偏好设置');
		const marketing2 = rowSwitch('产品更新和优惠活动');
		await waitFor(() => expect(marketing2).toHaveAttribute('aria-checked', 'false'));
		expect(rowSwitch('账户安全相关通知')).toHaveAttribute('aria-checked', 'true');
	});

	it('AC-604（P2 分支）：全关 → 保存禁用 + 「至少保留一种通知类型」提示 + 零请求', async () => {
		h.prefsGet.mockResolvedValue(initialPrefs);
		renderPage();
		await screen.findByText('通知偏好设置');

		for (const label of ALL_TYPE_LABELS) {
			const sw = rowSwitch(label);
			await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
			fireEvent.click(sw);
		}

		const save = screen.getByRole('button', { name: '保存偏好' });
		await waitFor(() => expect(save).toBeDisabled());
		expect(screen.getByText('至少保留一种通知类型')).toBeInTheDocument();

		// 禁用态点击不触发 handler（护栏 + UI 双保险），且后端绝不会收到空 types 假成功请求
		fireEvent.click(save);
		expect(h.prefsPut).not.toHaveBeenCalled();
	});

	it('UP-76：开关可访问名=行标签（aria-labelledby 关联），全页零匿名 switch', async () => {
		h.prefsGet.mockResolvedValue(initialPrefs);
		renderPage();
		await screen.findByText('通知偏好设置');

		// 可访问名取自 aria-labelledby 引用的标签元素（短标签；长文案是描述行）
		const typeSwitch = await screen.findByRole('switch', { name: '营销' });
		expect(typeSwitch).toHaveAttribute('aria-checked', 'true');
		const channelSwitch = screen.getByRole('switch', { name: '推送通知' });
		expect(channelSwitch).toHaveAttribute('aria-checked', 'false');

		// 零匿名开关：每一个 switch 都拿得到非空可访问名
		for (const sw of screen.getAllByRole('switch')) {
			expect(sw).toHaveAccessibleName();
		}
	});

	it('AC-605：channels 往返（push 关→开）保存回读无回归，email 不受影响', async () => {
		h.prefsGet.mockResolvedValue(initialPrefs);
		const first = renderPage();
		await screen.findByText('通知偏好设置');

		const push = rowSwitch('推送通知');
		await waitFor(() => expect(push).toHaveAttribute('aria-checked', 'false'));
		fireEvent.click(push);
		expect(push).toHaveAttribute('aria-checked', 'true');

		fireEvent.click(screen.getByRole('button', { name: '保存偏好' }));
		await waitFor(() => expect(h.prefsPut).toHaveBeenCalledTimes(1));
		const [, body] = h.prefsPut.mock.calls[0] as [string, any];
		expect(body.pushEnabled).toBe(true);
		expect(body.channels.push.enabled).toBe(true);
		expect(body.emailEnabled).toBe(true);
		expect(body.channels.email.enabled).toBe(true);

		first.unmount();
		h.prefsGet.mockReset();
		h.prefsGet.mockResolvedValue({ channels: body.channels });
		renderPage();
		await screen.findByText('通知偏好设置');
		const push2 = rowSwitch('推送通知');
		await waitFor(() => expect(push2).toHaveAttribute('aria-checked', 'true'));
		expect(rowSwitch('邮件通知')).toHaveAttribute('aria-checked', 'true');
	});

	it('UP-77：SMS 渠道可管理——顶部 smsEnabled 覆盖读值 → 关闭保存 → smsEnabled=false 且 channels.sms 同集合', async () => {
		// 后端契约恒含 4 渠道；顶层 sms_enabled 为权威开关（channels.sms.enabled 同会话镜像）
		h.prefsGet.mockResolvedValue({ ...initialPrefs, smsEnabled: true });
		renderPage();
		await screen.findByText('通知偏好设置');

		const sms = rowSwitch('短信通知');
		await waitFor(() => expect(sms).toHaveAttribute('aria-checked', 'true'));
		fireEvent.click(sms);
		expect(sms).toHaveAttribute('aria-checked', 'false');

		fireEvent.click(screen.getByRole('button', { name: '保存偏好' }));
		await waitFor(() => expect(h.prefsPut).toHaveBeenCalledTimes(1));
		const [, body] = h.prefsPut.mock.calls[0] as [string, any];
		expect(body.smsEnabled).toBe(false);
		expect(body.channels.sms.enabled).toBe(false);
		expect([...body.channels.sms.types].sort()).toEqual([...ALL_TYPES].sort());
		// 其余渠道不受 SMS 关闭影响
		expect(body.channels.email.enabled).toBe(true);
		expect(body.channels.inApp.enabled).toBe(true);
	});
});
