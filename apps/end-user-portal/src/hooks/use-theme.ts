import { useTheme as useSharedTheme } from '@autional/ui';
import type { Theme } from '@autional/ui';

export type { Theme };

export function useTheme() {
	const { theme, toggle } = useSharedTheme();
	return { isDark: theme === 'dark', theme, toggle };
}
