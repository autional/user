'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionCard, AppPageHeader, ErrorState, EmptyState } from '@autional/ui';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ShieldCheck, Award, FileSearch, ChevronRight } from 'lucide-react';
import { extractApiError } from '@autional/shared';
import { complianceProfile, complianceStatus } from '@autional/shared/generated/api';
import { cn } from '@/lib/utils';
import { isNotFoundError } from '@/lib/api-error';

export default function CompliancePage() {
	const { t } = useTranslation();
	const [profile, setProfile] = useState<any>(null);
	const [score, setScore] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [notFound, setNotFound] = useState(false);

	const fetchData = async () => {
		setLoading(true);
		setError('');
		setNotFound(false);
		try {
			const [profRes, scoreRes] = await Promise.all([complianceProfile(), complianceStatus()]);
			// apiClient 已解包 {code,data} 信封（再读取 .data 恒 undefined，UP-68 同族）：
			// profile 顶层即 ComplianceProfileResponse（enabledFrameworks/selectedStandards…）。
			setProfile((profRes as any) || null);
			// compliance/status 契约无 score 字段（overall_status/各合规位/计数），保持空态「—」；
			// 分数来源（dashboard metrics）无用户面路由，不越权调用管理面。
			setScore((scoreRes as any)?.overallScore ?? (scoreRes as any)?.score ?? null);
		} catch (err) {
			// P2-1: 404（资源不存在）→ 空态
			if (isNotFoundError(err)) {
				setNotFound(true);
			} else {
				setError(extractApiError(err, t('common.error')).message);
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, []);

	if (loading)
		return (
			<div className="max-w-4xl mx-auto space-y-6">
				<SkeletonCard />
				<SkeletonCard />
			</div>
		);

	if (notFound)
		return (
			<EmptyState
				title={t('compliance.empty', '暂无合规数据')}
				description={t('compliance.emptyDesc', '当前租户尚未配置合规标准')}
			/>
		);

	if (error) return <ErrorState message={error} onRetry={() => fetchData()} />;

	const scoreGrade =
		score != null
			? score >= 95
				? { label: 'A+', color: 'text-success-text', bar: 'bg-success' }
				: score >= 90
					? { label: 'A', color: 'text-success-text', bar: 'bg-success' }
					: score >= 80
						? { label: 'B', color: 'text-info-text', bar: 'bg-info' }
						: score >= 70
							? { label: 'C', color: 'text-warning-text', bar: 'bg-warning' }
							: { label: 'D', color: 'text-danger-text', bar: 'bg-danger' }
			: { label: '—', color: 'text-[var(--color-text-muted)]', bar: 'bg-muted' };

	const frameworks = profile?.enabledFrameworks || [];
	const standards = profile?.selectedStandards || [];
	const hasStandards = standards.length > 0;

	return (
		<div className="max-w-3xl mx-auto">
			<AppPageHeader
				title={
					<span className="flex items-center gap-2">
						<ShieldCheck className="h-5 w-5 text-[var(--color-brand)]" />
						{t('compliance.title', '组织合规状态')}
					</span>
				}
				description={t('compliance.subtitle', '了解您所在组织的合规标准遵守情况和评分')}
			/>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
				<SectionCard>
					<div className="flex items-center gap-3 mb-4">
						<Award className="w-5 h-5 text-[var(--color-brand)]" />
						<span className="font-medium">{t('compliance.score', '合规评分')}</span>
					</div>
					<div className="flex items-baseline gap-2">
						<span className={cn('text-4xl font-bold', scoreGrade.color)}>
							{score != null ? score : '—'}
						</span>
						{score != null && (
							<span className={cn('text-lg font-semibold', scoreGrade.color)}>
								{scoreGrade.label}
							</span>
						)}
					</div>
					<div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
						<div
							className={cn(
								'h-full rounded-full transition-all',
								scoreGrade.bar,
							)}
							style={{ width: `${Math.min(score || 0, 100)}%` }}
						/>
					</div>
				</SectionCard>

				<SectionCard>
					<div className="flex items-center gap-3 mb-4">
						<FileSearch className="w-5 h-5 text-[var(--color-brand)]" />
						<span className="font-medium">{t('compliance.standards', '遵守标准')}</span>
					</div>
					{hasStandards ? (
						<div className="space-y-2">
							{standards.map((s: string) => (
								<div key={s} className="flex items-center gap-2 text-sm">
									<ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]" />
									<span>{s}</span>
								</div>
							))}
						</div>
					) : (
						<p className="text-[var(--color-text-muted)] text-sm">
							{t('compliance.noStandards', '暂未选择特定合规标准')}
						</p>
					)}
				</SectionCard>
			</div>

			{frameworks.length > 0 && (
				<SectionCard>
					<h2 className="font-medium mb-3 flex items-center gap-2">
						<ShieldCheck className="w-4 h-4" />
						{t('compliance.enabledFrameworks', '已启用的合规框架')}
					</h2>
					<div className="flex flex-wrap gap-2">
						{frameworks.map((fw: string) => (
							<span
								key={fw}
								className="px-3 py-1 rounded-full bg-[var(--color-brand)]/10 text-[var(--color-brand)] text-sm font-medium"
							>
								{fw.toUpperCase()}
							</span>
						))}
					</div>
				</SectionCard>
			)}
		</div>
	);
}
