'use client';
import { useState } from 'react';
import { useAuth, extractApiError } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import {
	CheckCheck,
	ShieldCheck,
	CreditCard,
	Info,
	AlertTriangle,
	Megaphone,
	ChevronLeft,
	ChevronRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/format';
import {
	useNotifications,
	useMarkNotificationRead,
	useMarkAllNotificationsRead,
} from '@/hooks/queries';
import { SectionCard, AppPageHeader, ErrorState, EmptyState } from '@autional/ui';
import { SkeletonRow } from '@/components/ui/Skeleton';

export default function NotificationsPage() {
	const { t } = useTranslation();
	const toast = useToast();
	const { user } = useAuth();
	const userId = user?.id || '';

	const [page, setPage] = useState(1);
	const pageSize = 10;

	const { data, isLoading, error } = useNotifications({ page, pageSize });
	const markReadMutation = useMarkNotificationRead();
	const markAllMutation = useMarkAllNotificationsRead();

	const list = data?.items || [];
	const total = data?.total || 0;
	const pagination = data?.pagination;
	const unreadCount = list.filter((n) => !n.isRead).length;

	const typeMeta: Record<string, { icon: typeof Info; color: string; bg: string; label: string }> =
		{
			system: {
				icon: Info,
				color: 'text-info',
				bg: 'bg-info-soft',
				label: t('notifications.type.system'),
			},
			security: {
				icon: ShieldCheck,
				color: 'text-success',
				bg: 'bg-success-soft',
				label: t('notifications.type.security'),
			},
			billing: {
				icon: CreditCard,
				color: 'text-warning-text',
				bg: 'bg-warning-soft',
				label: t('notifications.type.billing'),
			},
			activity: {
				icon: AlertTriangle,
				color: 'text-danger',
				bg: 'bg-danger-soft',
				label: t('notifications.type.activity'),
			},
			account: {
				icon: Info,
				color: 'text-primary-900',
				bg: 'bg-chart-7/10',
				label: t('notifications.type.account'),
			},
			marketing: {
				icon: Info,
				color: 'text-primary-900',
				bg: 'bg-chart-4/10',
				label: t('notifications.type.marketing'),
			},
			// 公告类通知：服务端发布公告时创建的通知 type = "announcement"（announcement_service.go）。
			announcement: {
				icon: Megaphone,
				color: 'text-info',
				bg: 'bg-info-soft',
				label: t('notifications.type.announcement'),
			},
			// 未知 type 的中性兜底：原来是回退到 system（把公告类误标成「系统」）。
			other: {
				icon: Info,
				color: 'text-neutral-600',
				bg: 'bg-neutral-100',
				label: t('notifications.type.other'),
			},
		};

	const handleMarkRead = async (id: string) => {
		try {
			await markReadMutation.mutateAsync(id);
			toast.success(t('notifications.markedRead', '已标记为已读'));
		} catch (err: any) {
			toast.error(extractApiError(err, t('common.error')).message);
		}
	};

	const handleMarkAllRead = async () => {
		try {
			await markAllMutation.mutateAsync();
			toast.success(t('notifications.allMarked', '全部已读'));
		} catch (err: any) {
			toast.error(extractApiError(err, t('common.error')).message);
		}
	};

	if (isLoading)
		return (
			<div className="space-y-3">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
		);
	if (error) return <ErrorState message={t('notifications.error')} className="min-h-[40vh]" />;

	return (
		<div className="space-y-6">
			<AppPageHeader
				title={t('notifications.title')}
				description={
					<>
						{unreadCount > 0
							? t('notifications.unreadCount', { count: unreadCount })
							: t('notifications.noUnread')}
						{total > 0 && ` · ${t('notifications.totalCount', { total })}`}
					</>
				}
				actions={
					<>
						{unreadCount > 0 && (
							<button
								onClick={handleMarkAllRead}
								disabled={markAllMutation.isPending}
								className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
							>
								<CheckCheck size={14} />
								{markAllMutation.isPending ? t('common.loading') : t('notifications.markAllRead')}
							</button>
						)}
					</>
				}
			/>

			<div className="space-y-3">
				{list.map((n) => {
					// 未知 type 走中性兜底（other），不再误标为「系统」（UP-72）。
					const meta = typeMeta[n.type || ''] || typeMeta.other;
					const Icon = meta.icon;

					return (
						<div
							key={n.id}
							className={`rounded-lg border p-4 shadow-card transition-colors ${
								n.isRead ? 'border-neutral-200 bg-white opacity-75' : 'border-neutral-200 bg-white'
							}`}
						>
							<div className="flex items-start gap-3">
								<div
									className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${meta.bg} ${meta.color}`}
								>
									<Icon size={18} />
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<h3
											className={`text-sm font-semibold ${n.isRead ? 'text-neutral-600' : 'text-neutral-900'}`}
										>
											{n.title}
										</h3>
										{!n.isRead && (
											<span className="inline-block h-2 w-2 rounded-full bg-primary-500" />
										)}
										<span
											className={`rounded-xs px-1.5 py-0.5 text-xs font-medium ${meta.bg} ${meta.color}`}
										>
											{meta.label}
										</span>
									</div>
									<p className="mt-1 text-sm text-neutral-600">{n.content}</p>
									<div className="mt-2 flex items-center justify-between">
										<span className="text-xs text-neutral-600">{formatTime(n.createdAt)}</span>
										{!n.isRead && (
											<button
												onClick={() => handleMarkRead(n.id)}
												disabled={markReadMutation.isPending}
												className="text-xs font-medium text-primary-700 hover:text-primary-800 disabled:opacity-50"
											>
												{t('notifications.markRead')}
											</button>
										)}
									</div>
								</div>
							</div>
						</div>
					);
				})}

				{list.length === 0 && (
					<EmptyState
						title={t('notifications.empty', 'No notifications')}
						description={t('notifications.emptyDesc', "You're all caught up!")}
					/>
				)}
			</div>

			{/* Pagination */}
			{pagination && pagination.totalPages > 1 && (
				<SectionCard
					padding="sm"
					className="flex items-center justify-between"
				>
					<span className="text-sm text-neutral-600">
						{t('notifications.pageInfo', {
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
