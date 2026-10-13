import { useCallback } from 'react';
import i18n from '@/i18n';

export type SupportedLanguage = 'zh-CN' | 'en-US';

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
	'zh-CN': '简体中文', // i18n-exempt: 语言切换器显示语言本名（endonym），不随当前语言翻译
	'en-US': 'English',
};

export function useLanguage() {
	const current = (i18n.language || 'zh-CN') as SupportedLanguage;

	const setLanguage = useCallback((lang: SupportedLanguage) => {
		i18n.changeLanguage(lang);
		localStorage.setItem('end-user-portal-lang', lang);
	}, []);

	return {
		current,
		setLanguage,
		languages: Object.entries(LANGUAGE_LABELS).map(([code, label]) => ({
			code: code as SupportedLanguage,
			label,
		})),
	};
}
