'use client';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTenantSlug, extractApiErrorMessage } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { ROUTES } from '@/lib/routes';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Smartphone, ArrowLeft } from 'lucide-react';
import { Alert, Result, SectionCard, ConsolePageHeader, Button, Input, Label, LoadingScreen, ErrorState } from '@autional/ui';
import { useToast } from '@/hooks/use-toast';

export default function DevicePairingPage() {
	const tenantSlug = useTenantSlug();

	const { t } = useTranslation();
	const toast = useToast();
	const navigate = useNavigate();
	const [code, setCode] = useState('');
	const [success, setSuccess] = useState(false);

	const pairMutation = useMutation({
		mutationFn: async (userCode: string) => {
			const { iotsPairPost } = await import('@autional/shared/generated/api');
			return iotsPairPost({ user_code: userCode } as any);
		},
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = code.trim();
		if (!trimmed) {
			toast.error(t('devices.pair.codeRequired'));
			return;
		}
		try {
			await pairMutation.mutateAsync(trimmed);
			setSuccess(true);
			toast.success(t('devices.pair.success'));
			setTimeout(() => navigate(buildNavHref(ROUTES.devices, tenantSlug)), 1500);
		} catch (err) {
			// UP-92：Problem DTO 无 message（title/detail 承载），一律走共享提取链。
			toast.error(extractApiErrorMessage(err, t('devices.pair.error')));
		}
	};

	if (pairMutation.isPending) return <LoadingScreen message={t('devices.pair.pairing')} />;

	return (
		<div className="space-y-6">
			<button
				onClick={() => navigate(buildNavHref(ROUTES.devices, tenantSlug))}
				className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-700 transition-colors"
			>
				<ArrowLeft size={14} />
				{t('devices.pair.back')}
			</button>

			<ConsolePageHeader
				title={t('devices.pair.title')}
				description={t('devices.pair.subtitle')}
			/>

			{success ? (
				<Result
					variant="success"
					surface="tinted"
					title={t('devices.pair.successTitle')}
					description={t('devices.pair.successMessage')}
				/>
			) : pairMutation.isError ? (
				<ErrorState message={t('devices.pair.errorRetry')} className="min-h-[40vh]" />
			) : (
				<SectionCard>
					<Alert variant="info" className="mb-6" icon={<Smartphone className="h-4 w-4" />}>
						{t('devices.pair.instructions')}
					</Alert>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="pairing-code" required>
								{t('devices.pair.codeLabel')}
							</Label>
							<Input
								id="pairing-code"
								placeholder={t('devices.pair.codePlaceholder')}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								autoFocus
								disabled={pairMutation.isPending}
							/>
						</div>
						<Button type="submit" isLoading={pairMutation.isPending} fullWidth>
							{pairMutation.isPending ? t('devices.pair.pairing') : t('devices.pair.submit')}
						</Button>
					</form>
				</SectionCard>
			)}
		</div>
	);
}
