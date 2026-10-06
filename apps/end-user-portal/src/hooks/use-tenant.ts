import { useCallback } from 'react';
import { useAuthStore, getCurrentTenantId } from '@autional/shared';
import { useQueryClient } from '@tanstack/react-query';

export function useTenant() {
	const { tenants, currentTenantId, setCurrentTenant } = useAuthStore();
	const queryClient = useQueryClient();

	const switchTenant = useCallback(
		(tenantId: string) => {
			setCurrentTenant(tenantId);
			queryClient.clear();
			queryClient.invalidateQueries();
		},
		[setCurrentTenant, queryClient],
	);

	const currentTenant = tenants.find((t) => t.id === currentTenantId) || tenants[0] || null;

	return {
		tenants,
		currentTenantId: currentTenantId || getCurrentTenantId(),
		currentTenant,
		switchTenant,
	};
}
