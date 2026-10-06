'use client';
import { ROUTES } from '@/lib/routes';
import { buildNavHref } from '@/lib/nav';
import { useTenantSlug } from '@autional/shared';
import { Link } from 'react-router';
import {
	Smartphone,
	Monitor,
	Clock,
	Wifi,
	WifiOff,
	Watch,
	Speaker,
	Laptop,
	Tablet,
	Tv,
	Router,
	Plus,
	Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/lib/format';
import { useThingsList } from '@/hooks/queries';
import { SectionCard, ConsolePageHeader, ErrorState } from '@autional/ui';
import { SkeletonCard } from '@/components/ui/Skeleton';

const thingIcons: Record<string, typeof Smartphone> = {
	smartphone: Smartphone,
	phone: Smartphone,
	tablet: Tablet,
	laptop: Laptop,
	desktop: Monitor,
	tv: Tv,
	watch: Watch,
	speaker: Speaker,
	router: Router,
};

function getThingIcon(type?: string) {
	const key = (type || '').toLowerCase();
	const match = Object.keys(thingIcons).find((k) => key.includes(k));
	return match ? thingIcons[match] : Wifi;
}

function getThingStatusVariant(status?: string, online?: boolean) {
	if (online === true || status === 'online') return 'success';
	if (online === false || status === 'offline') return 'danger';
	if (status === 'pending') return 'warning';
	return 'neutral';
}

function getThingStatusLabel(status?: string, online?: boolean, t?: (k: string) => string) {
	if (online === true || status === 'online') return t?.('devices.things.online') ?? 'Online';
	if (online === false || status === 'offline') return t?.('devices.things.offline') ?? 'Offline';
	if (status === 'pending') return t?.('devices.things.pending') ?? 'Pending';
	return status || (t?.('devices.things.unknown') ?? 'Unknown');
}

export default function DevicesPage() {
	const tenantSlug = useTenantSlug();

	const { t } = useTranslation();

	const {
		data: thingsResult,
		isLoading: thingsLoading,
		error: thingsError,
		refetch: refetchThings,
	} = useThingsList();

	const items = thingsResult?.items || [];

	if (thingsLoading)
		return (
			<div className="space-y-4">
				<SkeletonCard />
				<SkeletonCard />
			</div>
		);

	return (
		<div className="space-y-6">
			<ConsolePageHeader
				title={t('devices.title')}
				description={t('devices.subtitle')}
				actions={
					/* UP-43：空态已有卡片主按钮入口，右上入口隐藏，避免同屏两处「配对设备」 */
					items.length > 0 && (
						<div className="flex items-center gap-2">
							<Link
								to={buildNavHref(ROUTES.devicesPair, tenantSlug)}
								className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
							>
								<Plus size={14} />
								{t('devices.things.pair')}
							</Link>
						</div>
					)
				}
			/>

			{thingsError ? (
				<ErrorState
					message={t('devices.error')}
					className="min-h-[40vh]"
					onRetry={() => refetchThings()}
				/>
			) : (
				<div className="space-y-4">
					{items.map((thing) => {
						const Icon = getThingIcon(thing.type || thing.deviceType);
						const statusVariant = getThingStatusVariant(thing.status, thing.online);
						const statusLabel = getThingStatusLabel(thing.status, thing.online, t);
						return (
							<div
								key={thing.id}
								className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
							>
								<div className="flex items-start justify-between gap-4">
									<div className="flex items-start gap-4">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
											<Icon size={20} />
										</div>
										<div>
											<div className="flex items-center gap-2">
												<h3 className="font-semibold text-neutral-900">
													{thing.name || t('devices.things.unknownDevice')}
												</h3>
												<span
													className={`rounded-full px-2 py-0.5 text-xs font-medium ${
														statusVariant === 'success'
															? 'bg-success-soft text-success'
															: statusVariant === 'danger'
																? 'bg-danger/10 text-danger'
																: statusVariant === 'warning'
																	? 'bg-amber-50 text-amber-700'
																	: 'bg-neutral-100 text-neutral-600'
													}`}
												>
													{statusLabel}
												</span>
											</div>
											<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
												{(thing.type || thing.deviceType) && (
													<span className="flex items-center gap-1">
														{thing.type || thing.deviceType}
													</span>
												)}
												{thing.model && (
													<span className="flex items-center gap-1">{thing.model}</span>
												)}
												<span className="flex items-center gap-1">
													<Clock size={14} />
													{t('devices.lastSeen')}: {formatTime(thing.lastSeen || thing.createdAt)}
												</span>
												{thing.online !== undefined && (
													<span className="flex items-center gap-1">
														{thing.online ? (
															<Wifi size={14} className="text-success" />
														) : (
															<WifiOff size={14} className="text-neutral-500" />
														)}
													</span>
												)}
											</div>
										</div>
									</div>

									<div className="flex shrink-0 items-center gap-2">
										<Link
											to={`${buildNavHref(ROUTES.devicesFamily, tenantSlug)}?deviceId=${thing.identityId || thing.id}`}
											className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
										>
											<Users size={14} />
											<span className="hidden sm:inline">{t('devices.things.family')}</span>
										</Link>
									</div>
								</div>
							</div>
						);
					})}

					{(!thingsResult?.items || thingsResult.items.length === 0) && (
						<SectionCard
							padding="none"
							className="flex flex-col items-center justify-center text-center"
						>
							<Wifi size={40} className="text-neutral-300" />
							<p className="mt-4 text-sm text-neutral-600">{t('devices.things.empty')}</p>
							<Link
								to={buildNavHref(ROUTES.devicesPair, tenantSlug)}
								className="mt-4 flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
							>
								<Plus size={14} />
								{t('devices.things.pair')}
							</Link>
						</SectionCard>
					)}
				</div>
			)}
		</div>
	);
}
