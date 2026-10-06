import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryResult,
	type UseMutationResult,
} from '@tanstack/react-query';
import {
	communicationLogs,
	communicationPushTokens,
	communicationPushTokensPost,
	communicationPushTokensByPushTokensDelete,
} from '@autional/shared/generated/api';
import type { CommunicationLogItem, PushTokenItem } from './types';
import type { PaginatedList } from './types';
import { commQueryKeys } from './query-keys';

async function getCommunicationLogs(params?: {
	page?: number;
	pageSize?: number;
	channel?: string;
	status?: string;
}): Promise<PaginatedList<CommunicationLogItem>> {
	return communicationLogs(params) as Promise<PaginatedList<CommunicationLogItem>>;
}

async function getCommunicationPushTokens(params?: {
	page?: number;
	pageSize?: number;
	platform?: string;
}): Promise<PaginatedList<PushTokenItem>> {
	return communicationPushTokens(params) as Promise<PaginatedList<PushTokenItem>>;
}

async function postCommunicationPushToken(data: {
	token: string;
	platform: string;
	deviceId?: string;
	userId: string;
}): Promise<PushTokenItem> {
	return communicationPushTokensPost(data) as Promise<PushTokenItem>;
}

async function deleteCommunicationPushToken(id: string): Promise<void> {
	await communicationPushTokensByPushTokensDelete(id);
}

export function useCommunicationLogs(params?: {
	page?: number;
	pageSize?: number;
	channel?: string;
	status?: string;
}): UseQueryResult<PaginatedList<CommunicationLogItem>, Error> {
	return useQuery<PaginatedList<CommunicationLogItem>, Error>({
		queryKey: [...commQueryKeys.logs, params],
		queryFn: () => getCommunicationLogs(params),
		retry: 1,
	});
}

export function useCommunicationPushTokens(params?: {
	page?: number;
	pageSize?: number;
	platform?: string;
}): UseQueryResult<PaginatedList<PushTokenItem>, Error> {
	return useQuery<PaginatedList<PushTokenItem>, Error>({
		queryKey: [...commQueryKeys.pushTokens, params],
		queryFn: () => getCommunicationPushTokens(params),
		retry: 1,
	});
}

export function useRegisterPushToken(): UseMutationResult<
	PushTokenItem,
	Error,
	{ token: string; platform: string; deviceId?: string; userId: string }
> {
	const qc = useQueryClient();
	return useMutation<
		PushTokenItem,
		Error,
		{ token: string; platform: string; deviceId?: string; userId: string }
	>({
		mutationFn: (data) => postCommunicationPushToken(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: commQueryKeys.pushTokens });
		},
	});
}

export function useDeletePushToken(): UseMutationResult<void, Error, string> {
	const qc = useQueryClient();
	return useMutation<void, Error, string>({
		mutationFn: deleteCommunicationPushToken,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: commQueryKeys.pushTokens });
		},
	});
}
