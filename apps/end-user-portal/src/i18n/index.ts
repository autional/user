import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { registerUiI18n } from '@autional/ui/i18n';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

const resources = {
	'zh-CN': { translation: zhCN },
	'en-US': { translation: enUS },
};

// Unified flat-key format: all locale keys use dot-delimited paths (e.g. "nav.overview").
// keySeparator: false ensures dots in keys are treated as literal characters, not path separators.
i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources,
		fallbackLng: 'zh-CN',
		supportedLngs: ['zh-CN', 'en-US'],
		keySeparator: false,
		interpolation: { escapeValue: false },
		detection: {
			order: ['localStorage', 'navigator'],
			caches: ['localStorage'],
			lookupLocalStorage: 'end-user-portal-lang',
		},
	});

registerUiI18n(i18n);

// 同步 <html lang> —— 换语言后必须更新 documentElement.lang。
// 两件事都靠它：① a11y（WCAG 3.1.1 要求页面声明语言与实际正文一致；index.html 里硬编码的是 zh-CN，
// 用户切成英文后那个声明就是错的，读屏器会按中文念英文）；② 设计系统的 ErrorBoundary 字典按这个属性选语言 ——
// 没有它，错误页永远只会是中文。authenticator 早就有这 7 行，这里是补齐。
const syncHtmlLang = (lng: string | undefined) => {
	if (typeof document !== 'undefined') {
		document.documentElement.lang = lng || 'zh-CN';
	}
};
i18n.on('languageChanged', syncHtmlLang);
// 初始化完成后立即同步一次（覆盖 index.html 硬编码的 lang）
if (i18n.isInitialized) {
	syncHtmlLang(i18n.language);
} else {
	i18n.on('initialized', syncHtmlLang);
}

export default i18n;
