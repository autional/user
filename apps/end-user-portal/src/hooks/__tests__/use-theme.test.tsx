import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { ThemeProvider } from '@autional/ui';

let store: Map<string, string>;

function createLocalStorageMock() {
	return {
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => store.set(key, value)),
		removeItem: vi.fn((key: string) => store.delete(key)),
		clear: vi.fn(() => store.clear()),
	};
}

function createMatchMediaMock(matches: boolean) {
	return vi
		.fn()
		.mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() });
}

function wrapper({ children }: { children: React.ReactNode }) {
	return <ThemeProvider storageKey="end-user-portal-theme">{children}</ThemeProvider>;
}

describe('useTheme', () => {
	beforeEach(() => {
		store = new Map<string, string>();
		vi.stubGlobal('localStorage', createLocalStorageMock());
		vi.stubGlobal('matchMedia', createMatchMediaMock(false));

		document.documentElement.classList.remove('dark');
		document.documentElement.removeAttribute('data-theme');
	});

	async function loadUseTheme() {
		const mod = await import('@/hooks/use-theme');
		return mod.useTheme;
	}

	it('returns light mode by default when localStorage is empty', async () => {
		const useTheme = await loadUseTheme();

		const { result } = renderHook(() => useTheme(), { wrapper });

		expect(result.current.isDark).toBe(false);
	});

	it('returns dark mode when localStorage has dark', async () => {
		store.set('end-user-portal-theme', 'dark');
		const useTheme = await loadUseTheme();

		const { result } = renderHook(() => useTheme(), { wrapper });

		expect(result.current.isDark).toBe(true);
	});

	it('toggles isDark from false to true', async () => {
		const useTheme = await loadUseTheme();
		const { result } = renderHook(() => useTheme(), { wrapper });

		expect(result.current.isDark).toBe(false);

		act(() => {
			result.current.toggle();
		});

		expect(result.current.isDark).toBe(true);
	});

	it('toggle persists to localStorage', async () => {
		const useTheme = await loadUseTheme();
		const { result } = renderHook(() => useTheme(), { wrapper });

		act(() => {
			result.current.toggle();
		});

		expect(store.get('end-user-portal-theme')).toBe('dark');
	});

	it('toggle applies dark class to document.documentElement', async () => {
		const useTheme = await loadUseTheme();
		const { result } = renderHook(() => useTheme(), { wrapper });

		act(() => {
			result.current.toggle();
		});

		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	});

	it('toggle removes dark class when switching back to light', async () => {
		store.set('end-user-portal-theme', 'dark');
		const useTheme = await loadUseTheme();
		const { result } = renderHook(() => useTheme(), { wrapper });

		expect(result.current.isDark).toBe(true);

		act(() => {
			result.current.toggle();
		});

		expect(result.current.isDark).toBe(false);
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(document.documentElement.getAttribute('data-theme')).toBe('light');
	});
});
