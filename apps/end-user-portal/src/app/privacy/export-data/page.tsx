'use client';
import { ROUTES } from '@/lib/routes';
import { buildNavHref } from '@/lib/nav';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Download,
	Loader2,
	CheckCircle2,
	ChevronLeft,
	FileJson
} from 'lucide-react';
import { Link } from 'react-router';
import { useToast } from '@/hooks/use-toast';
import { extractApiError, useTenantSlug } from '@autional/shared';
import { authMeExportDataPost } from '@autional/shared/generated/api';
import { Result, SectionCard, AppPageHeader, Button, ConfirmDialog } from '@autional/ui';

export default function ExportDataPage() {
	const tenantSlug = useTenantSlug();

	const { t } = useTranslation();
	const toast = useToast();

	const [step, setStep] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
	const [errorMsg, setErrorMsg] = useState('');
	const [downloadUrl, setDownloadUrl] = useState('');
	// UP-95：PII 导出原为单击直发。补轻确认（neutral 档），不升级为 step-up 级重认证闸门。
	const [confirmOpen, setConfirmOpen] = useState(false);

	// UP-105：后端按设计内联返回导出数据（ExportMyDataResponse），不再依赖 downloadUrl 字段——
	// 将响应序列化为 JSON 文件并触发下载，令「文件将自动下载」承诺成立。
	const triggerDownload = (url: string) => {
		const a = document.createElement('a');
		a.href = url;
		a.download = `autional-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	};

	const handleExport = async () => {
		setStep('loading');
		setErrorMsg('');

		try {
			const res = await authMeExportDataPost();
			const blob = new Blob([JSON.stringify(res ?? {}, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);

			setDownloadUrl(url);
			setStep('success');
			toast.success(t('privacy.exportData.success'));
			triggerDownload(url);
		} catch (err: any) {
			const msg = extractApiError(err, t('privacy.exportData.error')).message;
			setErrorMsg(msg);
			setStep('error');
			toast.error(msg);
		}
	};

	const handleDownload = () => {
		if (downloadUrl) {
			triggerDownload(downloadUrl);
		}
	};

	return (
		<div className="max-w-lg mx-auto space-y-6">
			<Link
				to={buildNavHref(ROUTES.profile, tenantSlug)}
				className="text-neutral-600 hover:text-neutral-600 transition-colors"
			>
				<ChevronLeft size={20} />
			</Link>
			<AppPageHeader
				title={t('privacy.exportData.title')}
				description={t('privacy.exportData.subtitle')}
			/>

			{step === 'idle' && (
				<SectionCard
					title={t('privacy.exportData.ready')}
					className="text-center"
				>
					<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-700">
						<FileJson size={32} />
					</div>
					<h3 className="mt-4 text-lg font-semibold text-neutral-900">
						{t('privacy.exportData.ready')}
					</h3>
					<p className="mt-2 text-sm text-neutral-600">{t('privacy.exportData.desc')}</p>
					<ul className="mt-4 space-y-2 text-left text-sm text-neutral-600">
						<li className="flex items-start gap-2">
							<CheckCircle2 size={16} className="mt-0.5 text-success shrink-0" />
							{t('privacy.exportData.include1')}
						</li>
						<li className="flex items-start gap-2">
							<CheckCircle2 size={16} className="mt-0.5 text-success shrink-0" />
							{t('privacy.exportData.include2')}
						</li>
						<li className="flex items-start gap-2">
							<CheckCircle2 size={16} className="mt-0.5 text-success shrink-0" />
							{t('privacy.exportData.include3')}
						</li>
						<li className="flex items-start gap-2">
							<CheckCircle2 size={16} className="mt-0.5 text-success shrink-0" />
							{t('privacy.exportData.include4')}
						</li>
					</ul>
					<div className="mt-6">
						<Button onClick={() => setConfirmOpen(true)} variant="primary" className="gap-2">
							<Download size={16} />
							{t('privacy.exportData.start')}
						</Button>
					</div>
				</SectionCard>
			)}

			{step === 'loading' && (
				<SectionCard
					title={t('privacy.exportData.loading')}
					className="text-center"
				>
					<div className="mx-auto flex h-16 w-16 items-center justify-center">
						<Loader2 size={32} className="animate-spin text-primary-600" />
					</div>
					<h3 className="mt-4 text-lg font-semibold text-neutral-900">
						{t('privacy.exportData.loading')}
					</h3>
					<p className="mt-2 text-sm text-neutral-600">{t('privacy.exportData.loadingDesc')}</p>
				</SectionCard>
			)}

			{step === 'error' && (
				<Result
					variant="danger"
					title={t('privacy.exportData.errorTitle')}
					description={errorMsg}
					action={
						<>
							<Button onClick={() => setStep('idle')} variant="outline">
								{t('common.cancel')}
							</Button>
							<Button onClick={handleExport} variant="primary">
								{t('common.retry')}
							</Button>
						</>
					}
				/>
			)}

			{step === 'success' && (
				<Result
					variant="success"
					title={t('privacy.exportData.successTitle')}
					description={
						<>
							<span className="block">{t('privacy.exportData.successDesc')}</span>
							<span className="mt-1 block text-xs">{t('privacy.exportData.autoDownload')}</span>
						</>
					}
					action={
						<Button onClick={handleDownload} variant="primary" className="gap-2">
							<Download size={16} />
							{t('privacy.exportData.download')}
						</Button>
					}
				/>
			)}

			<ConfirmDialog
				open={confirmOpen}
				title={t('privacy.exportData.confirmTitle', '确认导出个人数据')}
				description={t(
					'privacy.exportData.confirmDesc',
					'将生成包含您个人数据的 JSON 文件并开始下载。请确认由您本人操作。',
				)}
				variant="neutral"
				confirmText={t('privacy.exportData.confirmAction', '开始导出')}
				onConfirm={() => {
					setConfirmOpen(false);
					handleExport();
				}}
				onCancel={() => setConfirmOpen(false)}
			/>
		</div>
	);
}
