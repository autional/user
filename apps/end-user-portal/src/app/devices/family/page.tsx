'use client';
import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { useTenantSlug, extractApiErrorMessage } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { ROUTES } from '@/lib/routes';
import { useTranslation } from 'react-i18next';
import { Users, ArrowLeft, Trash2, UserPlus, Crown, ShieldCheck, Eye, Smartphone, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
	useFamilyMembers,
	useAddFamilyMember,
	useRemoveFamilyMember,
	useThingsList,
	type FamilyMember,
} from '@/hooks/queries';
import {
	AppPageHeader,
	ErrorState,
	Button,
	Input,
	Label,
	SectionCard,
	LoadingScreen,
	ConfirmDialog,
} from '@autional/ui';

const roleConfig: Record<string, { icon: typeof ShieldCheck; labelKey: string; color: string }> = {
	parent_admin: { icon: Crown, labelKey: 'devices.family.role.parentAdmin', color: 'text-amber-600' },
	child_limited: {
		icon: ShieldCheck,
		labelKey: 'devices.family.role.childLimited',
		color: 'text-primary-600',
	},
	guest_viewer: { icon: Eye, labelKey: 'devices.family.role.guestViewer', color: 'text-neutral-600' },
};

const roleOptions = [
	{ value: 'parent_admin', labelKey: 'devices.family.role.parentAdmin' },
	{ value: 'child_limited', labelKey: 'devices.family.role.childLimited' },
	{ value: 'guest_viewer', labelKey: 'devices.family.role.guestViewer' },
];

function getRoleConfig(role?: string): { icon: typeof ShieldCheck; color: string; labelKey?: string } {
	return roleConfig[role || ''] || { icon: Users, color: 'text-neutral-600' };
}

