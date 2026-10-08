'use client';
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { ROUTES } from '@/lib/routes';
import { useTranslation } from 'react-i18next';
import {
	CheckCircle2,
	Circle,
	ArrowRight,
	ChevronRight,
	Compass,
	ShieldCheck,
	UserCircle,
	Smartphone,
	SlidersHorizontal,
	EyeOff,
	RotateCcw,
} from 'lucide-react';
import { useMFAStatus, useProfile, useDevices, useNotificationPreferences } from '@/hooks/queries';
import { Alert, SectionCard, AppPageHeader, LoadingScreen } from '@autional/ui';

const STORAGE_KEY = 'autional_onboarding_completed';
const STEPS_KEY = 'autional_onboarding_steps';
const SKIP_KEY = 'autional_onboarding_skipped';

function loadStepsCompleted(): Record<string, boolean> {
	try {
		const raw = localStorage.getItem(STEPS_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function saveStepsCompleted(steps: Record<string, boolean>) {
	try {
		localStorage.setItem(STEPS_KEY, JSON.stringify(steps));
	} catch {
		// localStorage 不可用时静默忽略
	}
}

function clearOnboarding() {
	try {
		localStorage.removeItem(STORAGE_KEY);
		localStorage.removeItem(STEPS_KEY);
		localStorage.removeItem(SKIP_KEY);
	} catch {
		// localStorage 不可用时静默忽略
	}
}

interface Step {
	key: string;
	labelKey: string;
	link: string;
	icon: typeof ShieldCheck;
	check: () => boolean;
}

export default function OnboardingPage() {
	const tenantSlug = useTenantSlug();
	const { t } = useTranslation();
	const navigate = useNavigate();

	const { data: mfaStatus, isLoading: mfaLoading } = useMFAStatus();
	const { data: profile, isLoading: profileLoading } = useProfile();
	const { data: devices, isLoading: devicesLoading } = useDevices();
	const { data: notifPrefs } = useNotificationPreferences();

	const [prevCompleted, setPrevCompleted] = useState(loadStepsCompleted);

	const mfaEnabled =
		mfaStatus?.totpEnabled ||
		mfaStatus?.smsEnabled ||
		mfaStatus?.emailEnabled ||
		(mfaStatus?.methods?.length ?? 0) > 0;
	const profileComplete = !!(profile?.username || profile?.email);
	const devicesConfigured = (devices?.items?.length ?? 0) > 0;

	const preferencesConfigured = !!(
		notifPrefs &&
		(notifPrefs.emailEnabled !== undefined || notifPrefs.pushEnabled !== undefined)
	);

	const steps: Step[] = [
		{
			key: 'mfa',
			labelKey: 'onboarding.stepMFA',
			link: buildNavHref(ROUTES.security, tenantSlug),
			icon: ShieldCheck,
			check: () => mfaEnabled,
		},
		{
			key: 'profile',
			labelKey: 'onboarding.stepProfile',
			link: buildNavHref(ROUTES.profile, tenantSlug),
			icon: UserCircle,
			check: () => profileComplete,
		},
		{
			key: 'devices',
			labelKey: 'onboarding.stepDevices',
			link: buildNavHref(ROUTES.devices, tenantSlug),
			icon: Smartphone,
			check: () => devicesConfigured,
		},
		{
			key: 'preferences',
			labelKey: 'onboarding.stepPreferences',
			link: buildNavHref(ROUTES.notificationPrefs, tenantSlug),
			icon: SlidersHorizontal,
			check: () => preferencesConfigured,
		},
		// P2-4: dashboard 是"开始使用"入口而非待办步骤，从进度计算中移除
	];

	const mergedCompleted = useMemo(
		() =>
			steps.reduce(
				(acc, step) => ({ ...acc, [step.key]: step.check() || prevCompleted[step.key] }),
				{} as Record<string, boolean>,
			),
		[steps, prevCompleted, mfaEnabled, profileComplete, devicesConfigured, preferencesConfigured],
	);

	useEffect(() => {
		saveStepsCompleted(mergedCompleted);
	}, [mergedCompleted]);

	const completedKeys = Object.keys(mergedCompleted).filter((k) => mergedCompleted[k]);
	const completedCount = completedKeys.length;
	const totalSteps = steps.length;
	const progressPercent = Math.round((completedCount / totalSteps) * 100);
	const allDone = completedCount === totalSteps;

	const [dismissed, setDismissed] = useState(false);

	const handleDismiss = () => {
		setDismissed(true);
		localStorage.setItem(SKIP_KEY, '1');
	};

	const handleSkip = () => {
		localStorage.setItem(STORAGE_KEY, '1');
		saveStepsCompleted(mergedCompleted);
		navigate(buildNavHref(ROUTES.dashboard, tenantSlug));
	};

	const handleComplete = () => {
		localStorage.setItem(STORAGE_KEY, '1');
		saveStepsCompleted(mergedCompleted);
		navigate(buildNavHref(ROUTES.dashboard, tenantSlug));
	};

	const handleReset = () => {
		clearOnboarding();
		setPrevCompleted({});
		setDismissed(false);
	};

	if (mfaLoading || profileLoading || devicesLoading) {
		return <LoadingScreen message={t('common.loading')} className="min-h-[60vh]" />;
	}

	return (
		<div className="mx-auto max-w-2xl space-y-8">
			<AppPageHeader
				title={
					<span className="flex items-center gap-2">
						<Compass className="h-5 w-5 text-primary-600" />
						{t('onboarding.title', '欢迎来到 Autional！')}
					</span>
				}
				description={t('onboarding.subtitle', '完成以下步骤以开始使用')}
			/>

			{/* Progress bar */}
			<SectionCard>
				<div className="flex items-center justify-between mb-3">
					<span className="text-sm font-medium text-neutral-700">
						{t('onboarding.progress', { completed: completedCount, total: totalSteps })}
					</span>
					<span className="text-sm font-semibold text-primary-700">{progressPercent}%</span>
				</div>
				<div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
					<div
						className="h-full rounded-full bg-primary-500 transition-all duration-500"
						style={{ width: `${progressPercent}%` }}
					/>
				</div>
				{/* Step dots */}
				<div className="mt-3 flex items-center justify-between px-1">
					{steps.map((step) => (
						<span
							key={step.key}
							title={t(step.labelKey)}
							className={`inline-block h-2 w-2 rounded-full ${mergedCompleted[step.key] ? 'bg-success' : 'bg-neutral-300'}`}
						/>
					))}
				</div>
			</SectionCard>

			{/* Steps */}
			<SectionCard
				padding="none"
				className="divide-y divide-neutral-100"
			>
				{steps.map((step) => {
					const done = mergedCompleted[step.key];
					const Icon = step.icon;
					return (
						<Link
							key={step.key}
							to={step.link}
							className="flex items-center gap-4 p-4 hover:bg-neutral-50 transition-colors group"
						>
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 group-hover:bg-primary-50 transition-colors">
								<Icon size={20} className={done ? 'text-success-text' : 'text-neutral-500'} />
							</div>
							<div className="flex-1 min-w-0">
								<p
									className={`text-sm font-medium ${done ? 'text-neutral-600' : 'text-neutral-900'}`}
								>
									{t(step.labelKey)}
								</p>
							</div>
							<div className="flex items-center gap-2">
								{done ? (
									<CheckCircle2 size={20} className="text-success" />
								) : (
									<Circle size={20} className="text-neutral-300" />
								)}
								<ChevronRight size={16} className="text-neutral-500" />
							</div>
						</Link>
					);
				})}
			</SectionCard>

			{/* Dismiss banner - "不再显示" */}
			{!dismissed && !allDone && (
				<Alert variant="warning">
					<p className="text-sm text-amber-700">
						{t('onboarding.dismissHint', '完成入驻设置后可不再显示此引导')}
					</p>
					<button
						onClick={handleDismiss}
						className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
					>
						<EyeOff size={14} />
						{t('onboarding.dismiss', '不再显示')}
					</button>
				</Alert>
			)}

			{/* Reset - "重新开始入驻" */}
			<div className="border-t border-neutral-200 pt-4">
				<button
					onClick={handleReset}
					className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-600 transition-colors"
				>
					<RotateCcw size={14} />
					{t('onboarding.reset', '重新开始入驻')}
				</button>
			</div>

			{/* Action buttons */}
			<div className="flex items-center justify-between">
				{!allDone && (
					<button
						onClick={handleSkip}
						className="text-sm font-medium text-neutral-600 hover:text-neutral-700 transition-colors"
					>
						{t('onboarding.skip', '跳过引导')}
					</button>
				)}
				{allDone && (
					<button
						onClick={handleComplete}
						className="flex items-center gap-2 rounded-md bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
					>
						<CheckCircle2 size={16} />
						{t('onboarding.done', '开始使用')}
						<ArrowRight size={16} />
					</button>
				)}
			</div>
		</div>
	);
}
