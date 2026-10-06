import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryResult,
	type UseMutationResult,
} from '@tanstack/react-query';
import {
	authMeDevices,
	authMeDevicesByDevicesDelete,
	authMeDevicesTrustByDevicesPut,
	iots,
} from '@autional/shared/generated/api';
import type { DeviceInfo, ThingInfo, FamilyMember } from './types';
import type { PaginatedList } from './types';
import { queryKeys } from './query-keys';

async function getDevices(): Promise<PaginatedList<DeviceInfo>> {
	return authMeDevices() as Promise<PaginatedList<DeviceInfo>>;
}

async function revokeDevice(id: string) {
	await authMeDevicesByDevicesDelete(id);
}

async function revokeAllDevices() {
	// @generated-api-exempt — No bulk self-service device revoke in generated API
	const { apiClient } = await import('@autional/shared');
	await apiClient.delete('/identity/api/v1/devices'); // @generated-api-exempt
}

export function useDevices(): UseQueryResult<PaginatedList<DeviceInfo>, Error> {
	return useQuery<PaginatedList<DeviceInfo>, Error>({
		queryKey: queryKeys.devices,
		queryFn: getDevices,
		retry: 1,
	});
}

export function useRevokeDevice(): UseMutationResult<unknown, Error, string> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, string>({
		mutationFn: revokeDevice,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
	});
}

export function useRevokeAllDevices(): UseMutationResult<unknown, Error, void> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, void>({
		mutationFn: revokeAllDevices,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
	});
}

async function toggleDeviceTrust(deviceId: string, trusted: boolean): Promise<unknown> {
	return authMeDevicesTrustByDevicesPut(deviceId, { trusted });
}

export function useToggleTrust(): UseMutationResult<
	unknown,
	Error,
	{ deviceId: string; trusted: boolean }
> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, { deviceId: string; trusted: boolean }>({
		mutationFn: ({ deviceId, trusted }) => toggleDeviceTrust(deviceId, trusted),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
	});
}

async function getThings(): Promise<PaginatedList<ThingInfo>> {
	return iots() as Promise<PaginatedList<ThingInfo>>;
}

export function useThingsList(): UseQueryResult<PaginatedList<ThingInfo>, Error> {
	return useQuery<PaginatedList<ThingInfo>, Error>({
		queryKey: queryKeys.things,
		queryFn: getThings,
		retry: 1,
	});
}

async function pairDevice(data: { user_code: string }): Promise<unknown> {
	const { iotsPairPost } = await import('@autional/shared/generated/api');
	return iotsPairPost(data as any);
}

export function usePairDevice(): UseMutationResult<unknown, Error, { user_code: string }> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, { user_code: string }>({
		mutationFn: pairDevice,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.things }),
	});
}

async function getFamilyMembers(deviceId: string): Promise<FamilyMember[]> {
	const { iotsFamilyAccessByIots } = await import('@autional/shared/generated/api');
	// 后端 ListResponse → 拦截器解包后顶层即 items（勿再读 data?.data，双解包恒 undefined）。
	const data = (await iotsFamilyAccessByIots(deviceId)) as { items?: FamilyMember[] } | undefined;
	return data?.items || [];
}

async function addFamilyMember(
	deviceId: string,
	data: { email: string; role: string },
): Promise<unknown> {
	const { iotsFamilyAccessByIotsPost } = await import('@autional/shared/generated/api');
	return iotsFamilyAccessByIotsPost(deviceId, data as any);
}

async function removeFamilyMember(deviceId: string, memberId: string): Promise<void> {
	const { iotsFamilyAccessByIotsByFamilyAccessDelete } = await import('@autional/shared/generated/api');
	await iotsFamilyAccessByIotsByFamilyAccessDelete(deviceId, memberId);
}

export function useFamilyMembers(deviceId: string): UseQueryResult<FamilyMember[], Error> {
	return useQuery<FamilyMember[], Error>({
		queryKey: queryKeys.familyMembers(deviceId),
		queryFn: () => getFamilyMembers(deviceId),
		enabled: !!deviceId,
		retry: 1,
	});
}

export function useAddFamilyMember(): UseMutationResult<
	unknown,
	Error,
	{ deviceId: string; email: string; role: string }
> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, { deviceId: string; email: string; role: string }>({
		mutationFn: ({ deviceId, email, role }) => addFamilyMember(deviceId, { email, role }),
		onSuccess: (_data, vars) =>
			qc.invalidateQueries({ queryKey: queryKeys.familyMembers(vars.deviceId) }),
	});
}

export function useRemoveFamilyMember(): UseMutationResult<
	unknown,
	Error,
	{ deviceId: string; memberId: string }
> {
	const qc = useQueryClient();
	return useMutation<unknown, Error, { deviceId: string; memberId: string }>({
		mutationFn: ({ deviceId, memberId }) => removeFamilyMember(deviceId, memberId),
		onSuccess: (_data, vars) =>
			qc.invalidateQueries({ queryKey: queryKeys.familyMembers(vars.deviceId) }),
	});
}
