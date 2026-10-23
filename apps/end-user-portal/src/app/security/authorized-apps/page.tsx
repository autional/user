'use client';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Info, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { extractApiError } from '@autional/shared';
import { Alert, AppPageHeader, EmptyState, ErrorState, LoadingScreen, Modal, SectionCard, showToast } from '@autional/ui';
import { useAuthorizedApps, useRevokeAuthorizedApp } from '@/hooks/queries';
import type { AuthorizedAppItem } from '@/hooks/queries/types';
import { safeExternalUrl } from '@/lib/safe-url';

/**
 * 已授权应用（OAuth consent 自助页）。
 *
 * 与 `security/linked-accounts`（第三方登录绑定）和 `profile/consents`（资料字段授权）
 * 刻意分开：本页回答的是「哪些应用被授权访问我的账号、什么时候授权的、怎么撤销」。
 *
 * 数据：GET /oauth/consents（按 当前用户 + 当前租户）；撤销：DELETE /oauth/consents/{id}
 * （服务端同时删该客户端的 access/refresh token，应用需重新授权）。
 */

const KNOWN_SCOPES = new Set([
	'openid',
	'profile',
	'email',
	'phone',
	'address',
	'offline_access',
]);

export default function AuthorizedAppsPage() {
	const { t, i18n } = useTranslation();
	const { data: apps = [], isLoading, error } = useAuthorizedApps();
	const revokeMutation = useRevokeAuthorizedApp();
	const [revoking, setRevoking] = useState<AuthorizedAppItem | null>(null);

	const scopeLabel = (scope: string): string =>
		KNOWN_SCOPES.has(scope) ? t(`authorizedApps.scope.${scope}`) : scope;

	const items = useMemo(
		() =>
			[...apps].sort((a, b) => {
				// 最近授权在前；无时间的排最后（旧数据）。
				const ta = a.grantedAt ? Date.parse(a.grantedAt) : 0;
				const tb = b.grantedAt ? Date.parse(b.grantedAt) : 0;
				return tb - ta;
			}),
		[apps],
	);

	if (isLoading) return <LoadingScreen message={t('authorizedApps.loading')} />;
	if (error) return <ErrorState message={t('authorizedApps.error')} className="min-h-[40vh]" />;

	const confirmRevoke = () => {
		if (!revoking?.id) return;
		revokeMutation.mutate(revoking.id, {
			onSuccess: () => {
				setRevoking(null);
				showToast(t('authorizedApps.revokeSuccess'), 'success');
			},
			onError: (err) => {
				showToast(extractApiError(err, t('authorizedApps.revokeError')).message, 'error');
			},
		});
	};

	return (
		<div className="space-y-6">
			<AppPageHeader
				title={t('authorizedApps.title')}
				description={t('authorizedApps.subtitle')}
			/>

			<Alert variant="info">
				<div className="flex items-start gap-3">
					<Info size={20} className="mt-0.5 shrink-0 text-info" />
					<div>
						<p className="text-sm font-medium text-info-text">{t('authorizedApps.infoTitle')}</p>
						<p className="mt-1 text-sm text-info-text">{t('authorizedApps.infoDesc')}</p>
					</div>
				</div>
			</Alert>

			<SectionCard padding="none">
				<div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
					<h3 className="text-sm font-semibold text-neutral-700">
						{t('authorizedApps.listTitle')}
					</h3>
					<span className="text-xs text-neutral-600">
						{t('authorizedApps.count', { count: items.length })}
					</span>
				</div>

				{items.length === 0 ? (
					<div className="px-6 py-10">
						<EmptyState
							title={t('authorizedApps.empty')}
							description={t('authorizedApps.emptyDesc')}
						/>
					</div>
				) : (
					<ul className="divide-y divide-neutral-100">
						{items.map((app) => {
							const website = safeExternalUrl(app.website);
							const logo = safeExternalUrl(app.logoUri);
							// 显示名优先级：简称（metadata.alias）→ 全名 → client_id。
							// 与 auth 仪表盘磁贴同一口径（同一份 wire 字段）。
							const name = app.alias || app.clientName || app.clientId || t('authorizedApps.unknownApp');
							const scopes = (app.scopes || '').split(/\s+/).filter(Boolean);
							return (
								<li
									key={app.id}
									className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="flex min-w-0 items-start gap-3">
										{logo ? (
											<img
												src={logo}
												alt=""
												aria-hidden="true"
												loading="lazy"
												referrerPolicy="no-referrer"
												className="h-10 w-10 shrink-0 rounded-md border border-neutral-100 object-contain"
											/>
										) : (
											<span
												aria-hidden="true"
												className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-sm font-semibold text-primary-700"
											>
												{name.trim().charAt(0).toUpperCase() || '?'}
											</span>
										)}
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<h4 className="truncate text-sm font-medium text-neutral-900">{name}</h4>
												<span className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-text">
													<ShieldCheck size={10} />
													{t('authorizedApps.granted')}
												</span>
											</div>
											<p className="mt-0.5 truncate font-mono text-xs text-neutral-500">
												{app.clientId}
											</p>
											<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
												{app.grantedAt && (
													<span>
														{t('authorizedApps.grantedAt')}
														{new Date(app.grantedAt).toLocaleDateString(i18n.language)}
													</span>
												)}
												{scopes.length > 0 && (
													<span className="flex flex-wrap items-center gap-1">
														<span>{t('authorizedApps.scopes')}</span>
														{scopes.map((scope) => (
															<span
																key={scope}
																className="rounded-xs border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px]"
															>
																{scopeLabel(scope)}
															</span>
														))}
													</span>
												)}
											</div>
										</div>
									</div>

									<div className="flex shrink-0 items-center gap-2 sm:pl-4">
										{website ? (
											<a
												href={website}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-secondary)]"
											>
												<ExternalLink size={12} />
												{t('authorizedApps.openApp')}
											</a>
										) : null}
										<button
											type="button"
											onClick={() => setRevoking(app)}
											className="inline-flex items-center gap-1 rounded-md border border-danger-soft bg-white px-2.5 py-1.5 text-xs font-medium text-danger-text transition-colors hover:bg-danger-soft"
										>
											<Trash2 size={12} />
											{t('authorizedApps.revoke')}
										</button>									</div>
								</li>
							);
						})}
					</ul>
				)}
			</SectionCard>

			<Modal
				open={!!revoking}
				onClose={() => (revokeMutation.isPending ? undefined : setRevoking(null))}
				title={t('authorizedApps.revokeConfirmTitle')}
				description={t('authorizedApps.revokeConfirmDesc', {
					name: revoking?.clientName || revoking?.clientId || '',
				})}
				maxWidth="sm"
				footer={
					<>
						<button
							type="button"
							onClick={() => setRevoking(null)}
							disabled={revokeMutation.isPending}
							className="rounded-md border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
						>
							{t('authorizedApps.cancel')}
						</button>
						<button
							type="button"
							onClick={confirmRevoke}
							disabled={revokeMutation.isPending}
							className="inline-flex items-center gap-1.5 rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger disabled:opacity-60"
						>
							{revokeMutation.isPending && <Loader2 size={14} className="animate-spin" />}
							{revokeMutation.isPending
								? t('authorizedApps.revoking')
								: t('authorizedApps.confirmRevoke')}
						</button>
					</>
				}
			>
				<div className="space-y-2">
					<p className="text-sm text-neutral-700">{t('authorizedApps.revokeHint')}</p>
				</div>
			</Modal>
		</div>
	);
}
