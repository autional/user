import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { ThemeProvider, ToastProvider } from '@autional/ui';
import { AntdThemeProvider } from '@autional/ui/antd';
import i18n from '@/i18n';

// 测试中强制使用中文，避免 navigator 语言检测导致断言失败
i18n.changeLanguage('zh-CN');

// 这层包装必须与 src/main.tsx 的 Provider 栈一致。
// 少一层 AntdThemeProvider 的后果实测得到：antd 组件会走**出厂配色**，
// 于是测试与 Storybook 里看到的样子和生产不是同一个东西 ——
// 那种「测试全绿但线上不是一个样」的差距，正是这一层要消灭的。
//
// 2026-10-04 补 ToastProvider（同样是「与 main.tsx 对齐」这一条）：
// 页面级 story 此前用 vi.mock 把 useToast 换掉了，于是**没有任何东西发现这里少了一层**；
// 把那层 mock 拆掉之后，profile / security 两个 story 立刻报
// 「useToast must be used within <ToastProvider>」—— mock 遮住的是一个真实缺口。
// initialEntries（2026-10-05 补）：外壳级 story 需要一条**深链**才能渲染出生产的取景
// ——导航选中态、面包屑、活动路由都由 URL 决定，停在 '/' 量到的不是产品。
// 刻意**不**在 story 里再套一层 MemoryRouter：react-router 7 会直接抛
// 「You cannot render a <Router> inside another <Router>」（实测踩到，整页只剩这条错误）。
export function TestWrapper({
	children,
	initialEntries,
}: {
	children: React.ReactNode;
	initialEntries?: string[];
}) {
	return (
		<MemoryRouter initialEntries={initialEntries}>
			<I18nextProvider i18n={i18n}>
				<ThemeProvider storageKey="end-user-portal-test-theme">
					<AntdThemeProvider>
						<ToastProvider>{children}</ToastProvider>
					</AntdThemeProvider>
				</ThemeProvider>
			</I18nextProvider>
		</MemoryRouter>
	);
}
