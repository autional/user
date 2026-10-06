'use client';
import { ROUTES } from '@/lib/routes';
import { buildNavHref } from '@/lib/nav';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useAuth, useTenantSlug } from '@autional/shared';
import { profilesPrivacyImpactByProfiles } from '@autional/shared/generated/api';
import { SectionCard, ConsolePageHeader, LoadingScreen } from '@autional/ui';
import { ErrorState, EmptyState, StatusBadge } from '@autional/ui';
import type { StatusVariant } from '@autional/ui';
import { DataTable } from '@autional/ui/antd';
import type { DataTableColumns } from '@autional/ui/antd';
import {
	Eye,
	EyeOff,
	Shield,
	AlertTriangle,
	CheckCircle2,
	Info,
	ArrowRight,
	Users,
	Globe,
	Lock,
} from 'lucide-react';

interface PrivacyImpactResponse {
	riskFactors?: number;
	riskLevel?: string;
	riskScore?: number;
	recommendations?: string[];
	userId?: string;
}

async function fetchPrivacyImpact(userId: string): Promise<PrivacyImpactResponse> {
	// 拦截器已解包信封，返回值即 payload（响应键已 camelCase）。
	const res = (await profilesPrivacyImpactByProfiles(userId)) as PrivacyImpactResponse | null;
	return res || {};
}

interface FieldExposure {
	field: string;
	label: string;
	visibleTo: string;
	audience: string;
	riskLevel: 'low' | 'medium' | 'high';
}

const RISK_COLORS = {
	low: {
		bg: 'bg-success-soft',
		text: 'text-success',
		border: 'border-success-soft',
		icon: CheckCircle2,
	},
	medium: {
		bg: 'bg-amber-50',
		text: 'text-amber-700',
		border: 'border-amber-200',
		icon: AlertTriangle,
	},
	high: { bg: 'bg-danger-soft', text: 'text-danger', border: 'border-danger-soft', icon: AlertTriangle },
};

const RISK_BAR_COLORS = {
	low: 'bg-success',
	medium: 'bg-amber-500',
	high: 'bg-danger',
};

// 服务端风险等级值域为 low_risk/medium_risk/high_risk（service-profile），历史接口为裸等级。
// 统一归一后再查配色与文案表，未知值落中性档（UP-10）。
function normalizeRiskLevel(level?: string): 'low' | 'medium' | 'high' | 'unknown' {
	const v = (level || '').trim().toLowerCase().replace(/_risk$/, '');
	if (v === 'low' || v === 'medium' || v === 'high') return v;
	return 'unknown';
}

// 风险等级 → 设计系统徽标档位。只做映射，配色归设计系统（-soft/-text 是成对的、做过对比度验证）。
// 表格里的风险徽标原来是 emerald/amber/rose 三套裸色阶拼出来的圆角 span：配色写在业务侧，
// 而且 rose-50 / rose-700 这一对并没有做过对比度验证（深色模式下底色的生成规则也不一样）。
const RISK_STATUS_VARIANTS: Record<string, StatusVariant> = {
	low: 'success',
	medium: 'warning',
	high: 'danger',
};

// 后端 recommendations 为英文原文（service-profile profile_service.go）且不随 Accept-Language 变化；
// 按原文映射本地化键，未收录原文透传（服务端新增建议时不致断裂）。
const RECOMMENDATION_KEYS: Record<string, string> = {
	'too many custom fields; consider periodically cleaning up unnecessary personal data to reduce leak risk':
		'privacyImpact.rec.tooManyFields',
	'moderate number of custom fields; evaluate the necessity of each field':
		'privacyImpact.rec.moderateFields',
	'profile visibility is public; change to contacts-only or private to reduce privacy risk':
		'privacyImpact.rec.publicVisibility',
	'email address is publicly visible; disable this option': 'privacyImpact.rec.emailVisible',
	'phone number is publicly visible; disable this option': 'privacyImpact.rec.phoneVisible',
	'location info is publicly visible; enable only when necessary': 'privacyImpact.rec.locationVisible',
	'profile is archived; data processing is suspended, risk is low': 'privacyImpact.rec.archived',
	'profile is fairly complete; more sensitive fields increase risk; fill in only necessary information':
		'privacyImpact.rec.fairlyComplete',
	'current privacy configuration is good; review privacy settings periodically':
		'privacyImpact.rec.configGood',
};

const AUDIENCE_ICONS: Record<string, typeof Globe> = {
	public: Globe,
	contacts: Users,
	private: Lock,
};

