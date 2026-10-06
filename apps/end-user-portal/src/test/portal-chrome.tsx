import { AppShell } from '@autional/ui';

// PortalChrome —— 页面级 story 的取景框：把页面放进**真实的外壳**里再截图。
//
// 为什么必须有它（第 28 轮）：外框（沟槽 + 内容面）已经归 AppShell 所有，页面自己不再带内边距。
// 于是「把页面单独渲染」不再是一个能在生产里出现的取景 —— 页面内容会贴着视口边缘，
// 而真实运行时它是被外壳的内容面包住的。视觉回归与对比度两道闸门读的都是这些页面 story，
// 基线若量的是那种取景，量到的就不是产品（第 26 轮记过同一类错：闸门在量空气）。
//
// 这里给的是**占位**品牌 / 导航 / 右上角：真实的那三样要 router、鉴权与查询上下文（那是 AppLayout 的事）。
// 它的用途是让基线量到**外框几何**（沟槽宽度、内容面的圆角与内边距、顶栏高度），不是量导航内容。
export function PortalChrome({ children }: { children: React.ReactNode }) {
	return (
		<AppShell
			brand={<span className="truncate text-lg font-bold">Acme</span>}
			nav={
				<nav className="flex flex-col gap-1 p-4 text-sm">
					{['概览', '账单', '钱包', '安全'].map((label, i) => (
						<span
							key={label}
							className={`rounded-md px-3 py-2 ${i === 0 ? 'bg-primary-50 text-primary-700' : 'text-neutral-600'}`}
						>
							{label}
						</span>
					))}
				</nav>
			}
			headerRight={<span className="text-sm text-neutral-600">Story 取景框</span>}
		>
			{children}
		</AppShell>
	);
}
