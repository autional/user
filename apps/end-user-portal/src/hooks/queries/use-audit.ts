import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { authMeAuditLogs } from '@autional/shared/generated/api';
import type { AuditLogItem } from './types';
import type { PageInfo } from './types';
import { queryKeys } from './query-keys';

// type（非 interface）以保证可赋给 queryKeys 的 Record<string, unknown>（TS 隐式索引签名规则）。
export type AuditLogsParams = {
	page?: number;
	pageSize?: number;
	startDate?: string;
	endDate?: string;
	action?: string;
	// Keyword 关键词检索（UP-100）：透传 identity → audit-service（IP/设备/详情全文项）。
	keyword?: string;
	// StatusClass 状态语义筛选（UP-26/UP-100）：success/failure 服务端跨页过滤；
	// 查询参数由共享客户端拦截器 snake_case 化（status_class）。
	statusClass?: string;
};

async function getAuditLogs(params?: AuditLogsParams): Promise<{
	items?: AuditLogItem[];
	total?: number;
	pagination?: PageInfo;
}> {
	return authMeAuditLogs(params) as Promise<{
		items?: AuditLogItem[];
		total?: number;
		pagination?: PageInfo;
	}>;
}

export function useAuditLogs(params?: AuditLogsParams): UseQueryResult<
	{ items?: AuditLogItem[]; total?: number; pagination?: PageInfo },
	Error
> {
	return useQuery<{ items?: AuditLogItem[]; total?: number; pagination?: PageInfo }, Error>({
		queryKey: queryKeys.auditLogs(params),
		queryFn: () => getAuditLogs(params),
		retry: 1,
	});
}
