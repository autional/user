import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthService } from '@autional/shared';
import ProfilePage from './page';
import { queryKeys } from '@/hooks/queries';
import { TestWrapper } from '@/test/wrapper';
import { PortalChrome } from '@/test/portal-chrome';

// 与 wallet.stories.tsx 同一套做法：真组件 + 真实查询键 + 预置缓存，**不替换任何模块**。
// 老版本用 vi.mock 替换 useProfile / usePrivacy / useAuthStore —— 那会把 vitest 拖进浏览器包，
// Storybook 直接抛 customEqualityTesters，页面渲染不出来（计划 L4）。
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
			username: 'ZhangSan',
			email: 'zhangsan@example.com',
		} as never);
	}
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta: Meta<typeof ProfilePage> = {
	title: 'Pages/Profile',
	component: ProfilePage,
	parameters: { layout: 'fullscreen' },
	// 页面 story 一律套上真实外壳：外框归 AppShell，页面自己不再带内边距（第 28 轮）。
	decorators: [(Story) => (
		<PortalChrome>
			<Story />
		</PortalChrome>
	)],
};

export default meta;
type Story = StoryObj<typeof ProfilePage>;

const profileData = {
	id: 'user_001',
	username: 'ZhangSan',
	email: 'zhangsan@example.com',
	phone: '13800138000',
	status: 'active',
	avatarUrl: undefined,
	createdAt: '2026-01-15',
};
const privacyData = { showEmail: true, showPhone: false, profileVisibility: 'private' as const };

const seedNormal = (c: QueryClient) => {
	c.setQueryData(queryKeys.profile, profileData);
	c.setQueryData([...queryKeys.profile, 'privacy'], privacyData);
};

export const Loading: Story = {
	render: () => (
		<Seeded>
			<TestWrapper>
				<ProfilePage />
			</TestWrapper>
		</Seeded>
	),
};

export const Normal: Story = {
	render: () => (
		<Seeded seed={seedNormal}>
			<TestWrapper>
				<ProfilePage />
			</TestWrapper>
		</Seeded>
	),
};

export const Editing: Story = {
	render: () => (
		<Seeded seed={seedNormal}>
			<TestWrapper>
				<ProfilePage />
			</TestWrapper>
		</Seeded>
	),
};

// 错误态不预置缓存：Storybook 没有后端，真实请求失败 → 页面走真实错误路径。
export const Error: Story = {
	render: () => (
		<Seeded>
			<TestWrapper>
				<ProfilePage />
			</TestWrapper>
		</Seeded>
	),
};
