'use client';
import { ROUTES } from '@/lib/routes';
import { buildNavHref } from '@/lib/nav';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronLeft, ShieldOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useToast } from '@/hooks/use-toast';
import {
	extractApiError,
	logout,
	getAUTH_PAGES_URL,
	processPasswordForTransmission,
	getCurrentTenantId,
	useTenantSlug,
} from '@autional/shared';
import {
	authMeDeleteAccountPost,
	PublicAuthConfigByAuthConfig,
} from '@autional/shared/generated/api';
import { Alert, ConsolePageHeader, Button } from '@autional/ui';
import { FormInput } from '@autional/ui/rhf';
import { deleteSchema, type DeleteFormData } from '@/lib/validators';

export default function DeleteAccountPage() {
	const tenantSlug = useTenantSlug();

	const { t } = useTranslation();
	const toast = useToast();
	const navigate = useNavigate();
	const [apiError, setApiError] = useState<string | null>(null);

	const {
		control,
		handleSubmit,
		formState: { errors, isValid, isSubmitting },
	} = useForm<DeleteFormData>({
		resolver: zodResolver(deleteSchema),
		mode: 'onChange',
	});

	const onSubmit = async (data: DeleteFormData) => {
		setApiError(null);
		try {
			const tenantId = getCurrentTenantId() || '';
			// 2026-08-17 安全修复：禁止静默回退 plain。
			// 后端恒返回 password_transmission；undefined/空串 = 契约错误必须抛错暴露，
			// 不能降级明文（hash/symmetric 租户会 61000104）。
			const authConfig = await PublicAuthConfigByAuthConfig(tenantId);
			const mode = authConfig?.passwordPolicy?.passwordTransmission;
			if (mode === undefined || mode === '' || mode === null) {
				throw new Error(
					'password transmission mode is missing from tenant auth-config (contract error)',
				);
			}
			const result = await processPasswordForTransmission(
				data.password,
				mode,
				tenantId,
				undefined,
			);
			await (authMeDeleteAccountPost as any)({
				password: result.password,
				password_transmission: result.passwordTransmission,
			});
			toast.success(t('security.deleteAccount.success'));
			setTimeout(() => {
				// U350 接通后复查落点：auth 站裸 /login 是入口路由（无会话落 brand、有会话落 dashboard，
				// 旗标即丢）；迁 slug 直连 /<slug>/login（LoginPage 消费 account_deleted 横幅）。
				logout(
					tenantSlug
						? `${getAUTH_PAGES_URL()}/${tenantSlug}/login?account_deleted=true`
						: `${getAUTH_PAGES_URL()}/login?account_deleted=true`,
				);
			}, 1500);
		} catch (err: any) {
			const msg = extractApiError(err, t('security.deleteAccount.error')).message;
			setApiError(msg);
			toast.error(msg);
		}
	};

	return (
		<div className="max-w-lg mx-auto space-y-6">
			<Link
				to={buildNavHref(ROUTES.security, tenantSlug)}
				className="text-neutral-600 hover:text-neutral-600 transition-colors"
			>
				<ChevronLeft size={20} />
			</Link>
			<ConsolePageHeader
				title={t('security.deleteAccount.pageTitle')}
				description={t('security.deleteAccount.pageSubtitle')}
			/>

			<div className="rounded-lg border border-danger-soft bg-white p-6 shadow-sm">
				<div className="flex items-start gap-4">
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-text">
						<ShieldOff size={24} />
					</div>
					<div className="flex-1">
						<h3 className="text-lg font-semibold text-danger-text">
							{t('security.deleteAccount.warningTitle')}
						</h3>
						<p className="mt-1 text-sm text-neutral-600">
							{t('security.deleteAccount.warningDesc')}
						</p>
					</div>
				</div>

				<Alert
					variant="danger"
					className="mt-4"
				>
					<div className="flex items-start gap-2">
						<AlertTriangle size={16} className="mt-0.5 text-danger shrink-0" />
						<div className="text-sm text-danger-text">
							<p className="font-semibold">{t('security.deleteAccount.irreversible')}</p>
							<ul className="mt-2 list-inside list-disc space-y-1 text-danger-text">
								<li>{t('security.deleteAccount.consequence1')}</li>
								<li>{t('security.deleteAccount.consequence2')}</li>
								<li>{t('security.deleteAccount.consequence3')}</li>
								<li>{t('security.deleteAccount.consequence4')}</li>
							</ul>
						</div>
					</div>
				</Alert>

				{apiError && (
					<div className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger-text">{apiError}</div>
				)}

				<form onSubmit={handleSubmit(onSubmit)}>
					<div className="mt-6 border-t border-neutral-100 pt-4">
						<FormInput<DeleteFormData>
							name="password"
							control={control}
							type="password"
							autoComplete="current-password"
							label={t('security.deleteAccount.passwordLabel')}
							placeholder={t('security.deleteAccount.passwordPlaceholder', '请输入当前密码')}
							// zodResolver 给的 message 是 i18n 键 `mustMatch`，不显式覆盖就会把用户看到的
							// 报错从这句中文换成那串键 —— 校验仍归表单库，这里只决定显示哪句话。
							error={errors.password ? t('security.deleteAccount.passwordRequired') : undefined}
						/>
					</div>

					<div className="mt-4 border-t border-neutral-100 pt-4">
						<FormInput<DeleteFormData>
							name="confirmText"
							control={control}
							label={t('security.deleteAccount.confirmPrompt')}
							placeholder="DELETE"
							// 等宽 + 加宽字距不是装饰：它提示这个框要**逐字**打对 DELETE（防误操作的那道闸）。
							// 控件外观归设计系统，但这层「这框要你手打」的语义得留着。
							className="font-mono tracking-widest"
							// 报错文案沿用今天那句（与上方标签同一个键），而不是 zod 的 `mustMatch`
							error={errors.confirmText ? t('security.deleteAccount.confirmPrompt') : undefined}
						/>
					</div>

					<div className="mt-6 flex justify-end gap-3">
						<Button
							type="button"
							onClick={() => navigate(buildNavHref(ROUTES.security, tenantSlug))}
							variant="outline"
							disabled={isSubmitting}
						>
							{t('common.cancel')}
						</Button>
						<Button
							type="submit"
							variant="danger"
							disabled={!isValid || isSubmitting}
							isLoading={isSubmitting}
						>
							{isSubmitting
								? t('security.deleteAccount.deleting')
								: t('security.deleteAccount.confirmButton')}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
