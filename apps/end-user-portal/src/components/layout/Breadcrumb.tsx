import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTenantSlug } from '@autional/shared';
import { Breadcrumb as SharedBreadcrumb } from '@autional/ui/antd';
import { buildNavHref } from '@/lib/nav';
import { ROUTES } from '@/lib/routes';
import { useRouteLabels } from '@/hooks/use-route-labels';

/**
 * 面包屑。
 *
 * 这里只剩**业务**：路由 → 文案的映射表（UP-82 起为全量，覆盖 ROUTES 全部路径 + 中间段）。
 * 机制（剥租户段、按段累积、中间段可点、末段纯文本、只有一项就不渲染）在设计系统那一份里 ——
 * 此前本站是 77 行**手写 nav + lucide 图标**，且只认完整路径、中间段不可点、最多两级；
 * 另外两个门户用的是 antd 的 Breadcrumb。收敛方向是少数向多数靠，所以这里换成了共同实现。
 */
export function Breadcrumb() {
	const { t } = useTranslation();
	const location = useLocation();
	const tenantSlug = useTenantSlug();

	// UP-82：原仅 13 条，communication/pushTokens/announcements/privacyImpact 等一批路由
	// 走父段直落或裸段显示。现按侧栏分组全量补齐，另含 /security/passkeys 中间段防裸段。
	// 映射表与 document.title 共用（useRouteLabels），避免两份文案漂移。
	const labels = useRouteLabels();

	return (
		<SharedBreadcrumb
			pathname={location.pathname}
			tenantSlug={tenantSlug}
			labels={labels}
			home={{ label: t('nav.overview'), href: buildNavHref(ROUTES.dashboard, tenantSlug) }}
			buildHref={(path) => buildNavHref(path, tenantSlug)}
		/>
	);
}