export default function FamilyAccessPage() {
	const tenantSlug = useTenantSlug();
	const { t } = useTranslation();
	const toast = useToast();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const deviceId = searchParams.get('deviceId') || '';

	const { data: members = [], isLoading, error, refetch } = useFamilyMembers(deviceId);
	const addMutation = useAddFamilyMember();
	const removeMutation = useRemoveFamilyMember();
	const { data: thingsResult, isLoading: thingsLoading } = useThingsList();

	const [showForm, setShowForm] = useState(false);
	const [email, setEmail] = useState('');
	const [role, setRole] = useState<string>('guest_viewer');
	const [removeTarget, setRemoveTarget] = useState<FamilyMember | null>(null);

	const handleAdd = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			toast.error(t('devices.family.emailRequired'));
			return;
		}
		try {
			await addMutation.mutateAsync({ deviceId, email: trimmedEmail, role });
			toast.success(t('devices.family.addSuccess'));
			setEmail('');
			setRole('guest_viewer');
			setShowForm(false);
		} catch (err) {
			// UP-92：Problem DTO 无 message（title/detail 承载），一律走共享提取链。
			toast.error(extractApiErrorMessage(err, t('devices.family.addError')));
		}
	};

	const handleRemove = async () => {
		if (!removeTarget) return;
		try {
			await removeMutation.mutateAsync({ deviceId, memberId: removeTarget.id });
			toast.success(t('devices.family.removeSuccess'));
			setRemoveTarget(null);
		} catch (err) {
			toast.error(extractApiErrorMessage(err, t('devices.family.removeError')));
		}
	};

	if (!deviceId) {
		// UP-44：原为死胡同（仅提示「未指定设备 ID」+返回按钮）；改为设备选择器，选中带 ?deviceId= 进入。
		const things = thingsResult?.items || [];
		return (
			<div className="space-y-6">
				<div>
					<h2 className="text-xl font-bold text-neutral-900">{t('devices.family.title')}</h2>
					<p className="mt-1 text-sm text-neutral-600">{t('devices.family.subtitle')}</p>
				</div>
				{thingsLoading ? (
					<LoadingScreen message={t('devices.family.loading')} />
				) : things.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-20">
						<Users size={48} className="text-neutral-300" />
						<p className="mt-4 text-sm text-neutral-600">{t('devices.family.noDevices')}</p>
						<button
							onClick={() => navigate(buildNavHref(ROUTES.devices, tenantSlug))}
							className="mt-4 text-sm text-primary-600 hover:text-primary-700"
						>
							{t('devices.family.back')}
						</button>
					</div>
				) : (
					<div className="space-y-3">
						<p className="text-sm text-neutral-600">{t('devices.family.selectDevice')}</p>
						{things.map((thing) => (
							<Link
								key={thing.id}
								to={`${buildNavHref(ROUTES.devicesFamily, tenantSlug)}?deviceId=${thing.identityId || thing.id}`}
								className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 shadow-card hover:bg-neutral-50 transition-colors"
							>
								<span className="flex items-center gap-3">
									<span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-100 text-neutral-600">
										<Smartphone size={18} />
									</span>
									<span className="text-sm font-medium text-neutral-900">
										{thing.name || t('devices.things.unknownDevice')}
									</span>
								</span>
								<ChevronRight size={16} className="text-neutral-500" />
							</Link>
						))}
					</div>
				)}
			</div>
		);
	}

	// ADR-N2-B 移除（family-access-rebac 2026-08-07）: 后端 3 端点已实现（方案 C），
	// 404 不再代表"功能不可用"，直接走下方 ErrorState 渲染。
	return (
		<div className="space-y-6">
			<button
				onClick={() => navigate(buildNavHref(ROUTES.devices, tenantSlug))}
				className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-700 transition-colors"
			>
				<ArrowLeft size={14} />
				{t('devices.family.back')}
			</button>

			<AppPageHeader
				title={t('devices.family.title')}
				description={t('devices.family.subtitle')}
				actions={
					<>
						{!showForm && (
							<button
								onClick={() => setShowForm(true)}
								className="flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
							>
								<UserPlus size={14} />
								{t('devices.family.addMember')}
							</button>
						)}
					</>
				}
			/>

			{showForm && (
				<SectionCard padding="md">
					<form onSubmit={handleAdd} className="space-y-4">
						<h3 className="text-base font-semibold text-neutral-900">
							{t('devices.family.addTitle')}
						</h3>
						<div className="space-y-2">
							<Label htmlFor="member-email" required>
								{t('devices.family.emailLabel')}
							</Label>
							<Input
								id="member-email"
								type="email"
								placeholder={t('devices.family.emailPlaceholder')}
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								disabled={addMutation.isPending}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="member-role">{t('devices.family.roleLabel')}</Label>
							<select
								id="member-role"
								value={role}
								onChange={(e) => setRole(e.target.value)}
								disabled={addMutation.isPending}
								className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							>
								{roleOptions.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{t(opt.labelKey)}
									</option>
								))}
							</select>
						</div>
						<div className="flex items-center gap-2">
							<Button type="submit" size="sm" isLoading={addMutation.isPending}>
								{addMutation.isPending ? t('devices.family.adding') : t('devices.family.add')}
							</Button>
							<Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
								{t('devices.family.cancel')}
							</Button>
						</div>
					</form>
				</SectionCard>
			)}

			{isLoading ? (
				<LoadingScreen message={t('devices.family.loading')} />
			) : error ? (
				<ErrorState
					message={t('devices.family.error')}
					className="min-h-[30vh]"
					onRetry={() => refetch()}
				/>
			) : (
				<SectionCard padding="none">
					{members.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<Users size={40} className="text-neutral-300" />
							<p className="mt-4 text-sm text-neutral-600">{t('devices.family.empty')}</p>
						</div>
					) : (
						<ul className="divide-y divide-neutral-100">
							{members.map((member) => {
								const cfg = getRoleConfig(member.role);
								const RoleIcon = cfg.icon;
								const roleLabel = cfg.labelKey
									? t(cfg.labelKey)
									: member.role || t('devices.family.roleUnknown');
								return (
									<li key={member.id} className="flex items-center justify-between gap-4 p-4">
										<div className="flex items-center gap-3">
											<div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
												<Users size={16} />
											</div>
											<div>
												<p className="text-sm font-medium text-neutral-900">
													{member.username || member.email || member.id}
												</p>
												<div className={`flex items-center gap-1 text-xs ${cfg.color}`}>
													<RoleIcon size={12} />
													{roleLabel}
												</div>
											</div>
										</div>
										<button
											onClick={() => setRemoveTarget(member)}
											disabled={removeMutation.isPending}
											className="flex items-center gap-1 rounded-md border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
											aria-label={t('devices.family.remove')}
										>
											<Trash2 size={14} />
											<span className="hidden sm:inline">{t('devices.family.remove')}</span>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</SectionCard>
			)}

			<ConfirmDialog
				open={removeTarget !== null}
				title={t('devices.family.confirmRemoveTitle')}
				description={t('devices.family.confirmRemoveDesc', {
					name: removeTarget?.username || removeTarget?.email || removeTarget?.id || '',
				})}
				variant="danger"
				confirmText={t('devices.family.removeConfirm')}
				onConfirm={handleRemove}
				onCancel={() => setRemoveTarget(null)}
			/>
		</div>
	);
}
