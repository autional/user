import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthService } from '@autional/shared';
import SecurityPage from './page';
import { queryKeys } from '@/hooks/queries';
import { TestWrapper } from '@/test/wrapper';
import { PortalChrome } from '@/test/portal-chrome';
import { userEvent, within } from '@storybook/test';

// 与 wallet.stories.tsx 同一套做法：真组件 + 真实查询键 + 预置缓存，**不替换任何模块**。
// 老版本用 vi.mock 替换 shared / @/hooks/queries / use-toast —— vitest 被拖进浏览器包，
// Storybook 抛 customEqualityTesters，页面渲染不出来（计划 L4）。
const USER_ID = 'test-user-001';

function Seeded({ seed, children }: { seed?: (c: QueryClient) => void; children: React.ReactNode }) {
	const [client] = useState(() => {
		const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		seed?.(c);
		return c;
	});
	if (AuthService.getUser()?.id !== USER_ID) {
		AuthService.setAuth('story-access-token', 'story-refresh-token', {
			id: USER_ID,
			username: 'story-user',
			email: 'story@example.com',
		} as never);
	}
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta: Meta<typeof SecurityPage> = {
	title: 'Pages/Security',
	component: SecurityPage,
	parameters: { layout: 'fullscreen' },
	// 页面 story 一律套上真实外壳：外框归 AppShell，页面自己不再带内边距（第 28 轮）。
	decorators: [(Story) => (
		<PortalChrome>
			<Story />
		</PortalChrome>
	)],
};

export default meta;
type Story = StoryObj<typeof SecurityPage>;

const mfaStatusData = {
	methods: ['totp', 'passkey'],
	totpEnabled: true,
	smsEnabled: false,
	emailEnabled: false,
};
const passkeysData = [
	{ id: 'pk_001', name: 'MacBook Touch ID', authenticatorAttachment: 'platform', createdAt: '2026-05-01', backupState: false, userVerified: true },
	{ id: 'pk_002', name: 'YubiKey 5C', authenticatorAttachment: 'cross-platform', createdAt: '2026-04-15', backupState: false, userVerified: true },
];
const oauthConnectionsData = [
	{ id: 'oc_001', providerId: 'google', profileData: { email: 'test@gmail.com' }, createdAt: '2026-05-15' },
	{ id: 'oc_002', providerId: 'github', profileData: { email: 'dev@github.com' }, createdAt: '2026-03-20' },
];

const seedNormal = (c: QueryClient) => {
	c.setQueryData(queryKeys.mfa(USER_ID), mfaStatusData);
	c.setQueryData(queryKeys.passkeys, passkeysData);
	c.setQueryData(queryKeys.oauthConnections(USER_ID), oauthConnectionsData);
};

const page = (seed?: (c: QueryClient) => void) => (
	<Seeded seed={seed}>
		<TestWrapper>
			<SecurityPage />
		</TestWrapper>
	</Seeded>
);

export const Loading: Story = { render: () => page() };
export const Normal: Story = { render: () => page(seedNormal) };

export const PasswordChange: Story = {
	render: () => page(seedNormal),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByText('修改密码'));
	},
};

export const DeleteAccount: Story = {
	render: () => page(seedNormal),
};
