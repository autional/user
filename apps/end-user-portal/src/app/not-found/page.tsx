'use client';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FileQuestion } from 'lucide-react';
import { Result } from '@autional/ui';

export default function NotFoundPage() {
	const { t } = useTranslation();
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<Result
				variant="info"
				className="w-full max-w-md"
				icon={<FileQuestion className="h-9 w-9" />}
				title={<span className="text-4xl font-bold">404</span>}
				description={
					<>
						<span className="block">{t('notFound.title')}</span>
						<span className="mt-1 block text-xs">{t('notFound.description')}</span>
					</>
				}
				action={
					<Link
						to="/"
						className="rounded-md bg-primary-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
					>
						{t('notFound.back')}
					</Link>
				}
			/>
		</div>
	);
}
