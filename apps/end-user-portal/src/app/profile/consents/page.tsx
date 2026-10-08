'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Shield, Plus, Trash2 } from 'lucide-react';
import { useAuth, extractApiError } from '@autional/shared';
import {
	profilesConsentsByProfiles,
	profilesConsentsByProfilesPost,
	profilesConsentsByProfilesByConsentsDelete,
} from '@autional/shared/generated/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SectionCard, AppPageHeader, LoadingScreen, Modal } from '@autional/ui';
import { ErrorState, EmptyState } from '@autional/ui';
import { showToast } from '@autional/ui';
import { isNotFoundError } from '@/lib/api-error';

interface ConsentField {
	fieldKey: string;
	displayName: string;
	consented: boolean;
	requiresConsent: boolean;
	dataClassification: string;
	grantedAt?: string;
	revokedAt?: string;
}

interface ConsentFieldMetadata {
	key: string;
	labelKey: string;
	descKey: string;
}

const AVAILABLE_FIELDS: ConsentFieldMetadata[] = [
	{
		key: 'health_data',
		labelKey: 'consents.field.healthData.label',
		descKey: 'consents.field.healthData.desc',
	},
	{
		key: 'location',
		labelKey: 'consents.field.location.label',
		descKey: 'consents.field.location.desc',
	},
	{
		key: 'contacts',
		labelKey: 'consents.field.contacts.label',
		descKey: 'consents.field.contacts.desc',
	},
	{
		key: 'biometric_data',
		labelKey: 'consents.field.biometricData.label',
		descKey: 'consents.field.biometricData.desc',
	},
	{
		key: 'browsing_history',
		labelKey: 'consents.field.browsingHistory.label',
		descKey: 'consents.field.browsingHistory.desc',
	},
];

async function fetchConsents(userId: string): Promise<ConsentField[]> {
	// 后端响应 {code, data: {fields: [...]}}：apiClient 解包 data 后顶层即 fields。
	// 勿再读 data?.data（双解包恒 undefined，先前靠第二读兜住，属侥幸存活）。
	const data = (await profilesConsentsByProfiles(userId)) as any;
	return data?.fields || [];
}

async function grantConsents(userId: string, fieldKeys: string[]): Promise<void> {
	await profilesConsentsByProfilesPost(userId, { field_keys: fieldKeys } as any);
}

async function revokeConsent(userId: string, fieldKey: string): Promise<void> {
	await profilesConsentsByProfilesByConsentsDelete(userId, fieldKey);
}