export default function PrivacyImpactPage() {
	const tenantSlug = useTenantSlug();

	const { t } = useTranslation();
	const { user } = useAuth();
	const userId = user?.id || '';

	const {
		data: impact,
		isLoading,
		error,
	} = useQuery<PrivacyImpactResponse, Error>({
		queryKey: ['privacy-impact', userId],
		queryFn: () => fetchPrivacyImpact(userId),
		enabled: !!userId,
		retry: 1,
	});

	const fieldExposures: FieldExposure[] = [
		{
			field: 'email',
			label: t('privacyImpact.fields.email'),
			visibleTo: t('privacyImpact.audiences.public'),
			audience: 'public',
			riskLevel: 'medium',
		},
		{
			field: 'phone',
			label: t('privacyImpact.fields.phone'),
			visibleTo: t('privacyImpact.audiences.private'),
			audience: 'private',
			riskLevel: 'low',
		},
		{
			field: 'username',
			label: t('privacyImpact.fields.username'),
			visibleTo: t('privacyImpact.audiences.public'),
			audience: 'public',
			riskLevel: 'low',
		},
		{
			field: 'department',
			label: t('privacyImpact.fields.department'),
			visibleTo: t('privacyImpact.audiences.contacts'),
			audience: 'contacts',
			riskLevel: 'medium',
		},
		{
			field: 'location',
			label: t('privacyImpact.fields.location'),
			visibleTo: t('privacyImpact.audiences.contacts'),
			audience: 'contacts',
			riskLevel: 'high',
		},
	];

	const getRiskBarWidth = (score: number) => Math.min(Math.max(score, 0), 100);

	const getRiskLabel = (level?: string) => {
		const map: Record<string, string> = {
			low: t('privacyImpact.riskLow'),
			medium: t('privacyImpact.riskMedium'),
			high: t('privacyImpact.riskHigh'),
		};
		return map[normalizeRiskLevel(level)] || t('privacyImpact.riskUnknown', '未知风险');
	};

	// P1-5：userId 未就绪时不等 query（避免无限 loading）
	if (!userId) {
		return (
			<EmptyState
				title={t('privacyImpact.notAvailable', '隐私影响评估暂不可用')}
				description={t('privacyImpact.notAvailableDesc', '暂无法计算隐私影响评分，请稍后重试')}
			/>
		);
	}

	if (isLoading) return <LoadingScreen message={t('privacyImpact.loading')} />;
	if (error) {
		// P1-5：404（资源不存在）→ 空态而非错误态；其他错误 → 错误态
		const status = (error as { response?: { status?: number } })?.response?.status;
		if (status === 404) {
			return (
				<EmptyState
					title={t('privacyImpact.notAvailable', '隐私影响评估暂不可用')}
					description={t('privacyImpact.notAvailableDesc', '暂无法计算隐私影响评分，请稍后重试')}
				/>
			);
		}
		return <ErrorState message={t('privacyImpact.error')} className="min-h-[40vh]" />;
	}

	const riskScore = impact?.riskScore ?? 0;
	// 字段缺失维持原有「按 low 呈现」行为；值域内但未识别的枚举落中性档。
	const riskLevel = impact?.riskLevel ? normalizeRiskLevel(impact.riskLevel) : 'low';

	// 列定义：只描述**这一页有哪些列**。表头底色 / 悬浮态 / 边框 / 行高，
	// 由设计系统下发的组件级令牌决定 —— 与其它 portal 的数据表吃的是同一份令牌。
	const columns: DataTableColumns<FieldExposure> = [
		{
			title: t('privacyImpact.field'),
			dataIndex: 'label',
			key: 'field',
			// 高风险字段配闭眼图标：这一列表达的本来就是「这个字段对外暴露到什么程度」，图标随语义保留
			render: (_: unknown, field: FieldExposure) => (
				<div className="flex items-center gap-3">
					{field.riskLevel === 'high' ? (
						<EyeOff size={16} className="text-danger" />
					) : (
						<Eye size={16} className="text-neutral-500" />
					)}
					<span className="font-medium text-neutral-900">{field.label}</span>
				</div>
			),
		},
		{
			title: t('privacyImpact.visibleTo'),
			dataIndex: 'visibleTo',
			key: 'visibleTo',
			render: (v: string, field: FieldExposure) => {
				const AudienceIcon = AUDIENCE_ICONS[field.audience] || Globe;
				return (
					<div className="flex items-center gap-2">
						<AudienceIcon size={14} className="text-neutral-500" />
						<span className="text-neutral-600">{v}</span>
					</div>
				);
			},
		},
		{
			title: t('privacyImpact.riskLevel'),
			dataIndex: 'riskLevel',
			key: 'riskLevel',
			render: (_: unknown, field: FieldExposure) => {
				// 图标取自原来的 RISK_COLORS（低=对勾 / 中高=警告三角），配色改由 StatusBadge 下发
				const Icon = RISK_COLORS[field.riskLevel].icon;
				return (
					<StatusBadge variant={RISK_STATUS_VARIANTS[field.riskLevel] || 'neutral'}>
						<Icon size={12} />
						{getRiskLabel(field.riskLevel)}
					</StatusBadge>
				);
			},
		},
	];

	return (
		<div className="space-y-6">
			<ConsolePageHeader
				title={t('privacyImpact.title')}
				description={t('privacyImpact.subtitle')}
			/>

			{/* Risk Score Card */}
			<SectionCard>
				<div className="flex items-start gap-4">
					<div
						className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${RISK_COLORS[riskLevel]?.bg || 'bg-neutral-50'} ${RISK_COLORS[riskLevel]?.text || 'text-neutral-600'}`}
					>
						<Shield size={24} />
					</div>
					<div className="flex-1">
						<h3 className="text-lg font-semibold text-neutral-900">
							{t('privacyImpact.riskScore')}
						</h3>
						<div className="mt-2 flex items-center gap-3">
							<div className="flex-1">
								<div
									role="progressbar"
									aria-valuenow={riskScore}
									aria-valuemin={0}
									aria-valuemax={100}
									aria-label={t('privacyImpact.riskScore')}
									className="h-3 w-full rounded-full bg-neutral-200 overflow-hidden"
								>
									<div
										className={`h-full rounded-full transition-all ${RISK_BAR_COLORS[riskLevel] || 'bg-neutral-400'}`}
										style={{ width: `${getRiskBarWidth(riskScore)}%` }}
									/>
								</div>
							</div>
							<span className="text-lg font-bold text-neutral-900">{riskScore}/100</span>
						</div>
						<p className="mt-1 text-sm">
							<span className={`font-semibold ${RISK_COLORS[riskLevel]?.text || ''}`}>
								{getRiskLabel(riskLevel)}
							</span>
							{impact?.riskFactors ? (
								<span className="ml-2 text-neutral-600">
									{t('privacyImpact.riskFactors', { count: impact.riskFactors })}
								</span>
							) : null}
						</p>
					</div>
				</div>
			</SectionCard>

			{/* Field Exposure Table */}
			<SectionCard padding="none">
				<div className="border-b border-neutral-200 px-6 py-4">
					<h3 className="text-lg font-semibold text-neutral-900">
						{t('privacyImpact.fieldExposure')}
					</h3>
					<p className="mt-1 text-sm text-neutral-600">{t('privacyImpact.fieldExposureDesc')}</p>
				</div>

				{/* 外面那层 overflow-x-auto 由 DataTable 自带容器接管；卡片和标题是表外内容，保留 */}
				<DataTable<FieldExposure>
					rowKey={(field) => field.field}
					columns={columns}
					dataSource={fieldExposures}
					scroll={{ x: 'max-content' }}
					pagination={false}
				/>
			</SectionCard>

			{/* Recommendations */}
			{impact?.recommendations && impact.recommendations.length > 0 && (
				<div className="rounded-lg border border-info-soft bg-info-soft p-6">
					<div className="flex items-start gap-3">
						<Info size={20} className="text-info shrink-0 mt-0.5" />
						<div>
							<h3 className="text-sm font-semibold text-info-text">
								{t('privacyImpact.recommendations')}
							</h3>
							<ul className="mt-2 list-inside list-disc space-y-1">
								{impact.recommendations.map((rec, idx) => (
									<li key={idx} className="text-sm text-info-text">
										{RECOMMENDATION_KEYS[rec] ? t(RECOMMENDATION_KEYS[rec]) : rec}
									</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			)}

			{/* Link to Privacy Settings */}
			<SectionCard>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-50 text-primary-700">
							<Shield size={20} />
						</div>
						<div>
							<h3 className="font-semibold text-neutral-900">
								{t('privacyImpact.manageSettings')}
							</h3>
							<p className="text-sm text-neutral-600">{t('privacyImpact.manageSettingsDesc')}</p>
						</div>
					</div>
					<Link
						to={buildNavHref(ROUTES.profile, tenantSlug)}
						className="flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800 transition-colors"
					>
						{t('privacyImpact.goToSettings')}
						<ArrowRight size={14} />
					</Link>
				</div>
			</SectionCard>
		</div>
	);
}
