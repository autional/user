'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@autional/shared';
import { useAnnouncements } from '@/hooks/queries';
import { formatTime } from '@/lib/format';
import { SectionCard, AppPageHeader, LoadingScreen } from '@autional/ui';
import { ErrorState } from '@autional/ui';
import { Megaphone, ChevronDown, ChevronRight, ChevronLeft, Eye, X } from 'lucide-react';

export default function AnnouncementsPage() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const userId = user?.id || '';
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	// UP-88：忽略需跨刷新持久化（旧实现纯内存 state，刷新/切页后公告复活）。
	// generated api 无用户面 dismiss 端点（dismissals 仅为公告聚合计数），以 per-user localStorage 兜底。
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());
	const pageSize = 10;
	const dismissStorageKey = `announcements-dismissed:${userId}`;

	useEffect(() => {
		if (!userId) {
			setDismissed(new Set());
			return;
		}
		try {
			const raw = localStorage.getItem(dismissStorageKey);
			const parsed: unknown = raw ? JSON.parse(raw) : null;
			setDismissed(new Set(Array.isArray(parsed) ? (parsed as string[]) : []));
		} catch {
			// 存储不可用/数据损坏：视为无忽略记录（本会话内仍可忽略）。
			setDismissed(new Set());
		}
	}, [dismissStorageKey, userId]);

	const { data, isLoading, error } = useAnnouncements({
		page,
		pageSize,
		status: 'published',
	});

	const list = (data as any)?.items || [];
	const total = (data as any)?.total || 0;
	const pagination = (data as any)?.pagination;

	const visibleList = list.filter((a: any) => !dismissed.has(a.id));

	const handleDismiss = (id: string) => {
		const next = new Set(dismissed);
		next.add(id);
		setDismissed(next);
		if (userId) {
			try {
				localStorage.setItem(dismissStorageKey, JSON.stringify([...next]));
			} catch {
				// 存储不可用（隐私模式）：忽略仅本会话生效。
			}
		}
		if (expandedId === id) setExpandedId(null);
	};

	if (isLoading) return <LoadingScreen message={t('announcements.loading')} />;
	if (error) return <ErrorState message={t('announcements.error')} className="min-h-[40vh]" />;

	return (
		<div className="space-y-6">
			<AppPageHeader
				title={t('announcements.title', 'Announcements')}
				description={t('announcements.description', 'Stay updated with the latest news and updates')}
			/>

			<div className="space-y-3">
				{visibleList.map((ann: any) => (
					<div
						key={ann.id}
						className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md"
					>
						{/* UP-87：此前外层整卡 button 内又嵌「忽略」button（HTML 非法，AT 行为不确定；
						    整卡可访问名 144 字符）。展开=透明覆盖 button（aria-label 取标题）；
						    忽略=平级 button 抬到其上。覆盖层只罩头部区，展开区控件不受影响。 */}
						<div className="relative">
							<button
								type="button"
								onClick={() => setExpandedId(expandedId === ann.id ? null : ann.id)}
								aria-expanded={expandedId === ann.id}
								aria-label={ann.title}
								className="absolute inset-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
							/>
							<div className="flex items-start gap-4 p-5">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
									<Megaphone size={20} />
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<h3 className="text-base font-semibold text-neutral-900">{ann.title}</h3>
										{ann.views != null && (
											<span className="flex items-center gap-1 text-xs text-neutral-600">
												<Eye size={12} />
												{ann.views}
											</span>
										)}
									</div>
									{expandedId !== ann.id && (
										<p className="mt-1 text-sm text-neutral-600 line-clamp-2">
											{ann.content?.slice(0, 200) ||
												t('announcements.noContentPreview', '(no content)')}
										</p>
									)}
									<div className="mt-2 flex items-center justify-between">
										<span className="text-xs text-neutral-600">
											{ann.publishAt
												? t('announcements.published', { date: formatTime(ann.publishAt) })
												: formatTime(ann.createdAt)}
										</span>
										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={() => handleDismiss(ann.id)}
												className="relative z-10 flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-600 transition-colors"
											>
												<X size={12} />
												{t('announcements.dismiss', 'Dismiss')}
											</button>
											<span className="text-xs text-neutral-600">
												{expandedId === ann.id ? (
													<ChevronDown size={14} className="text-neutral-500" />
												) : (
													<ChevronRight size={14} className="text-neutral-500" />
												)}
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>

						{expandedId === ann.id && (
							<div className="border-t border-neutral-100 px-5 py-4 bg-neutral-50">
								<div className="prose prose-sm max-w-none text-neutral-700 whitespace-pre-wrap">
									{ann.content || t('announcements.noContent', '(no content)')}
								</div>
								<div className="mt-4 flex flex-wrap items-center gap-2">
									{ann.targetRoles?.map((role: string) => (
										<span
											key={role}
											className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600"
										>
											{role}
										</span>
									))}
									{ann.expireAt && (
										<span className="text-xs text-neutral-600">
											{t('announcements.expiresAt', 'Expires:')} {formatTime(ann.expireAt)}
										</span>
									)}
								</div>
								<button
									onClick={() => handleDismiss(ann.id)}
									className="mt-3 text-sm font-medium text-primary-700 hover:text-primary-800"
								>
									{t('announcements.dismissAndClose', 'Dismiss')}
								</button>
							</div>
						)}
					</div>
				))}

				{visibleList.length === 0 && (
					<SectionCard
						padding="none"
						className="flex flex-col items-center justify-center text-center"
					>
						<Megaphone size={40} className="text-neutral-300" />
						<p className="mt-4 text-sm text-neutral-600">
							{t('announcements.empty', 'No announcements')}
						</p>
					</SectionCard>
				)}
			</div>

			{pagination && pagination.totalPages > 1 && (
				<SectionCard
					padding="sm"
					className="flex items-center justify-between"
				>
					<span className="text-sm text-neutral-600">
						{t('announcements.pageInfo', {
							page: pagination.page,
							totalPages: pagination.totalPages,
						})}
					</span>
					<div className="flex items-center gap-2">
						<button
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={!pagination.hasPrev}
							className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
						>
							<ChevronLeft size={14} /> {t('notifications.prev')}
						</button>
						<button
							onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
							disabled={!pagination.hasNext}
							className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
						>
							{t('notifications.next')}
							<ChevronRight size={14} />
						</button>
					</div>
				</SectionCard>
			)}
		</div>
	);
}
