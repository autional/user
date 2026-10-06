import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, ThemeProvider } from '@autional/ui';
// antd 桥：user 站此前是「0 处 import antd + 13 个手写 <table>」。接入是为了让那 13 个手写表
// 换成设计系统的 DataTable（否则各站表格长相必然分叉）。桥必须挂在 ThemeProvider 之内：
// 它读的是设计系统的主题状态。本步只接线、不引入任何 antd 组件，因此包体积增量就是这座桥的
// **下限成本**，先量出来再决定后续页面改造的顺序。
import { AntdThemeProvider } from '@autional/ui/antd';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './non-tenant-segments';
import './app/globals.css';
import './i18n';

registerSW({ immediate: true });

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

const root = document.getElementById('root');
if (root) {
	createRoot(root).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider storageKey="end-user-portal-theme">
					<AntdThemeProvider>
						<ToastProvider>
						{/* basename 恒为 "/"：所有导航链接经 buildNavHref 带 tenantSlug 绝对路径。
						    早期用 resolvePortalBasename() 动态 basename，SPA 导航后 pathname 变化
						    导致 basename 与链接重算不一致 → 侧边栏 slug 退化 + 双重前缀自锁（P1）。 */}
						<BrowserRouter basename="/">
							<App />
						</BrowserRouter>
					</ToastProvider>
					</AntdThemeProvider>
				</ThemeProvider>
			</QueryClientProvider>
		</StrictMode>,
	);
}
