import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryResult,
	type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth } from '@autional/shared';
import {
	notifications,
	notificationsReadByNotificationsPut,
	notificationsReadAllPut,
	notificationsByNotificationsDelete,
	notificationsPreferencesByPreferences,
	notificationsPreferencesByPreferencesPut,
	announcements,
} from '@autional/shared/generated/api';
import type { NotificationItem, AnnouncementItem } from './types';
import type { PaginatedList } from './types';
import { queryKeys, commQueryKeys } from './query-keys';

async function getNotifications(params?: {
	userId?: string;
	unreadOnly?: boolean;
	page?: number;
	pageSize?: number;
}): Promise<PaginatedList<NotificationItem>> {
	try {
		return notifications({
			unread_only: params?.unreadOnly || undefined,
			page: params?.page,
			page_size: params?.pageSize,
		}) as Promise<PaginatedList<NotificationItem>>;
	} catch {
		return {
			items: [],
			total: 0,
			pagination: {
				page: 1,
				pageSize: params?.pageSize || 10,
				total: 0,
				totalPages: 0,
				hasNext: false,
				hasPrev: false,
			},
		};
	}
}

async function getUnreadNotifications(_params?: { userId?: string }): Promise<NotificationItem[]> {
	try {
		// generated notificationsUnread() 不透传查询参数，后端契约要求 page/page_size
		// （UnreadNotificationsListQuery.Validate → ValidatePagination），故保留手写调用。
		const { apiClient } = await import('@autional/shared');
		const res = await apiClient.get('/notification/api/v1/notifications/unread', { // @generated-api-exempt
			params: { page: 1, page_size: 20 },
		});
		// 后端 ListResponse {code,items,total,...}：拦截器解包后 res.data 顶层即 items。
		const data = res.data as { items?: NotificationItem[] };
		return data?.items || [];
	} catch {
		return [];
	}
}

async function markNotificationRead(id: string) {
	await notificationsReadByNotificationsPut(id);
}

async function markAllNotificationsRead(_params?: { userId?: string }) {
	await notificationsReadAllPut();
}

async function deleteNotification(id: string) {
	await notificationsByNotificationsDelete(id, {});
}

export function useNotifications(params?: {
	page?: number;
	pageSize?: number;
	unreadOnly?: boolean;
}): UseQueryResult<PaginatedList<NotificationItem>, Error> {
	const { userId } = useAuth();
	return useQuery<PaginatedList<NotificationItem>, Error>({
		queryKey: queryKeys.notifications({ ...params, userId }),
		queryFn: () => getNotifications({ userId: userId || '', ...params }),
		retry: 1,
		enabled: !!userId,
	});
}

export function useUnreadNotifications(): UseQueryResult<NotificationItem[], Error> {
	const { userId } = useAuth();
	return useQuery<NotificationItem[], Error>({
		queryKey: queryKeys.unreadNotifications,
		queryFn: () => getUnreadNotifications({ userId: userId || '' }),
		retry: 1,
		enabled: !!userId,
	});
}

export function useMarkNotificationRead(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, string>({
		mutationFn: markNotificationRead,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['notifications'] });
		},
	});
}

export function useMarkAllNotificationsRead(): UseMutationResult<unknown, Error, void> {
	const qc = useQueryClient();
	const { userId } = useAuth();
	return useMutation<unknown, Error, void>({
		mutationFn: () => markAllNotificationsRead({ userId: userId || '' }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['notifications'] });
		},
	});
}

export function useDeleteNotification(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, string>({
		mutationFn: deleteNotification,
		onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
	});
}

interface NotificationPreferences {
	emailEnabled?: boolean;
	smsEnabled?: boolean;
	pushEnabled?: boolean;
	typePrefs?: Record<string, { enabled: boolean }>;
	channels?: Record<string, { enabled: boolean; types?: string[] }>;
}

async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
	return notificationsPreferencesByPreferences(userId) as Promise<NotificationPreferences>;
}

async function updateNotificationPreferences(
	userId: string,
	prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
	// 后端契约要求 body 含 user_id（NotificationPreferencesRequest.userId 必填）
	return notificationsPreferencesByPreferencesPut(
		userId,
		{ ...prefs, userId },
	) as Promise<NotificationPreferences>;
}

export function useNotificationPreferences(): UseQueryResult<NotificationPreferences, Error> {
	const { userId } = useAuth();
	return useQuery<NotificationPreferences, Error>({
		queryKey: ['notifications', 'preferences', userId],
		queryFn: () => getNotificationPreferences(userId || ''),
		enabled: !!userId,
		retry: 1,
	});
}

export function useUpdateNotificationPreferences(): UseMutationResult<
	NotificationPreferences,
	Error,
	NotificationPreferences
> {
	const qc = useQueryClient();
	const { userId } = useAuth();
	return useMutation<NotificationPreferences, Error, NotificationPreferences>({
		mutationFn: (prefs) => updateNotificationPreferences(userId || '', prefs),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', 'preferences', userId] }),
	});
}

async function getAnnouncements(params?: {
	page?: number;
	pageSize?: number;
	status?: string;
	search?: string;
}): Promise<PaginatedList<AnnouncementItem>> {
	return announcements({
		page: params?.page,
		page_size: params?.pageSize,
		status: params?.status,
		search: params?.search,
	}) as Promise<PaginatedList<AnnouncementItem>>;
}

export function useAnnouncements(params?: {
	page?: number;
	pageSize?: number;
	status?: string;
	search?: string;
}): UseQueryResult<PaginatedList<AnnouncementItem>, Error> {
	return useQuery<PaginatedList<AnnouncementItem>, Error>({
		queryKey: [...commQueryKeys.announcements, params],
		queryFn: () => getAnnouncements(params),
		retry: 1,
	});
}
