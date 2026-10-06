'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, extractApiError } from '@autional/shared';
import {
	authMeRoleActivations,
	authMeRoleActivationsPost,
} from '@autional/shared/generated/api';
import { useToast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/format';
import { Alert, SectionCard, ConsolePageHeader, LoadingScreen } from '@autional/ui';
import { ErrorState } from '@autional/ui';
import { StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import {
	ShieldCheck,
	Clock,
	AlertCircle,
	CheckCircle2,
	XCircle,
	Plus,
	X,
	Loader2,
} from 'lucide-react';

// 状态 → 设计系统徽标档位。只做映射，配色归设计系统（-soft/-text 是成对的、做过对比度验证）。
// 档位照搬原表的语义色：emerald→success、amber→warning、neutral→neutral、rose→danger。
const STATUS_VARIANTS: Record<string, StatusVariant> = {
	active: 'success',
	pending: 'warning',
	expired: 'neutral',
	revoked: 'danger',
};

interface RoleActivation {
	id: string;
	tenantId: string;
	userId: string;
	roleId: string;
	roleName?: string;
	status: string;
	justification: string;
	activatedAt: string;
	expireAt: string;
	revokedAt?: string;
	createdAt: string;
}

interface RoleItem {
	id: string;
	name: string;
	code: string;
	description?: string;
}

async function fetchRoleActivations(): Promise<RoleActivation[]> {
	// 2026-08-17 修复：authMeRoleActivations 经拦截器解包为数组本身，
	// 原 `data?.data || []` 对数组取 .data 恒 undefined → 列表恒空（即便有激活记录）
	const data = (await authMeRoleActivations()) as RoleActivation[];
	return Array.isArray(data) ? data : [];
}

async function fetchAvailableRoles(): Promise<RoleItem[]> {
	// TODO: No generated function for GET /auth/me/role-activations/available-roles — missing from api.ts
	// 同页 cancelActivation 先例：未生成端点走 apiClient 直连。admin 级 /rbac/api/v1/admin/roles 对
	// 租户角色恒 403 entry_plane_forbidden（UP-20），且 catch 吞错会把失败渲染成空白下拉。
	const { apiClient: api } = await import('@autional/shared');
	const res = await api.get('/identity/api/v1/auth/me/role-activations/available-roles'); // @generated-api-exempt
	const data = res.data as RoleItem[];
	return Array.isArray(data) ? data : [];
}

async function requestActivation(data: {
	role_id: string;
	justification: string;
	duration: string;
}): Promise<unknown> {
	return authMeRoleActivationsPost(data as any);
}

async function cancelActivation(activationId: string): Promise<void> {
	// TODO: No generated function for DELETE /auth/me/role-activations/:id — authMeRoleActivationsByIdDelete missing from api.ts
	const { apiClient: api } = await import('@autional/shared');
	await api.delete(`/identity/api/v1/auth/me/role-activations/${activationId}`); // @generated-api-exempt
}

export default function RoleActivationsPage() {
	const { t } = useTranslation();
	const toast = useToast();
	const qc = useQueryClient();
	const { user } = useAuth();
	const userId = user?.id || '';

	const {
		data: activations,
		isLoading,
		error,
	} = useQuery<RoleActivation[], Error>({
		queryKey: ['role-activations', userId],
		queryFn: fetchRoleActivations,
		enabled: !!userId,
		retry: 1,
	});

	const {
		data: roles,
		isLoading: rolesLoading,
		error: rolesError,
		refetch: refetchRoles,
	} = useQuery<RoleItem[], Error>({
		queryKey: ['available-roles'],
		queryFn: fetchAvailableRoles,
		retry: 1,
		staleTime: 5 * 60 * 1000,
	});

	const requestMutation = useMutation<
		unknown,
		Error,
		{ role_id: string; justification: string; duration: string }
	>({
		mutationFn: requestActivation,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['role-activations', userId] });
			toast.success(t('roleActivations.requestSuccess'));
			setShowForm(false);
			setForm({ role_id: '', justification: '', duration: '1h' });
		},
		onError: (err) => {
			toast.error(extractApiError(err, t('roleActivations.requestError')).message);
		},
	});

	const cancelMutation = useMutation<unknown, Error, string>({
		mutationFn: cancelActivation,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['role-activations', userId] });
			toast.success(t('roleActivations.cancelSuccess'));
		},
		onError: (err) => {
			toast.error(extractApiError(err, t('roleActivations.cancelError')).message);
		},
	});

	const [showForm, setShowForm] = useState(false);
	const [form, setForm] = useState({ role_id: '', justification: '', duration: '1h' });

	const durationOptions = [
		{ value: '15m', label: t('roleActivations.duration15m') },
		{ value: '30m', label: t('roleActivations.duration30m') },
		{ value: '1h', label: t('roleActivations.duration1h') },
		{ value: '4h', label: t('roleActivations.duration4h') },
		{ value: '8h', label: t('roleActivations.duration8h') },
		{ value: '12h', label: t('roleActivations.duration12h') },
		{ value: '24h', label: t('roleActivations.duration24h') },
	];

	const getStatusBadge = (status: string) => {
		const map: Record<string, { icon: typeof Clock; label: string }> = {
			active: { icon: CheckCircle2, label: t('roleActivations.statusActive') },
			pending: { icon: Clock, label: t('roleActivations.statusPending') },
			expired: { icon: XCircle, label: t('roleActivations.statusExpired') },
			revoked: { icon: XCircle, label: t('roleActivations.statusRevoked') },
		};
		// 未知状态原来也落到「中性灰 + 显示原始 status」，这个兜底行为保持不变。
		const meta = map[status] || { icon: AlertCircle, label: status };
		const Icon = meta.icon;
		return (
			<StatusBadge variant={STATUS_VARIANTS[status] || 'neutral'}>
				<Icon size={12} />
				{meta.label}
			</StatusBadge>
		);
	};

	const getRoleName = (roleId: string) => {
		const role = roles?.find((r) => r.id === roleId);
		return role?.name || role?.code || roleId;
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.role_id || !form.justification) {
			toast.error(t('roleActivations.fillAll'));
			return;
		}
		requestMutation.mutate(form);
	};

	const isExpired = (expireAt: string) => new Date(expireAt) < new Date();

	if (isLoading) return <LoadingScreen message={t('roleActivations.loading')} />;
	if (error) return <ErrorState message={t('roleActivations.error')} className="min-h-[40vh]" />;

	// 列定义：只描述**这一页有哪些列**；表头底色 / 悬浮态 / 边框 / 行高由设计系统的组件级令牌下发。
	const columns: DataTableColumns<RoleActivation> = [
		{
			title: t('roleActivations.role'),
			dataIndex: 'roleId',
			key: 'roleId',
			render: (v: string) => <span className="font-medium">{getRoleName(v)}</span>,
		},
		{
			title: t('roleActivations.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => getStatusBadge(v),
		},
		{
			title: t('roleActivations.justificationCol'),
			dataIndex: 'justification',
			key: 'justification',
			render: (v: string) => (
				<span className="inline-block max-w-[200px] truncate" title={v}>
					{v}
				</span>
			),
		},
		{
			title: t('roleActivations.expireAt'),
			dataIndex: 'expireAt',
			key: 'expireAt',
			render: (v: string, item: RoleActivation) => (
				<span className="whitespace-nowrap">
					{formatTime(v)}
					{item.status === 'active' && isExpired(v) && (
						<span className="ml-2 text-xs text-danger-text">{t('roleActivations.expired')}</span>
					)}
				</span>
			),
		},
		{
			title: t('roleActivations.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => <span className="text-xs">{formatTime(v)}</span>,
		},
		{
			title: t('roleActivations.actions'),
			key: 'actions',
			align: 'right',
			render: (_: unknown, item: RoleActivation) =>
				(item.status === 'active' || item.status === 'pending') && (
					<button
						onClick={() => {
							if (confirm(t('roleActivations.cancelConfirm')))
								cancelMutation.mutate(item.id);
						}}
						disabled={cancelMutation.isPending}
						className="text-sm text-danger hover:underline disabled:opacity-50"
					>
						{t('roleActivations.cancel')}
					</button>
				),
		},
	];

	return (
		<div className="space-y-6">
			<ConsolePageHeader
				title={t('roleActivations.title')}
				description={t('roleActivations.subtitle')}
				actions={
					<button
						onClick={() => setShowForm(!showForm)}
						className="flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
					>
						<Plus size={16} />
						{t('roleActivations.requestButton')}
					</button>
				}
			/>

			{/* Request Form */}
			{showForm && (
				<SectionCard>
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-lg font-semibold text-neutral-900">
							{t('roleActivations.requestTitle')}
						</h3>
						<button
							onClick={() => setShowForm(false)}
							aria-label={t('common.close', '关闭')}
							className="text-neutral-600 hover:text-neutral-600"
						>
							<X size={20} />
						</button>
					</div>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<label
								htmlFor="role-activation-role"
								className="block text-sm font-medium text-neutral-700"
							>
								{t('roleActivations.selectRole')}
							</label>
							{rolesError ? (
								// 显式失败态：不再把错误吞成空白下拉；保留重试入口。
								<div className="mt-1 rounded-md border border-danger-soft bg-danger-soft p-3 text-sm text-danger-text">
									<p>{t('roleActivations.rolesLoadError')}</p>
									<button
										type="button"
										onClick={() => refetchRoles()}
										className="mt-2 font-medium text-danger underline hover:no-underline"
									>
										{t('roleActivations.rolesRetry')}
									</button>
								</div>
							) : rolesLoading ? (
								<p className="mt-1 text-sm text-neutral-600">{t('roleActivations.rolesLoading')}</p>
							) : roles && roles.length > 0 ? (
								<select
									id="role-activation-role"
									value={form.role_id}
									onChange={(e) => setForm({ ...form, role_id: e.target.value })}
									className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								>
									<option value="">{t('roleActivations.selectRolePlaceholder')}</option>
									{roles.map((role) => (
										<option key={role.id} value={role.id}>
											{role.name || role.code} {role.description ? `(${role.description})` : ''}
										</option>
									))}
								</select>
							) : (
								<p className="mt-1 text-sm text-neutral-600">{t('roleActivations.rolesEmpty')}</p>
							)}
						</div>

						<div>
							<label
								htmlFor="role-activation-duration"
								className="block text-sm font-medium text-neutral-700"
							>
								{t('roleActivations.duration')}
							</label>
							<select
								id="role-activation-duration"
								value={form.duration}
								onChange={(e) => setForm({ ...form, duration: e.target.value })}
								className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							>
								{durationOptions.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</div>

						<div>
							<label
								htmlFor="role-activation-justification"
								className="block text-sm font-medium text-neutral-700"
							>
								{t('roleActivations.justification')}
							</label>
							<textarea
								id="role-activation-justification"
								value={form.justification}
								onChange={(e) => setForm({ ...form, justification: e.target.value })}
								rows={3}
								placeholder={t('roleActivations.justificationPlaceholder')}
								className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
							/>
						</div>

						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setShowForm(false)}
								className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
							>
								{t('common.cancel')}
							</button>
							<button
								type="submit"
								disabled={requestMutation.isPending}
								className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
							>
								{requestMutation.isPending ? (
									<span className="flex items-center gap-1">
										<Loader2 size={14} className="animate-spin" />
										{t('roleActivations.submitting')}
									</span>
								) : (
									t('roleActivations.submit')
								)}
							</button>
						</div>
					</form>
				</SectionCard>
			)}

			{/* Info banner */}
			<Alert variant="info">
				<div className="flex items-start gap-3">
					<AlertCircle size={20} className="text-info shrink-0 mt-0.5" />
					<div>
						<p className="text-sm font-medium text-info-text">{t('roleActivations.infoTitle')}</p>
						<p className="mt-1 text-sm text-info-text">{t('roleActivations.infoDesc')}</p>
					</div>
				</div>
			</Alert>

			{/* Activations List */}
			{/* 列定义只描述「这一页有哪些列」；表头 / 悬浮态 / 边框 / 行高由设计系统的组件级令牌下发。 */}
			{/* 原来空列表时不是表体里的占位 <tr>，而是表格外的一整块（图标 + 文案 + 「发起申请」按钮），
			    而且激活列表本身没有翻页；这两点分别是 emptyText 与 pagination={false}。 */}
			<DataTable<RoleActivation>
				rowKey={(r) => r.id}
				columns={columns}
				dataSource={activations || []}
				scroll={{ x: 'max-content' }}
				pagination={false}
				locale={{
					emptyText: (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<ShieldCheck size={40} className="text-neutral-300" />
							<p className="mt-4 text-sm text-neutral-600">{t('roleActivations.empty')}</p>
							<button
								onClick={() => setShowForm(true)}
								className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800"
							>
								<Plus size={14} />
								{t('roleActivations.requestFirst')}
							</button>
						</div>
					),
				}}
			/>
		</div>
	);
}
