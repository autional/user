'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { extractApiError } from '@autional/shared';
import {
	useChangePhone,
	useVerifyPhoneChange,
	useChangeEmail,
	useVerifyEmailChangeByIdentifier,
	useReAuthenticate,
	useRevokeOtherSessions,
	useCancelEmailChange,
	useCancelPhoneChange,
	isReauthRequiredError,
} from '@/hooks/queries/use-identifier-change';
import { useToast } from '@/hooks/use-toast';
import { Modal } from '@autional/ui';

type ChangeKind = 'phone' | 'email';
type Step = 'submit' | 'reauth' | 'verify' | 'done';

interface Props {
	kind: ChangeKind;
	open: boolean;
	onClose: () => void;
}

/**
 * 手机号/邮箱变更对话框（pending 两阶段 + 重认证闸门 + 退出其他设备）。
 * 流程: 提交新值+密码 → (403 reauth → 重认证拿 step-up token → 自动重试) → pending →
 *       验证码 → verify → 成功（可选退出其他设备）。
 */
export function IdentifierChangeDialog({ kind, open, onClose }: Props) {
	const { t } = useTranslation();
	const toast = useToast();

	const [step, setStep] = useState<Step>('submit');
	const [newValue, setNewValue] = useState('');
	const [password, setPassword] = useState('');
	const [reauthPassword, setReauthPassword] = useState('');
	const [code, setCode] = useState('');
	const [stepUpToken, setStepUpToken] = useState<string | undefined>();
	const [revokeOthers, setRevokeOthers] = useState(true); // GAP-2 修复：安全默认值，默认勾选退出其他设备（可取消，AC-009）
	const [resendCooldown, setResendCooldown] = useState(0);

	const changePhoneMut = useChangePhone();
	const changeEmailMut = useChangeEmail();
	const verifyPhoneMut = useVerifyPhoneChange();
	const verifyEmailMut = useVerifyEmailChangeByIdentifier();
	const reauthMut = useReAuthenticate();
	const revokeMut = useRevokeOtherSessions();
	const cancelEmailMut = useCancelEmailChange();
	const cancelPhoneMut = useCancelPhoneChange();

	if (!open) return null;

	const isPhone = kind === 'phone';
	const tKey = isPhone ? 'profile.identifierChange.phone' : 'profile.identifierChange.email';

	const doChange = async (token?: string) => {
		const mut = isPhone ? changePhoneMut : changeEmailMut;
		await mut.mutateAsync({
			newPhone: newValue,
			newEmail: newValue,
			password,
			stepUpToken: token,
		});
		setStep('verify');
		toast.success(t('profile.identifierChange.codeSent'));
	};

	const handleSubmit = async () => {
		try {
			await doChange(stepUpToken);
		} catch (err) {
			if (isReauthRequiredError(err)) {
				// 重认证闸门：引导重新认证
				setStep('reauth');
				toast.info(t('profile.identifierChange.reauthRequired'));
				return;
			}
			toast.error(extractApiError(err, t('profile.identifierChange.changeFailed')).message);
		}
	};

	const handleReauth = async () => {
		try {
			const res = await reauthMut.mutateAsync(reauthPassword);
			if (!res.stepUpToken) {
				toast.error(t('profile.identifierChange.reauthNoToken'));
				return;
			}
			setStepUpToken(res.stepUpToken);
			// 带新凭证重试 change（后端 403 已被 token 绕过）
			await doChange(res.stepUpToken);
			setReauthPassword('');
		} catch (err) {
			toast.error(extractApiError(err, t('profile.identifierChange.reauthFailed')).message);
		}
	};

	const handleVerify = async () => {
		try {
			if (isPhone) {
				await verifyPhoneMut.mutateAsync(code);
			} else {
				await verifyEmailMut.mutateAsync(code);
			}
			setStep('done');
			toast.success(t('profile.identifierChange.changed'));
		} catch (err) {
			toast.error(extractApiError(err, t('profile.identifierChange.verifyFailed')).message);
		}
	};

	const handleResend = () => {
		if (resendCooldown > 0) return;
		void handleSubmit();
		setResendCooldown(60);
		const timer = setInterval(() => {
			setResendCooldown((prev) => {
				if (prev <= 1) {
					clearInterval(timer);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
	};

	// S5.1 取消变更（AC-014）：verify 步骤取消按钮 → 成功回到 submit 起点，可立即重新发起
	const handleCancelChange = async () => {
		const mut = isPhone ? cancelPhoneMut : cancelEmailMut;
		try {
			await mut.mutateAsync();
			setStep('submit');
			toast.success(t('profile.identifierChange.cancelSuccess'));
		} catch (err) {
			toast.error(
				extractApiError(err, t('profile.identifierChange.cancelError')).message,
			);
		}
	};

	const handleDone = async () => {
		if (revokeOthers) {
			try {
				await revokeMut.mutateAsync();
				toast.success(t('profile.identifierChange.othersLoggedOut'));
			} catch {
				toast.warning(t('profile.identifierChange.revokeFailed'));
			}
		}
		onClose();
	};

	const inputCls =
		'mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
	const btnCls =
		'rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60';

	// UP-06：手写覆盖层收敛到共享 Modal（X 关闭 / Escape / dialog 语义 / 焦点圈定与归还随之获得）。
	return (
		<Modal open={open} onClose={onClose} title={t(`${tKey}.title`)} maxWidth="md">
			{step === 'submit' && (
				<div className="mt-4 space-y-4">
					<div>
						<label className="block text-sm font-medium text-neutral-700">
							{t(`${tKey}.newValue`)}
						</label>
						<input
							type={isPhone ? 'tel' : 'email'}
							value={newValue}
							onChange={(e) => setNewValue(e.target.value)}
							className={inputCls}
							placeholder={t(`${tKey}.newValuePlaceholder`)}
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-neutral-700">
							{t('profile.identifierChange.password')}
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className={inputCls}
						/>
					</div>
					<div className="flex justify-end gap-2">
						<button
							onClick={onClose}
							className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
						>
							{t('profile.cancel')}
						</button>
						<button
							onClick={handleSubmit}
							// UP-07：空值直发会被后端拒。前置禁用（新值 trim 后非空 + 密码非空才可提交）。
							disabled={
								changePhoneMut.isPending ||
								changeEmailMut.isPending ||
								!newValue.trim() ||
								!password
							}
							className={btnCls}
						>
							{t('profile.identifierChange.sendCode')}
						</button>
					</div>
				</div>
			)}

			{step === 'reauth' && (
				<div className="mt-4 space-y-4">
					<p className="text-sm text-neutral-600">
						{t('profile.identifierChange.reauthRequiredDesc')}
					</p>
					<div>
						<label className="block text-sm font-medium text-neutral-700">
							{t('profile.identifierChange.password')}
						</label>
						<input
							type="password"
							value={reauthPassword}
							onChange={(e) => setReauthPassword(e.target.value)}
							className={inputCls}
						/>
					</div>
					<div className="flex justify-end gap-2">
						<button
							onClick={onClose}
							className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
						>
							{t('profile.cancel')}
						</button>
						<button onClick={handleReauth} disabled={reauthMut.isPending} className={btnCls}>
							{t('profile.identifierChange.reauthSubmit')}
						</button>
					</div>
				</div>
			)}

			{step === 'verify' && (
				<div className="mt-4 space-y-4">
					<p className="text-sm text-neutral-600">{t('profile.identifierChange.codeHint')}</p>
					<div>
						<input
							type="text"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							className={inputCls}
							placeholder={t('profile.identifierChange.codePlaceholder')}
						/>
					</div>
					<div className="flex items-center justify-between">
						<div className="flex gap-2">
							<button
								onClick={handleCancelChange}
								disabled={cancelEmailMut.isPending || cancelPhoneMut.isPending}
								className="text-sm text-danger-text hover:underline disabled:text-neutral-600"
							>
								{t('profile.identifierChange.cancelChange')}
							</button>
							<button
								onClick={handleResend}
								disabled={resendCooldown > 0}
								className="text-sm text-primary-600 hover:underline disabled:text-neutral-600"
							>
								{resendCooldown > 0
									? t('profile.identifierChange.resendCooldown', { seconds: resendCooldown })
									: t('profile.identifierChange.resend')}
							</button>
						</div>
						<div className="flex gap-2">
							<button
								onClick={() => setStep('submit')}
								className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
							>
								{t('profile.identifierChange.back')}
							</button>
							<button
								onClick={handleVerify}
								disabled={verifyPhoneMut.isPending || verifyEmailMut.isPending}
								className={btnCls}
							>
								{t('profile.identifierChange.confirm')}
							</button>
						</div>
					</div>
				</div>
			)}

			{step === 'done' && (
				<div className="mt-4 space-y-4">
					<p className="text-sm text-success-text">{t('profile.identifierChange.changed')}</p>
					<label className="flex items-center gap-2 text-sm text-neutral-700">
						<input
							type="checkbox"
							checked={revokeOthers}
							onChange={(e) => setRevokeOthers(e.target.checked)}
							className="h-4 w-4 rounded-xs border-neutral-300 text-primary-600"
						/>
						{t('profile.identifierChange.revokeOthers')}
					</label>
					<p className="text-xs text-neutral-600">{t('profile.identifierChange.revokeOthersDesc')}</p>
					<div className="flex justify-end">
						<button onClick={handleDone} className={btnCls}>
							{t('profile.identifierChange.done')}
						</button>
					</div>
				</div>
			)}
		</Modal>
	);
}
