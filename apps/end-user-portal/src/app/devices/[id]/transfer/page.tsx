'use client';

import { useParams, useNavigate } from 'react-router';
import { useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { ROUTES } from '@/lib/routes';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, ArrowLeft, Mail, Smartphone, UserCheck } from 'lucide-react';
import { AppPageHeader, Button, Label, SectionCard, LoadingScreen, ErrorState } from '@autional/ui';

// B2 待复核 #1 裁定：假成功面消除——转让链未接线（后端 POST /iots/:id/transfer 需
// new_owner_id，缺 email→owner 解析与接收方确认链），页面不再模拟提交，改如实占位。
export default function DeviceTransferPage() {
	const tenantSlug = useTenantSlug();
	const { t } = useTranslation();
	const { id: deviceId } = useParams<{ id: string }>();
	const navigate = useNavigate();

	const isLoading = false;
	const error = null;

	if (isLoading) return <LoadingScreen message={t('devices.transfer.loading')} />;

	if (error)
		return <ErrorState message={t('devices.transfer.loadError')} className="min-h-[40vh]" />;

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<button
				onClick={() => navigate(buildNavHref(ROUTES.devices, tenantSlug))}
				className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-700 transition-colors"
			>
				<ArrowLeft size={14} />
				{t('devices.transfer.back')}
			</button>

			<AppPageHeader
				title={t('devices.transfer.title')}
				description={t('devices.transfer.subtitle')}
			/>

			{deviceId && (
				<SectionCard
					padding="sm"
					className="flex items-center gap-3"
				>
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
						<Smartphone size={20} />
					</div>
					<div>
						<p className="text-sm font-medium text-neutral-900">{t('devices.transfer.deviceId')}</p>
						<p className="text-xs text-neutral-600 font-mono">{deviceId}</p>
					</div>
				</SectionCard>
			)}

			<SectionCard padding="none">
				<div className="flex flex-col items-center justify-center py-16 px-6 text-center">
					<div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
						<ArrowLeftRight size={32} className="text-neutral-500" />
					</div>
					<h3 className="mt-5 text-base font-semibold text-neutral-700">
						{t('devices.transfer.soonTitle')}
					</h3>
					<p className="mt-2 max-w-md text-sm text-neutral-600 leading-relaxed">
						{t('devices.transfer.soonDesc')}
					</p>
					<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
						{[
							{ icon: Mail, label: t('devices.transfer.features.invite') },
							{ icon: ArrowLeftRight, label: t('devices.transfer.features.ownership') },
							{ icon: UserCheck, label: t('devices.transfer.features.confirm') },
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
