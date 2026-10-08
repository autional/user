'use client';
import { ROUTES } from '@/lib/routes';
import { buildNavHref } from '@/lib/nav';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	UserCircle,
	Mail,
	Phone,
	Calendar,
	Edit2,
	Save,
	X,
	Camera,
	Eye,
	ChevronRight,
	FileCheck,
} from 'lucide-react';
import { Link } from 'react-router';
import { useToast } from '@/hooks/use-toast';
import { extractApiError, useTenantSlug } from '@autional/shared';
import {
	useProfile,
	useUpdateProfile,
	useUploadAvatar,
	usePrivacy,
	useUpdatePrivacy,
} from '@/hooks/queries';
import { useLanguage } from '@/hooks/use-language';
import { useTheme } from '@/hooks/use-theme';
import { SectionCard, AppPageHeader, ErrorState } from '@autional/ui';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { IdentifierChangeDialog } from '@/components/profile/IdentifierChangeDialog';

export default function ProfilePage() {
	const tenantSlug = useTenantSlug();

	const { t } = useTranslation();
	const toast = useToast();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { data: profile, isLoading, error } = useProfile();
	const updateMutation = useUpdateProfile();
	const uploadMutation = useUploadAvatar();
	const { data: privacy } = usePrivacy();
	const updatePrivacyMutation = useUpdatePrivacy();

	const [activeTab, setActiveTab] = useState<'basic' | 'privacy' | 'preferences'>('basic');
	const { current: currentLang, setLanguage, languages } = useLanguage();
	const { isDark, toggle: toggleTheme } = useTheme();
	const [editing, setEditing] = useState(false);
	const [form, setForm] = useState({ username: '', phone: '' });
	const [changeDialog, setChangeDialog] = useState<'phone' | 'email' | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<File | null>(null);

	const startEdit = () => {
		if (profile) {
			// 手机号变更走验证流程（/auth/me/phone/change + verify），不再直改
			setForm({ username: profile.username || '', phone: profile.phone || '' });
		}
		setEditing(true);
	};

	const handleSave = async () => {
		try {
			await updateMutation.mutateAsync({
				username: form.username,
			});
			toast.success(t('profile.updateSuccess'));
			setEditing(false);
		} catch (err: any) {
			toast.error(extractApiError(err, t('profile.updateError')).message);
		}
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toast.error(t('profile.fileTypeError'));
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			toast.error(t('profile.fileSizeError'));
			return;
		}
		setPendingFile(file);
		const reader = new FileReader();
		reader.onload = () => setPreviewUrl(reader.result as string);
		reader.readAsDataURL(file);
	};

	const handleUploadAvatar = async () => {
		if (!pendingFile || !profile?.id) return;
		try {
			await uploadMutation.mutateAsync({ userId: profile.id, file: pendingFile });
			toast.success(t('profile.uploadSuccess'));
			setPreviewUrl(null);
			setPendingFile(null);
		} catch (err: any) {
			toast.error(extractApiError(err, t('profile.uploadError')).message);
		}
	};

	const cancelUpload = () => {
		setPreviewUrl(null);
		setPendingFile(null);
		if (fileInputRef.current) fileInputRef.current.value = '';
	};

	const handlePrivacyToggle = async (
		field: 'showEmail' | 'showPhone' | 'profileVisibility',
		value: boolean | string,
	) => {
		try {
			await updatePrivacyMutation.mutateAsync({ [field]: value });
			toast.success(t('profile.updateSuccess'));
		} catch (err: any) {
			toast.error(extractApiError(err, t('profile.updateError')).message);
		}
	};

	const InfoRow = ({
		icon: Icon,
		label,
		value,
		action,
	}: {
		icon: typeof Mail;
		label: string;
		value?: string;
		action?: React.ReactNode;
	}) => (
		<div className="flex items-center gap-3 py-3">
			<div className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
				<Icon size={18} />
			</div>
			<div className="flex-1">
				<p className="text-xs text-neutral-600">{label}</p>
				<p className="text-sm font-medium text-neutral-900">{value || '--'}</p>
			</div>
			{action}
		</div>
	);

	const PrivacyToggle = ({
		label,
		description,
		checked,
		onChange,
	}: {
		label: string;
		description: string;
		checked: boolean;
		onChange: () => void;
	}) => (
		<div className="flex items-center justify-between py-4">
			<div>
				<p className="text-sm font-medium text-neutral-900">{label}</p>
				<p className="text-xs text-neutral-600">{description}</p>
			</div>
			<button
				onClick={onChange}
				role="switch"
				aria-checked={checked}
				aria-label={label}
				className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
					checked ? 'bg-primary-600' : 'bg-neutral-300'
				}`}
			>
				<span
					className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
						checked ? 'translate-x-6' : 'translate-x-1'
					}`}
				/>
			</button>
		</div>
	);

	if (isLoading)
		return (
			<div className="max-w-4xl mx-auto space-y-6">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
		);
	if (error) return <ErrorState message={t('profile.error')} className="min-h-[40vh]" />;
	if (!profile) return <ErrorState message={t('profile.notFound')} className="min-h-[40vh]" />;

	const displayAvatar = previewUrl || profile.avatarUrl;
	const userInitial =
		profile.username?.[0]?.toUpperCase() || profile.email?.[0]?.toUpperCase() || 'U';

	return (
		<div className="space-y-6">
			<AppPageHeader
				title={t('profile.title')}
				actions={
					<>
						{activeTab === 'basic' && !editing ? (
							<button
								onClick={startEdit}
								className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
							>
								<Edit2 size={14} />
								{t('profile.edit')}
							</button>
						) : activeTab === 'basic' && editing ? (
							<div className="flex items-center gap-2">
								<button
									onClick={() => setEditing(false)}
									className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
								>
									<X size={14} />
									{t('profile.cancel')}
								</button>
								<button
									onClick={handleSave}
									disabled={updateMutation.isPending}
									className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors disabled:opacity-60"
								>
									<Save size={14} />
									{updateMutation.isPending ? t('profile.saving') : t('profile.save')}
								</button>
							</div>
						) : null}
					</>
				}
			/>

			{/* Privacy Impact Link */}
			<Link
				to={buildNavHref(ROUTES.privacyImpact, tenantSlug)}
				className="flex items-center gap-4 rounded-lg border border-info-soft bg-info-soft p-4 hover:border-info transition-all"
			>
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info-soft text-info-text">
					<Eye size={20} />
				</div>
				<div className="flex-1">
					<h3 className="font-medium text-neutral-900">{t('profile.privacyImpactLink')}</h3>
					<p className="text-sm text-neutral-600">{t('profile.privacyImpactLinkDesc')}</p>
				</div>
				<ChevronRight size={16} className="text-neutral-500" />
			</Link>

			{/* Consent Management Link */}
			<Link
				to={buildNavHref(ROUTES.consents, tenantSlug)}
				className="flex items-center gap-4 rounded-lg border border-success-soft bg-success-soft p-4 hover:border-success transition-all"
			>
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success-soft text-success-text">
					<FileCheck size={20} />
				</div>
				<div className="flex-1">
					<h3 className="font-medium text-neutral-900">{t('profile.consentsLink')}</h3>
					<p className="text-sm text-neutral-600">{t('profile.consentsLinkDesc')}</p>
				</div>
				<ChevronRight size={16} className="text-neutral-500" />
			</Link>

			<div className="flex border-b border-neutral-200">
				<button
					onClick={() => setActiveTab('basic')}
					className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
						activeTab === 'basic'
							? 'border-primary-600 text-primary-600'
							: 'border-transparent text-neutral-600 hover:text-neutral-700'
					}`}
				>
					{t('profile.tabs.basic')}
				</button>
				<button
					onClick={() => setActiveTab('privacy')}
					className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
						activeTab === 'privacy'
							? 'border-primary-600 text-primary-600'
							: 'border-transparent text-neutral-600 hover:text-neutral-700'
					}`}
				>
					{t('profile.tabs.privacy')}
				</button>
				<button
					onClick={() => setActiveTab('preferences')}
					className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
						activeTab === 'preferences'
							? 'border-primary-600 text-primary-600'
							: 'border-transparent text-neutral-600 hover:text-neutral-700'
					}`}
				>
					{t('profile.tabs.preferences')}
				</button>
			</div>

			{activeTab === 'basic' ? (
				<SectionCard>
					<div className="flex items-center gap-4 pb-6 border-b border-neutral-100">
						<div className="relative group">
							{displayAvatar ? (
								<img
									src={displayAvatar}
									alt="avatar"
									className="h-16 w-16 rounded-full object-cover border border-neutral-200"
								/>
							) : (
								<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-2xl font-bold text-primary-700">
									{userInitial}
								</div>
							)}
							<button
								onClick={() => fileInputRef.current?.click()}
								className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
								title={t('profile.avatar.change')}
							>
								<Camera size={18} />
							</button>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleFileSelect}
							/>
						</div>

						<div>
							<h3 className="text-lg font-semibold text-neutral-900">
								{profile.username || profile.email}
							</h3>
							{/* UP-05：无 username 时 h3 已回落为邮箱，副行再写一次即双写 */}
							{profile.username && <p className="text-sm text-neutral-600">{profile.email}</p>}
						</div>
					</div>

					{pendingFile && (
						<div className="mt-4 flex items-center gap-3 rounded-md bg-primary-50 p-3">
							<span className="text-sm text-primary-800">
								{t('profile.avatar.selected', { name: pendingFile.name })}
							</span>
							<div className="flex-1" />
							<button
								onClick={cancelUpload}
								className="text-sm text-neutral-600 hover:text-neutral-900"
							>
								{t('profile.avatar.cancel')}
							</button>
							<button
								onClick={handleUploadAvatar}
								disabled={uploadMutation.isPending}
								className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
							>
								{uploadMutation.isPending
									? t('profile.avatar.uploading')
									: t('profile.avatar.confirm')}
							</button>
						</div>
					)}

					{!editing ? (
						<div className="mt-4 divide-y divide-neutral-100">
							<InfoRow icon={UserCircle} label={t('profile.username')} value={profile.username} />
							<InfoRow
								icon={Mail}
								label={t('profile.email')}
								value={profile.email}
								action={
									<button
										onClick={() => setChangeDialog('email')}
										className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
									>
										{t('profile.identifierChange.change')}
									</button>
								}
							/>
							<InfoRow
								icon={Phone}
								label={t('profile.phone')}
								value={profile.phone}
								action={
									<button
										onClick={() => setChangeDialog('phone')}
										className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
									>
										{t('profile.identifierChange.change')}
									</button>
								}
							/>
							<InfoRow
								icon={Calendar}
								label={t('profile.createdAt')}
								value={profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '--'}
							/>
							<InfoRow
								icon={UserCircle}
								label={t('profile.status')}
								value={profile.status === 'active' ? t('profile.statusActive') : profile.status}
							/>
						</div>
					) : (
						<div className="mt-4 space-y-4">
							<div>
								<label
									htmlFor="profile-username"
									className="block text-sm font-medium text-neutral-700"
								>
									{t('profile.username')}
								</label>
								<input
									id="profile-username"
									type="text"
									value={form.username}
									onChange={(e) => setForm({ ...form, username: e.target.value })}
									className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								/>
							</div>
						</div>
					)}
				</SectionCard>
			) : activeTab === 'privacy' ? (
				<SectionCard title={t('profile.privacy.title')}>
					<h3 className="text-lg font-semibold text-neutral-900">{t('profile.privacy.title')}</h3>
					<div className="mt-2 divide-y divide-neutral-100">
						<PrivacyToggle
							label={t('profile.privacy.emailVisible')}
							description={t('profile.privacy.emailVisibleDesc')}
							checked={privacy?.showEmail ?? false}
							onChange={() => handlePrivacyToggle('showEmail', !privacy?.showEmail)}
						/>
						<PrivacyToggle
							label={t('profile.privacy.phoneVisible')}
							description={t('profile.privacy.phoneVisibleDesc')}
							checked={privacy?.showPhone ?? false}
							onChange={() => handlePrivacyToggle('showPhone', !privacy?.showPhone)}
						/>
						<PrivacyToggle
							label={t('profile.privacy.profileVisible')}
							description={t('profile.privacy.profileVisibleDesc')}
							checked={privacy?.profileVisibility === 'public'}
							onChange={() =>
								handlePrivacyToggle(
									'profileVisibility',
									privacy?.profileVisibility === 'public' ? 'private' : 'public',
								)
							}
						/>
					</div>
				</SectionCard>
			) : (
				<SectionCard title={t('profile.preferences.title')}>
					<h3 className="text-lg font-semibold text-neutral-900">
						{t('profile.preferences.title')}
					</h3>
					<div className="mt-2 divide-y divide-neutral-100">
						<div className="flex items-center justify-between py-4">
							<div>
								<label
									htmlFor="profile-language"
									className="text-sm font-medium text-neutral-900"
								>
									{t('profile.preferences.language')}
								</label>
							</div>
							<select
								id="profile-language"
								value={currentLang}
								onChange={(e) => setLanguage(e.target.value as typeof currentLang)}
								className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							>
								{languages.map((lang) => (
									<option key={lang.code} value={lang.code}>
										{lang.label}
									</option>
								))}
							</select>
						</div>
						<div className="flex items-center justify-between py-4">
							<div>
								<p className="text-sm font-medium text-neutral-900">
									{t('profile.preferences.theme')}
								</p>
								<p className="text-xs text-neutral-600">
									{isDark ? t('profile.preferences.dark') : t('profile.preferences.light')}
								</p>
							</div>
							<button
								onClick={toggleTheme}
								role="switch"
								aria-checked={isDark}
								aria-label={t('profile.preferences.theme')}
								className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
									isDark ? 'bg-primary-600' : 'bg-neutral-300'
								}`}
							>
								<span
									className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
										isDark ? 'translate-x-6' : 'translate-x-1'
									}`}
								/>
							</button>
						</div>
						<div className="flex items-center justify-between py-4">
							<div>
								<p className="text-sm font-medium text-neutral-900">
									{t('profile.preferences.timezone')}
								</p>
							</div>
							<p className="text-sm text-neutral-600">
								{Intl.DateTimeFormat().resolvedOptions().timeZone}
							</p>
						</div>
					</div>
				</SectionCard>
			)}

			{changeDialog !== null && (
				<IdentifierChangeDialog kind={changeDialog} open onClose={() => setChangeDialog(null)} />
			)}
		</div>
	);
}
