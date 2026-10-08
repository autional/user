export function SkeletonCard({ className = '' }: { className?: string }) {
	return (
		<div className={`animate-pulse rounded-lg border border-neutral-200 bg-white p-5 ${className}`}>
			<div className="flex items-center gap-3">
				<div className="h-10 w-10 rounded-md bg-neutral-200" />
				<div className="flex-1 space-y-2">
					<div className="h-3 w-1/2 rounded-xs bg-neutral-200" />
					<div className="h-5 w-1/3 rounded-xs bg-neutral-300" />
				</div>
			</div>
		</div>
	);
}

export function SkeletonRow({ className = '' }: { className?: string }) {
	return (
		<div className={`animate-pulse rounded-lg border border-neutral-200 bg-white p-5 ${className}`}>
			<div className="flex items-center gap-4">
				<div className="h-10 w-10 rounded-full bg-neutral-200" />
				<div className="flex-1 space-y-2">
					<div className="h-4 w-1/3 rounded-xs bg-neutral-200" />
					<div className="h-3 w-2/3 rounded-xs bg-neutral-100" />
				</div>
				<div className="flex gap-2">
					<div className="h-8 w-16 rounded-xs bg-neutral-200" />
					<div className="h-8 w-16 rounded-xs bg-neutral-200" />
				</div>
			</div>
		</div>
	);
}

export function SkeletonCircle({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
	const sizeClasses = { sm: 'h-6 w-6', md: 'h-10 w-10', lg: 'h-14 w-14' };
	return <div className={`animate-pulse rounded-full bg-neutral-200 ${sizeClasses[size]}`} />;
}