export default function ConsentsPage() {
	const { t } = useTranslation();
	const { user } = useAuth();
	const userId = user?.id || '';
	const qc = useQueryClient();
	const [showModal, setShowModal] = useState(false);
	const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
	const [revokingField, setRevokingField] = useState<string | null>(null);

	// 已收录字段 → 本地化标签；未收录回退服务端 displayName / 原始键
	const fieldLabelFor = (fieldKey: string): string | undefined => {
		const known = AVAILABLE_FIELDS.find((f) => f.key === fieldKey);
		return known ? t(known.labelKey) : undefined;
	};

	const {
		data: consents = [],
		isLoading,
		error,
	} = useQuery<ConsentField[], Error>({
		queryKey: ['consents', userId],
		queryFn: () => fetchConsents(userId),
		enabled: !!userId,
		retry: 1,
	});

	const grantMutation = useMutation<void, Error, string[]>({
		mutationFn: (fieldKeys) => grantConsents(userId, fieldKeys),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['consents', userId] });
			setShowModal(false);
			setSelectedFields(new Set());
			showToast(t('consents.grantSuccess'), 'success');
		},
		onError: (err) => {
			showToast(extractApiError(err, t('consents.grantError')).message, 'error');
		},
	});

	const revokeMutation = useMutation<void, Error, string>({
		mutationFn: (fieldKey) => revokeConsent(userId, fieldKey),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['consents', userId] });
			setRevokingField(null);
			showToast(t('consents.revokeSuccess'), 'success');
		},
		onError: (err) => {
			showToast(extractApiError(err, t('consents.revokeError')).message, 'error');
		},
	});

	const consentedKeys = new Set(consents.filter((c) => c.consented).map((c) => c.fieldKey));
	const availableFields = AVAILABLE_FIELDS.filter((f) => !consentedKeys.has(f.key));

	const toggleField = (key: string) => {
		setSelectedFields((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const handleGrant = () => {
		if (selectedFields.size === 0) return;
		grantMutation.mutate(Array.from(selectedFields));
	};

	if (isLoading) return <LoadingScreen message={t('consents.loading')} />;
	if (error)
		return isNotFoundError(error) ? (
			<EmptyState
				title={t('consents.empty', '暂无授权记录')}
				description={t('consents.emptyDesc', '当前账户暂无数据授权记录')}
			/>
		) : (
			<ErrorState message={t('consents.error')} className="min-h-[40vh]" />
		);

	const classificationColor = (cls: string) => {
		switch (cls) {
			case 'sensitive':
				return 'bg-danger-soft text-danger-text border-danger-soft';
			case 'internal':
				return 'bg-amber-50 text-amber-700 border-amber-200';
			case 'public':
				return 'bg-success-soft text-success-text border-success-soft';
			default:
				return 'bg-neutral-50 text-neutral-700 border-neutral-200';
		}
	};

	return (
		<div className="space-y-6">
			<AppPageHeader
				title={t('consents.title')}
				description={t('consents.subtitle')}
				actions={
					<>
						{availableFields.length > 0 && (
							<button
								onClick={() => setShowModal(true)}
								className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
							>
								<Plus size={14} />
								{t('consents.grantNew')}
							</button>
						)}
					</>
				}
			/>

			{/* Active Consents */}
			<SectionCard padding="none">
				<div className="border-b border-neutral-100 px-6 py-4">
					<h3 className="text-sm font-semibold text-neutral-700">{t('consents.activeConsents')}</h3>
				</div>
				{consents.length === 0 ? (
					<div className="px-6 py-12 text-center">
						<Shield size={40} className="mx-auto text-neutral-300 mb-3" />
						<p className="text-sm text-neutral-600">{t('consents.noConsents')}</p>
					</div>
				) : (
					<div className="divide-y divide-neutral-100">
						{consents.map((field) => (
							<div key={field.fieldKey} className="flex items-center justify-between px-6 py-4">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<h4 className="text-sm font-medium text-neutral-900">
											{fieldLabelFor(field.fieldKey) || field.displayName}
										</h4>
										{field.consented ? (
											<span className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-text">
												<Check size={10} />
												{t('consents.granted')}
											</span>
										) : (
											<span className="inline-flex items-center gap-0.5 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger-text">
												<X size={10} />
												{t('consents.revoked')}
											</span>
										)}
										{field.dataClassification && (
											<span
												className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${classificationColor(field.dataClassification)}`}
											>
												{field.dataClassification}
											</span>
										)}
									</div>
									<div className="mt-1 flex items-center gap-4 text-xs text-neutral-600">
										<span>{field.fieldKey}</span>
										{field.grantedAt && (
											<span>
												{t('consents.grantedAt')}: {new Date(field.grantedAt).toLocaleDateString()}
											</span>
										)}
										{field.revokedAt && (
											<span>
												{t('consents.revokedAt')}: {new Date(field.revokedAt).toLocaleDateString()}
											</span>
										)}
									</div>
								</div>
								{field.consented && (
									<button
										onClick={() => setRevokingField(field.fieldKey)}
										className="ml-4 flex items-center gap-1 rounded-md border border-danger-soft bg-white px-2.5 py-1 text-xs font-medium text-danger-text hover:bg-danger-soft transition-colors"
									>
										<Trash2 size={12} />
										{t('consents.revoke')}
									</button>
								)}
							</div>
						))}
					</div>
				)}
			</SectionCard>

			{/* Grant Consent Modal */}
			<Modal
				open={showModal}
				onClose={() => setShowModal(false)}
				title={t('consents.grantModalTitle')}
				description={t('consents.grantModalDesc')}
				maxWidth="md"
				footer={
					<>
						<button
							onClick={() => {
								setShowModal(false);
								setSelectedFields(new Set());
							}}
							className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
						>
							{t('consents.cancel')}
						</button>
						<button
							onClick={handleGrant}
							disabled={selectedFields.size === 0 || grantMutation.isPending}
							className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors disabled:opacity-60"
						>
							{grantMutation.isPending ? t('consents.granting') : t('consents.grant')}
						</button>
					</>
				}
			>
{/* 横向内边距归 Modal 的内容区（px-6 py-4），保留会与表头/表尾错位；这里只留本层自己的滚动与间距 */}
				<div className="space-y-3 max-h-80 overflow-y-auto">
					{availableFields.length === 0 ? (
						<p className="text-center text-sm text-neutral-600 py-4">
							{t('consents.allFieldsConsented')}
						</p>
					) : (
						availableFields.map((field) => (
							<label
								key={field.key}
								className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
									selectedFields.has(field.key)
										? 'border-primary-300 bg-primary-50'
										: 'border-neutral-200 hover:border-neutral-300 bg-white'
								}`}
							>
								<input
									type="checkbox"
									checked={selectedFields.has(field.key)}
									onChange={() => toggleField(field.key)}
									className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
								/>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-neutral-900">{t(field.labelKey)}</p>
									<p className="text-xs text-neutral-600">{t(field.descKey)}</p>
								</div>
							</label>
						))
					)}
				</div>
			</Modal>

			{/* Revoke Confirmation Dialog */}
			<Modal
				open={!!revokingField}
				onClose={() => setRevokingField(null)}
				title={t('consents.revokeConfirmTitle')}
				description={t('consents.revokeConfirmDesc', {
					field: fieldLabelFor(revokingField ?? '') || revokingField,
				})}
				maxWidth="sm"
				footer={
					<>
						<button
							onClick={() => setRevokingField(null)}
							className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
						>
							{t('consents.cancel')}
						</button>
						<button
							onClick={() => revokeMutation.mutate(revokingField!)}
							disabled={revokeMutation.isPending}
							className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger transition-colors disabled:opacity-60"
						>
							{revokeMutation.isPending ? t('consents.revoking') : t('consents.confirmRevoke')}
						</button>
					</>
				}
			>

			</Modal>
		</div>
	);
}
