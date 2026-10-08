'use client';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { extractApiErrorMessage } from '@autional/shared';
import { Alert, SectionCard, Button, StatusBadge, showToast } from '@autional/ui';
import { ShieldCheck, ExternalLink } from 'lucide-react';

interface VerificationInfo {
	status: string;
	method?: string;
	provider?: string;
	verifiedAt?: string;
	ageGroup?: string;
	expiresAt?: string;
	retryCount: number;
	maxRetries: number;
	reason?: string;
}

const SKELETON_PLACEHOLDER = 'verification-skeleton';

export function VerificationStatus() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [info, setInfo] = useState<VerificationInfo | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadStatus();
	}, []);

	const loadStatus = async () => {
		try {
			const { verificationMe } = await import('@autional/shared/generated/api');
			// 后端 DataResponse → 拦截器解包后顶层即 VerificationStatusResponse（勿再读 res?.data）。
			const res: any = await verificationMe();
			setInfo(res || null);
		} catch {
			setInfo(null);
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<div
				id={SKELETON_PLACEHOLDER}
				className="animate-pulse rounded-lg border border-neutral-200 bg-white p-5 shadow-card"
			>
				<div className="flex items-center gap-3">
					<div className="h-10 w-10 rounded-md bg-neutral-200" />
					<div className="flex-1 space-y-2">
						<div className="h-4 w-1/3 rounded-xs bg-neutral-200" />
						<div className="h-3 w-2/3 rounded-xs bg-neutral-100" />
					</div>
				</div>
			</div>
		);
	}

	if (!info) {
		return (
			<SectionCard>
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
						<ShieldCheck size={20} />
					</div>
					<div className="flex-1">
						<p className="text-sm font-medium text-neutral-900">{t('verification.unverified')}</p>
						<p className="text-xs text-neutral-600">{t('verification.unverifiedDesc')}</p>
					</div>
					<Button variant="primary" size="sm" onClick={() => navigate('/verify-identity')}>
						{t('verification.startVerify')}
						<ExternalLink size={14} className="ml-1" />
					</Button>
				</div>
			</SectionCard>
		);
	}

	const renderBadge = () => {
		switch (info.status) {
			case 'verified':
				return <StatusBadge variant="success">{t('verification.verified')} ✓</StatusBadge>;
			case 'verified_minor':
				return <StatusBadge variant="info">{t('verification.verifiedMinor')}</StatusBadge>;
			case 'pending':
			case 'ocr_pending':
			case 'ocr_completed':
				return <StatusBadge variant="warning">{t('verification.pending')}</StatusBadge>;
			case 'rejected':
				return <StatusBadge variant="danger">{t('verification.rejected')}</StatusBadge>;
			case 'expired':
				return <StatusBadge variant="warning">{t('verification.expired')}</StatusBadge>;
			default:
				return <StatusBadge variant="neutral">{info.status}</StatusBadge>;
		}
	};

	const isProcessing = ['pending', 'ocr_pending', 'ocr_completed'].includes(info.status);

	return (
		<SectionCard>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div
						className={`flex h-10 w-10 items-center justify-center rounded-md ${
							info.status === 'verified'
								? 'bg-success-soft text-success-text'
								: info.status === 'verified_minor'
									? 'bg-info-soft text-info-text'
									: info.status === 'rejected'
										? 'bg-danger-soft text-danger-text'
										: info.status === 'expired'
											? 'bg-amber-50 text-amber-700'
											: 'bg-neutral-100 text-neutral-600'
						}`}
					>
						<ShieldCheck size={20} />
					</div>
					<div>
						<p className="text-sm font-medium text-neutral-900">{t('verification.title')}</p>
						{renderBadge()}
					</div>
				</div>
				{(info.status === 'rejected' || info.status === 'expired') && (
					<Button variant="primary" size="sm" onClick={() => navigate('/verify-identity')}>
						{t('verification.reVerify')}
					</Button>
				)}
			</div>

			{isProcessing && (
				<Alert
					variant="warning"
					className="mt-4 text-sm"
				>
					<span>{t('verification.pending')}</span>
				</Alert>
			)}

			{(info.status === 'verified' || info.status === 'verified_minor') && (
				<div className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100 pt-4">
					{info.method && <DetailRow label={t('verification.method')} value={info.method} />}
					{info.provider && <DetailRow label={t('verification.provider')} value={info.provider} />}
					{info.verifiedAt && (
						<DetailRow label={t('verification.verifiedAt')} value={info.verifiedAt} />
					)}
					{info.ageGroup && <DetailRow label={t('verification.ageGroup')} value={info.ageGroup} />}
					{info.expiresAt && (
						<DetailRow label={t('verification.expiresAt')} value={info.expiresAt} />
					)}
				</div>
			)}

			{info.status === 'verified_minor' && (
				<Alert
					variant="info"
					className="mt-4 text-sm"
				>
					<span>
						{t('verification.ageGroup')}: {info.ageGroup || '--'}
					</span>
				</Alert>
			)}

			{info.status === 'rejected' && (
				<Alert
					variant="danger"
					className="mt-4"
				>
					<p className="text-sm font-medium text-danger-text">{t('verification.rejected')}</p>
					{info.reason && (
						<p className="mt-1 text-xs text-danger-text">
							{t('verification.reason')}: {info.reason}
						</p>
					)}
					<p className="mt-1 text-xs text-danger-text">
						{t('verification.retryCount')}: {info.retryCount} / {info.maxRetries}
					</p>
				</Alert>
			)}

			{info.status === 'expired' && (
				<Alert
					variant="warning"
					className="mt-4"
				>
					<p className="text-sm font-medium text-amber-700">{t('verification.expired')}</p>
					{info.expiresAt && (
						<p className="mt-1 text-xs text-amber-600">
							{t('verification.expiresAt')}: {info.expiresAt}
						</p>
					)}
				</Alert>
			)}
		</SectionCard>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between py-2">
			<span className="text-xs text-neutral-600">{label}</span>
			<span className="text-sm font-medium text-neutral-900">{value}</span>
		</div>
	);
}
