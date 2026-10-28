import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryResult,
	type UseMutationResult,
} from '@tanstack/react-query';
import { useAuth, useAuthActions } from '@autional/shared';
import {
	authMe,
	authMePut,
	authMePasswordPut,
	profileAvatar,
	profilesAvatarUploadByProfilesPost,
	profilesPrivacyByProfiles,
	profilesPrivacyByProfilesPut,
	authSendVerificationEmailPost,
	authVerifyEmailPost,
} from '@autional/shared/generated/api';
import type { UserProfile } from './types';
import { queryKeys } from './query-keys';

async function getUserProfile(): Promise<UserProfile> {
	const me = (await authMe()) as UserProfile;
	// U447：/auth/me 不含 avatarUrl（头像存在 profile 服务）；单独读取一次并入，
	// 否则刷新页面后已上传的头像会退回首字母（仅上传当次会话由 updateUser 兜底）。
	// 头像读取失败不阻塞资料主体：展示层回落首字母。
	try {
		const avatar = (await profileAvatar()) as { avatarUrl?: string } | undefined;
		if (avatar?.avatarUrl) return { ...me, avatarUrl: avatar.avatarUrl };
	} catch {
		/* 忽略：缺头像不影响资料页 */
	}
	return me;
}

async function updateUserProfile(data: Partial<UserProfile>): Promise<UserProfile> {
	return authMePut(data) as Promise<UserProfile>;
}

async function changePassword(data: {
	oldPassword: string;
	newPassword: string;
}): Promise<unknown> {
	return authMePasswordPut(data);
}

async function uploadAvatar(userId: string, file: File): Promise<{ avatarUrl?: string }> {
	const form = new FormData();
	form.append('file', file);
	const res = await (profilesAvatarUploadByProfilesPost as any)(userId, form, {
		// @generated-api-exempt (FormData)
		headers: { 'Content-Type': 'multipart/form-data' },
	});
	return res as { avatarUrl?: string };
}

export function useProfile(): UseQueryResult<UserProfile, Error> {
	return useQuery<UserProfile, Error>({
		queryKey: queryKeys.profile,
		queryFn: getUserProfile,
		staleTime: 5 * 60 * 1000,
	});
}

export function useUpdateProfile(): UseMutationResult<UserProfile, Error, Partial<UserProfile>> {
	const qc = useQueryClient();
	return useMutation<UserProfile, Error, Partial<UserProfile>>({
		mutationFn: updateUserProfile,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profile }),
	});
}

export function useChangePassword(): UseMutationResult<
	unknown,
	Error,
	{ oldPassword: string; newPassword: string }
> {
	return useMutation<unknown, Error, { oldPassword: string; newPassword: string }>({
		mutationFn: changePassword,
	});
}

export function useUploadAvatar(): UseMutationResult<
	{ avatarUrl?: string },
	Error,
	{ userId: string; file: File }
> {
	const qc = useQueryClient();
	const { updateUser } = useAuthActions();
	return useMutation<{ avatarUrl?: string }, Error, { userId: string; file: File }>({
		mutationFn: ({ userId, file }) => uploadAvatar(userId, file),
		onSuccess: (data) => {
			qc.invalidateQueries({ queryKey: queryKeys.profile });
			// 上传成功后把新头像写回认证快照：顶栏 UserMenu 订阅的是 AuthService，
			// 只刷 profile 查询的话头像会停在旧值直到刷新页面。
			if (data?.avatarUrl) updateUser({ avatarUrl: data.avatarUrl });
		},
	});
}

interface PrivacySettings {
	showEmail: boolean;
	showPhone: boolean;
	profileVisibility: 'public' | 'private' | 'contacts_only';
}

async function getPrivacy(userId: string): Promise<PrivacySettings> {
	// 后端响应 {code, data: {privacy: {...}}}：apiClient 解包 data 后顶层是 { privacy }，
	// 再经 camelCaseKeys。此前读 data?.data 恒 undefined → 隐私开关永远显示本地默认值。
	const res = (await profilesPrivacyByProfiles(userId)) as
		| { privacy?: Partial<PrivacySettings> }
		| undefined;
	const p = res?.privacy;
	return {
		showEmail: p?.showEmail ?? true,
		showPhone: p?.showPhone ?? false,
		profileVisibility: p?.profileVisibility ?? 'private',
	};
}

async function updatePrivacy(
	userId: string,
	settings: Partial<PrivacySettings>,
): Promise<PrivacySettings> {
	// 同上（PUT 响应同构 {privacy: {...}}）；响应缺字段时回显入参，保证调用方拿到完整对象。
	const res = (await profilesPrivacyByProfilesPut(userId, settings)) as
		| { privacy?: Partial<PrivacySettings> }
		| undefined;
	const p = res?.privacy;
	return {
		showEmail: p?.showEmail ?? settings.showEmail ?? true,
		showPhone: p?.showPhone ?? settings.showPhone ?? false,
		profileVisibility: p?.profileVisibility ?? settings.profileVisibility ?? 'private',
	};
}

export function usePrivacy(): UseQueryResult<PrivacySettings, Error> {
	const { userId } = useAuth();
	return useQuery<PrivacySettings, Error>({
		queryKey: [...queryKeys.profile, 'privacy'] as const,
		queryFn: () => getPrivacy(userId || ''),
		enabled: !!userId,
	});
}

export function useUpdatePrivacy(): UseMutationResult<
	PrivacySettings,
	Error,
	Partial<PrivacySettings>
> {
	const qc = useQueryClient();
	const { userId } = useAuth();
	return useMutation<PrivacySettings, Error, Partial<PrivacySettings>>({
		mutationFn: (settings) => updatePrivacy(userId || '', settings),
		onSuccess: () => qc.invalidateQueries({ queryKey: [...queryKeys.profile, 'privacy'] }),
	});
}

async function sendVerificationEmail(email: string): Promise<unknown> {
	return authSendVerificationEmailPost({ email });
}

async function verifyEmailChange(token: string): Promise<unknown> {
	return authVerifyEmailPost({ token });
}

export function useSendVerificationEmail(): UseMutationResult<unknown, Error, string> {
	return useMutation<unknown, Error, string>({
		mutationFn: sendVerificationEmail,
	});
}

export function useVerifyEmailChange(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, string>({
		mutationFn: verifyEmailChange,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.profile }),
	});
}
