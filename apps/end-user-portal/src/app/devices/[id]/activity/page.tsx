'use client';

import { useParams, useNavigate } from 'react-router';
import { useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { ROUTES } from '@/lib/routes';
import { useTranslation } from 'react-i18next';
import {
	Activity,
	ArrowLeft,
	History,
	Wifi,
	WifiOff,
	Shield,
	Key,
	RefreshCw,
} from 'lucide-react';
import { AppPageHeader, LoadingScreen, ErrorState, SectionCard } from '@autional/ui';

const mockEvents = [
	{
		id: '1',
		type: 'online',
		label: 'devices.activity.events.online',
		icon: Wifi,
		iconColor: 'text-success',
		time: '2026-06-09T10:30:00Z',
	},
	{
		id: '2',
		type: 'offline',
		label: 'devices.activity.events.offline',
		icon: WifiOff,
		iconColor: 'text-neutral-600',
		time: '2026-06-09T08:15:00Z',
	},
	{
		id: '3',
		type: 'firmware',
		label: 'devices.activity.events.firmware',
		icon: RefreshCw,
		iconColor: 'text-primary-500',
		time: '2026-06-08T22:00:00Z',
	},
	{
		id: '4',
		type: 'cert_rotated',
		label: 'devices.activity.events.certRotated',
		icon: Key,
		iconColor: 'text-amber-500',
		time: '2026-06-07T14:00:00Z',
	},
	{
		id: '5',
		type: 'policy_change',
		label: 'devices.activity.events.policyChange',
		icon: Shield,
		iconColor: 'text-info',
		time: '2026-06-06T09:00:00Z',
	},
];

function formatTime(iso: string, t: (k: string) => string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleString();
	} catch {
		return iso;
	}
}

export default function DeviceActivityPage() {
	const tenantSlug = useTenantSlug();
	const { t } = useTranslation();
	const { id: deviceId } = useParams<{ id: string }>();
	const navigate = useNavigate();

	const isLoading = false;
	const error = null;

	const showMock = false;

	if (isLoading) return <LoadingScreen message={t('devices.activity.loading')} />;

	if (error)
		return <ErrorState message={t('devices.activity.loadError')} className="min-h-[40vh]" />;

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<button
				onClick={() => navigate(buildNavHref(ROUTES.devices, tenantSlug))}
				className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-700 transition-colors"
			>
				<ArrowLeft size={14} />
				{t('devices.activity.back')}
			</button>

			<AppPageHeader
				title={t('devices.activity.title')}
				description={t('devices.activity.subtitle')}
			/>

			{deviceId && (
				<SectionCard padding="sm">
					<p className="text-xs font-medium text-neutral-600 uppercase tracking-wide">
						{t('devices.activity.deviceId')}
					</p>
					<p className="mt-1 text-sm font-mono text-neutral-700">{deviceId}</p>
				</SectionCard>
			)}

			<SectionCard padding="none">
				<div className="flex flex-col items-center justify-center py-16 px-6 text-center">
					<div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
						<History size={32} className="text-neutral-500" />
					</div>
					<h3 className="mt-5 text-base font-semibold text-neutral-700">
						{t('devices.activity.emptyTitle')}
					</h3>
					<p className="mt-2 max-w-md text-sm text-neutral-600 leading-relaxed">
						{t('devices.activity.emptyDesc')}
					</p>
					<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
						{[
							{ icon: Activity, label: t('devices.activity.features.connectDisconnect') },
							{ icon: RefreshCw, label: t('devices.activity.features.firmware') },
							{ icon: Shield, label: t('devices.activity.features.security') },
							{ icon: Key, label: t('devices.activity.features.credentials') },
						].map(({ icon: Icon, label }, i) => (
							<div
								key={i}
								className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600"
							>
								<Icon size={13} />
								<span>{label}</span>
							</div>
						))}
					</div>
				</div>
			</SectionCard>
		</div>
	);
}
