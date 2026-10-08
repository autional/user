'use client';
import { useState, useMemo } from 'react';
import {
	Monitor,
	MapPin,
	Clock,
	LogOut,
	Smartphone,
	Globe,
	ShieldCheck,
	ShieldAlert,
	ShieldOff,
	Shield,
	Filter,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { extractApiError } from '@autional/shared';
import {
	useSessions,
	useRevokeSession,
	useRevokeAllSessions,
	CURRENT_SESSION_UNRESOLVABLE,
} from '@/hooks/queries';
import type { SessionInfo } from '@/hooks/queries';
import { Alert, AppPageHeader, ErrorState, EmptyState, ConfirmDialog } from '@autional/ui';
import { SkeletonRow } from '@/components/ui/Skeleton';

function parseUserAgent(ua?: string): { browser: string; os: string } {
	if (!ua) return { browser: '', os: '' };
	let browser = '';
	let os = '';
	if (ua.includes('Chrome')) browser = 'Chrome';
	else if (ua.includes('Firefox')) browser = 'Firefox';
	else if (ua.includes('Safari')) browser = 'Safari';
	else if (ua.includes('Edge')) browser = 'Edge';
	if (ua.includes('Windows')) os = 'Windows';
	else if (ua.includes('Mac')) os = 'macOS';
	else if (ua.includes('Linux')) os = 'Linux';
	else if (ua.includes('Android')) os = 'Android';
	else if (ua.includes('iPhone') || ua.includes('iOS')) os = 'iOS';
	return { browser, os };
}

function getDeviceLabel(session: SessionInfo, t: (k: string) => string): string {
	const deviceType = session.deviceType || '';
	const ua = parseUserAgent(session.userAgent);
	if (deviceType) return deviceType;
	if (ua.browser && ua.os) return `${ua.browser} · ${ua.os}`;
	if (ua.browser) return ua.browser;
	if (ua.os) return ua.os;
	return t('sessions.unknownDevice');
}

function getTrustColor(score: number): string {
	if (score >= 80) return 'text-success bg-success-soft';
	if (score >= 50) return 'text-amber-600 bg-amber-50';
	if (score >= 30) return 'text-warning bg-warning-soft';
	return 'text-danger bg-danger-soft';
}

function getTrustIcon(score: number) {
	if (score >= 80) return <ShieldCheck size={14} />;
	if (score >= 50) return <Shield size={14} />;
	if (score >= 30) return <ShieldAlert size={14} />;
	return <ShieldOff size={14} />;
}

const PAGE_SIZE = 10;

export default function SessionsPage() {
	const { t } = useTranslation();
	const toast = useToast();
	const [highRiskOnly, setHighRiskOnly] = useState(false);
	const [page, setPage] = useState(1);
	// UP-39：单会话注销原无确认、revokeAll 用原生 confirm()。统一改组件化确认弹窗。
	const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
	const [revokeAllOpen, setRevokeAllOpen] = useState(false);

	const { data: sessions, isLoading, error } = useSessions(page, PAGE_SIZE);
	const revokeMutation = useRevokeSession();
	const revokeAllMutation = useRevokeAllSessions();

	// 成功才关弹窗；失败保留（toast 报错后可就地重试）。
	const handleRevokeConfirm = async () => {
		if (!revokeTarget) return;
		try {
			await revokeMutation.mutateAsync(revokeTarget.id);
			toast.success(t('sessions.revokeSuccess', '会话已注销'));
			setRevokeTarget(null);
		} catch (err: any) {
			toast.error(extractApiError(err, t('sessions.revokeError', '注销失败')).message);
		}
	};

	const handleRevokeAllConfirm = async () => {
		try {
			await revokeAllMutation.mutateAsync({ exceptCurrent: true });
			toast.success(t('sessions.revokeAllSuccess', '所有其他会话已注销'));
			setRevokeAllOpen(false);
		} catch (err: any) {
			// U353 守卫哨兵：当前会话无法唯一识别（历史令牌缺 sid 时列表全为 false）。
			// 操作已在 mutationFn 中止（否则会把当前会话一并删除），此处给出可读提示。
			if (err?.message === CURRENT_SESSION_UNRESOLVABLE) {
				setRevokeAllOpen(false);
				toast.error(
					t(
						'sessions.revokeAllUnresolvable',
						'无法识别当前会话，已中止操作以保护您的登录。请刷新页面后重试。',
					),
				);
				return;
			}
			toast.error(extractApiError(err, t('common.error')).message);
		}
	};

	const getTrustLabel = (score: number): string => {
		if (score >= 80) return t('sessions.trustHigh', '高');
		if (score >= 50) return t('sessions.trustMedium', '中');
		if (score >= 30) return t('sessions.trustLow', '低');
		return t('sessions.trustRisk', '风险');
	};

	const getTrustTooltip = (score: number): string => {
		return t('sessions.trustTooltip', '信任分数: 0-100，分数越高越可信').replace(
			'{score}',
			String(score),
		);
	};

	const rawList = sessions || [];
	const hasMore = rawList.length >= PAGE_SIZE;
	const sessionList = useMemo(() => {
		if (!highRiskOnly) return rawList;
		return rawList.filter((s) => (s as any).trustScore != null && (s as any).trustScore < 50);
	}, [rawList, highRiskOnly]);

	if (isLoading)
		return (
			<div className="space-y-4">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
		);
	if (error) return <ErrorState message={t('sessions.error')} className="min-h-[40vh]" />;

	return (
		<div className="space-y-6">
			<AppPageHeader
				title={t('sessions.title')}
				description={t('sessions.subtitle')}
				actions={
					<div className="flex items-center gap-3">
						<button
							onClick={() => setHighRiskOnly((v) => !v)}
							className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
								highRiskOnly
									? 'border-danger-soft bg-danger-soft text-danger'
									: 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
							}`}
						>
							<Filter size={14} />
							{highRiskOnly
								? t('sessions.showingHighRisk', '仅高风险')
								: t('sessions.filterHighRisk', '仅显示高风险会话')}
						</button>
						{rawList.length > 1 && (
							<button
								onClick={() => setRevokeAllOpen(true)}
								disabled={revokeAllMutation.isPending}
								className="rounded-md border border-danger/20 bg-danger/5 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
							>
								{revokeAllMutation.isPending ? t('common.loading') : t('sessions.revokeAll')}
							</button>
						)}
					</div>
				}
			/>

			{highRiskOnly && (
				<Alert
					variant="danger"
					className="text-sm"
				>
					{t('sessions.highRiskFilterActive', '已启用高风险过滤：仅显示信任分数低于 50 的会话')}
				</Alert>
			)}

			<div className="space-y-4">
			{sessionList.map((session) => {
				const trustScore = (session as any).trustScore as number | undefined;
				const ua = parseUserAgent(session.userAgent);
				return (
					<div
						key={session.id}
						className={`rounded-lg border p-5 shadow-sm ${
							session.isCurrentSession
								? 'border-primary-200 bg-primary-50/40'
								: 'border-neutral-200 bg-white'
						}`}
					>
						<div className="flex items-start justify-between gap-4">
							<div className="flex items-start gap-4">
								<div
									className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
										session.isCurrentSession
											? 'bg-primary-100 text-primary-700'
											: 'bg-neutral-100 text-neutral-600'
									}`}
								>
									{session.deviceType?.toLowerCase().includes('phone') ||
									session.deviceType?.toLowerCase().includes('mobile') ? (
										<Smartphone size={20} />
									) : (
										<Monitor size={20} />
									)}
								</div>
								<div>
									<div className="flex items-center gap-2">
										<h3 className="font-semibold text-neutral-900">
											{getDeviceLabel(session, t)}
										</h3>
										{session.isCurrentSession && (
											<span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
												{t('sessions.current')}
											</span>
										)}
									</div>
									<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
										{ua.browser && (
											<span className="flex items-center gap-1">
												<Globe size={14} />
												{ua.browser}
												{ua.os ? ` · ${ua.os}` : ''}
											</span>
										)}
										<span className="flex items-center gap-1">
											<MapPin size={14} />
											{session.geoip || t('sessions.unknownLocation')}
											{session.ip ? ` · ${session.ip}` : ''}
										</span>
										<span className="flex items-center gap-1">
											<Clock size={14} />
											{t('sessions.lastActive')}:{' '}
											{formatTime(session.lastActiveAt || session.createdAt)}
										</span>
									</div>
								</div>
							</div>

							<div className="flex items-center gap-3">
								{trustScore != null && (
									<span
										title={getTrustTooltip(trustScore)}
										className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold cursor-help ${getTrustColor(trustScore)}`}
									>
										{getTrustIcon(trustScore)}
										{getTrustLabel(trustScore)} {trustScore}
									</span>
								)}
								{!session.isCurrentSession && (
										<button
											onClick={() => setRevokeTarget(session)}
											disabled={revokeMutation.isPending}
											className="flex shrink-0 items-center gap-1 rounded-md border border-danger/20 bg-danger/5 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
										>
											<LogOut size={14} />
											{t('sessions.revoke')}
										</button>
									)}
								</div>
							</div>
						</div>
					);
				})}

				{sessionList.length === 0 && (
					<EmptyState
						title={
							highRiskOnly
								? t('sessions.noHighRisk', 'No high risk sessions')
								: t('sessions.empty', 'No sessions')
						}
						description={
							highRiskOnly ? '' : t('sessions.emptyDesc', 'Your active sessions will appear here.')
						}
					/>
				)}
			</div>

			{rawList.length > 0 && (
				<div className="flex items-center justify-center gap-3 pt-4">
					<button
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						disabled={page === 1}
						className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{t('common.previous', 'Previous')}
					</button>
					<span className="text-sm text-neutral-600">{page}</span>
					<button
						onClick={() => setPage((p) => p + 1)}
						disabled={!hasMore}
						className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{t('common.next', 'Next')}
					</button>
				</div>
			)}

			<ConfirmDialog
				open={revokeTarget !== null}
				title={t('sessions.revokeConfirmTitle', '注销该会话')}
				description={t(
					'sessions.revokeConfirmDesc',
					'该设备将被退出登录，需要重新认证才能访问账户。',
				)}
				variant="danger"
				confirmText={t('sessions.revoke', '注销')}
				onConfirm={handleRevokeConfirm}
				onCancel={() => setRevokeTarget(null)}
			/>
			<ConfirmDialog
				open={revokeAllOpen}
				title={t('sessions.revokeAllConfirmTitle', '注销所有其他会话')}
				description={t(
					'sessions.revokeAllConfirm',
					'确定要注销所有其他设备的会话吗？当前会话不受影响。',
				)}
				variant="danger"
				confirmText={t('sessions.revokeAll', '注销其他设备')}
				onConfirm={handleRevokeAllConfirm}
				onCancel={() => setRevokeAllOpen(false)}
			/>
		</div>
	);
}
