import { describe, it, expect, vi } from 'vitest';

vi.mock('@autional/shared', () => ({
	useAuthStore: vi.fn(),
	getAccessToken: vi.fn(() => null),
	apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { queryKeys } from '@/hooks/queries';

describe('queryKeys', () => {
	it('profile matches ["profile"]', () => {
		expect(queryKeys.profile).toEqual(['profile']);
	});

	it('devices matches ["devices"]', () => {
		expect(queryKeys.devices).toEqual(['devices']);
	});

	it('sessions matches ["sessions"]', () => {
		expect(queryKeys.sessions).toEqual(['sessions']);
	});

	it('mfa("user1") matches ["mfa", "user1"]', () => {
		expect(queryKeys.mfa('user1')).toEqual(['mfa', 'user1']);
	});

	it('auditLogs({ page: 1 }) matches ["audit-logs", { page: 1 }]', () => {
		expect(queryKeys.auditLogs({ page: 1 })).toEqual(['audit-logs', { page: 1 }]);
	});

	it('passkeys matches ["passkeys"]', () => {
		expect(queryKeys.passkeys).toEqual(['passkeys']);
	});

	it('oauthConnections("user1") matches ["oauth-connections", "user1"]', () => {
		expect(queryKeys.oauthConnections('user1')).toEqual(['oauth-connections', 'user1']);
	});

	it('wallet("user1") matches ["wallet", "user1"]', () => {
		expect(queryKeys.wallet('user1')).toEqual(['wallet', 'user1']);
	});

	it('points("user1") matches ["points", "user1"]', () => {
		expect(queryKeys.points('user1')).toEqual(['points', 'user1']);
	});
});
