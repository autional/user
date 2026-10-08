'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth, extractApiErrorMessage, extractList, apiClient } from '@autional/shared';
import * as Generated from '@autional/shared/generated/api';
import type { FileMetadataResponse, FolderMetadataResponse } from '@autional/shared/generated/types';
import { SectionCard, AppPageHeader, LoadingScreen, ErrorState, EmptyState, Modal, Input } from '@autional/ui';
import { useToast } from '@/hooks/use-toast';
import { isNotFoundError } from '@/lib/api-error';
import {
	FolderOpen,
	File,
	Upload,
	Download,
	Trash2,
	FolderPlus,
	Copy,
	ArrowUp,
	Search,
	RefreshCw,
	MoreVertical,
	Share2,
} from 'lucide-react';

type Entry =
	| (FileMetadataResponse & { _type: 'file' })
	| (FolderMetadataResponse & { _type: 'folder' });

function formatBytes(bytes?: number): string {
	if (!bytes) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	let size = bytes;
	while (size >= 1024 && i < units.length - 1) {
		size /= 1024;
		i++;
	}
	return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(d?: string): string {
	if (!d) return '-';
	return new Date(d).toLocaleDateString();
}

export default function StoragePage() {
	const { t } = useTranslation();
	const toast = useToast();
	const qc = useQueryClient();
	const { userId } = useAuth();
	const [currentFolder, setCurrentFolder] = useState('root');
	const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
	const [searchQuery, setSearchQuery] = useState('');
	const [contextMenu, setContextMenu] = useState<{ entry: Entry; x: number; y: number } | null>(
		null,
	);
	const [showCreateFolder, setShowCreateFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState('');
	const [renameTarget, setRenameTarget] = useState<Entry | null>(null);
	const [renameName, setRenameName] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { data: quotaData, isLoading: quotaLoading } = useQuery({
		queryKey: ['storage', 'quota'],
		queryFn: async () => {
			const res = await Generated.storageQuota();
			return res as { usedBytes?: number; quotaBytes?: number; usagePercent?: number };
		},
		staleTime: 30_000,
	});

	const {
		data: folderData,
		isLoading: folderLoading,
		isFetching: folderFetching,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ['storage', 'folder', currentFolder],
		queryFn: async () => {
			// root 无 folder 记录（虚拟根目录）；根目录内容 = parent_id IS NULL，
			// include_directories=true 使根目录文件夹与文件同列（U365 目录浏览）
			if (currentFolder === 'root') {
				const res = await Generated.files({ page_size: 100, include_directories: true });
				return { folder: undefined, contents: extractList<FileMetadataResponse>(res) } as {
					folder?: FolderMetadataResponse;
					contents?: FileMetadataResponse[];
				};
			}
			const res = await Generated.storageFoldersByFolders(currentFolder);
			return res as {
				folder?: FolderMetadataResponse;
				contents?: FileMetadataResponse[];
			};
		},
		enabled: !!currentFolder,
	});

	const createFolderMut = useMutation({
		mutationFn: (name: string) =>
			Generated.storageFoldersPost({
				name,
				parentId: currentFolder === 'root' ? undefined : currentFolder,
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['storage', 'folder', currentFolder] });
			toast.success(t('storage.folderCreated'));
			setShowCreateFolder(false);
			setNewFolderName('');
		},
		onError: (e: unknown) => toast.error(extractApiErrorMessage(e, t('storage.folderCreateError'))),
	});

	const deleteEntryMut = useMutation({
		mutationFn: async (entry: Entry) => {
			if (entry._type === 'folder') await Generated.storageFoldersByFoldersDelete(entry.folderId!);
			else await Generated.filesByFilesDelete(entry.fileId!);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['storage', 'folder', currentFolder] });
			toast.success(t('storage.deleted'));
		},
		onError: (e: unknown) => toast.error(extractApiErrorMessage(e, t('storage.deleteError'))),
	});

	const renameEntryMut = useMutation({
		mutationFn: async (params: { entry: Entry; name: string }) => {
			if (params.entry._type === 'folder')
				await Generated.storageFoldersByFoldersPatch(params.entry.folderId!, { name: params.name });
			else await Generated.filesByFilesPatch(params.entry.fileId!, { name: params.name });
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['storage', 'folder', currentFolder] });
			toast.success(t('storage.renamed'));
			setRenameTarget(null);
		},
		onError: (e: unknown) => toast.error(extractApiErrorMessage(e, t('storage.renameError'))),
	});

	const shareMut = useMutation({
		mutationFn: (fileId: string) => Generated.filesShareByFilesPost(fileId, {}),
		onSuccess: (data: unknown) => {
			const shareUrl = (data as { shareUrl?: string })?.shareUrl;
			if (shareUrl) {
				navigator.clipboard.writeText(shareUrl);
				toast.success(t('storage.linkCopied'));
			}
		},
		onError: (e: unknown) => toast.error(extractApiErrorMessage(e, t('storage.shareError'))),
	});

	const downloadMut = useMutation({
		mutationFn: async (entry: Entry) => {
			if (entry._type !== 'file' || !entry.fileId) return;
			// 下载端点是二进制流（Content-Disposition: attachment），不存在 downloadUrl 字段；
			// 走带鉴权头的 apiClient 取 blob 再本地落盘（裸链接不带 Bearer，必 401）。
			const res = await apiClient.get(`/storage/api/v1/files/${entry.fileId}/download`, {
				responseType: 'blob',
			});
			const url = URL.createObjectURL(res.data as Blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = entry.name || 'download';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		},
		onError: (e: unknown) => toast.error(extractApiErrorMessage(e, t('storage.downloadError'))),
	});

	const handleUpload = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			try {
				const uploadData = {
					filename: file.name,
					parentId: currentFolder === 'root' ? undefined : currentFolder,
					contentType: file.type || 'application/octet-stream',
				};
				const res = await Generated.filesUploadUrlPost(uploadData);
				const uploadRes = res as { uploadUrl?: string; fileId?: string };
				if (uploadRes?.uploadUrl && uploadRes?.fileId) {
					await fetch(uploadRes.uploadUrl, {
						method: 'PUT',
						body: file,
						headers: { 'Content-Type': file.type || 'application/octet-stream' },
					});
					await Generated.filesUploadCompleteByFilesPost(uploadRes.fileId);
					qc.invalidateQueries({ queryKey: ['storage', 'folder', currentFolder] });
					qc.invalidateQueries({ queryKey: ['storage', 'quota'] });
					toast.success(t('storage.uploadSuccess'));
				}
			} catch (err: unknown) {
				toast.error(extractApiErrorMessage(err, t('storage.uploadError')));
			}
			if (fileInputRef.current) fileInputRef.current.value = '';
		},
		[currentFolder, qc, t, toast],
	);

	const navigateTo = useCallback(
		(id: string, name: string) => {
			setFolderStack((prev) => [
				...prev,
				{ id: currentFolder, name: folderData?.folder?.name || t('storage.myFiles') },
			]);
			setCurrentFolder(id);
			setSearchQuery('');
		},
		[currentFolder, folderData, t],
	);

	const navigateUp = useCallback(() => {
		if (folderStack.length === 0) return;
		const prev = folderStack[folderStack.length - 1];
		setFolderStack((s) => s.slice(0, -1));
		setCurrentFolder(prev.id);
		setSearchQuery('');
	}, [folderStack]);

	const navigateBreadcrumb = useCallback(
		(index: number) => {
			if (index < 0) {
				setCurrentFolder('root');
				setFolderStack([]);
				setSearchQuery('');
				return;
			}
			const target = folderStack[index];
			setFolderStack((s) => s.slice(0, index + 1));
			setCurrentFolder(target.id);
			setSearchQuery('');
		},
		[folderStack],
	);

	const breadcrumbs = [
		{ id: 'root', name: t('storage.myFiles') },
		...folderStack.map((f) => ({ id: f.id, name: f.name })),
		...(folderData?.folder && currentFolder !== 'root'
			? [{ id: currentFolder, name: folderData.folder.name || '...' }]
			: []),
	];

	// 条目对象须跨渲染保持引用稳定：菜单开合走 contextMenu?.entry === entry 引用比较，
	// 若此处每次渲染重建对象，setContextMenu 触发的重渲染立即失配 → 菜单永不显示（卡片操作全死）
	// is_directory=true 的行分派为 folder 条目（可进入 + 文件夹操作）；当前 folder 自身不再入列（U365）
	const entries: Entry[] = useMemo(
		() =>
			(folderData?.contents || []).map((f) =>
				f.isDirectory
					? ({ ...f, _type: 'folder' as const, folderId: f.fileId } as Entry)
					: ({ ...f, _type: 'file' as const } as Entry),
			),
		[folderData],
	);
	// Deduplicate by id
	const seen = new Set<string>();
	const uniqueEntries = entries.filter((e) => {
		const id = e._type === 'file' ? e.fileId : e.folderId;
		if (!id || seen.has(id)) return false;
		seen.add(id);
		return true;
	});
	const filtered = uniqueEntries.filter(
		(e) => !searchQuery || (e.name || '').toLowerCase().includes(searchQuery.toLowerCase()),
	);

	if (folderLoading || quotaLoading) return <LoadingScreen message={t('common.loadingData')} />;
	if (isError)
		return isNotFoundError(error) ? (
			<EmptyState
				title={t('storage.empty', '此文件夹暂无内容')}
				description={t('storage.emptyDesc', '上传文件或创建文件夹以开始使用')}
			/>
		) : (
			<ErrorState
				title={t('common.error')}
				description={extractApiErrorMessage(error, t('storage.loadError'))}
				onRetry={() => refetch()}
			/>
		);

	return (
		<div className="max-w-6xl mx-auto space-y-4" onClick={() => setContextMenu(null)}>
			<AppPageHeader title={t('storage.title')} />

			{/* Quota Bar */}
			{quotaData && (
				<SectionCard padding="sm">
					<div className="flex items-center justify-between text-sm mb-2">
						<span className="text-neutral-700">{t('storage.quota')}</span>
						<span className="font-mono text-neutral-800">
							{formatBytes(quotaData.usedBytes)} / {formatBytes(quotaData.quotaBytes)}
						</span>
					</div>
					<div className="w-full bg-neutral-300 rounded-full h-2">
						<div
							className="bg-[var(--color-brand)] h-2 rounded-full transition-all"
							style={{ width: `${Math.min(quotaData.usagePercent || 0, 100)}%` }}
						/>
					</div>
				</SectionCard>
			)}

			{/* Breadcrumb */}
			<div className="flex items-center gap-1.5 text-sm text-neutral-600 flex-wrap">
				{breadcrumbs.map((b, i) => (
					<span key={b.id} className="flex items-center gap-1.5">
						{i > 0 && <span className="text-neutral-300">/</span>}
						<button
							onClick={() => navigateBreadcrumb(i - 1)}
							className={`hover:text-[var(--color-brand)] hover:underline ${i === breadcrumbs.length - 1 ? 'text-neutral-900 font-medium' : ''}`}
						>
							{b.name}
						</button>
					</span>
				))}
			</div>

			{/* Toolbar */}
			<div className="flex items-center gap-2 flex-wrap">
				{/* 图标几何交给设计系统的 Input prefix 槽（第 61 轮）—— 原来这里手写着
				    absolute 图标 + 算出来的 pl-9（= 12 起点 + 16 图标 + 8 间隙）。 */}
				<div className="flex-1 min-w-[200px] max-w-sm">
					<Input
						type="text"
						size="sm"
						placeholder={t('storage.search')}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						prefix={<Search size={16} />}
					/>
				</div>
				{folderStack.length > 0 && (
					<button
						onClick={navigateUp}
						className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm hover:bg-neutral-50"
						title={t('storage.up')}
					>
						<ArrowUp size={16} />
					</button>
				)}
				<button
					onClick={() => refetch()}
					disabled={folderFetching}
					aria-label={t('storage.refresh')}
					className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm hover:bg-neutral-50 disabled:opacity-50"
					title={t('storage.refresh')}
				>
					<RefreshCw size={16} className={folderFetching ? 'animate-spin' : ''} />
				</button>
				<button
					onClick={() => setShowCreateFolder(true)}
					className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm hover:bg-neutral-50"
				>
					<FolderPlus size={16} />
					<span className="hidden sm:inline">{t('storage.newFolder')}</span>
				</button>
				<button
					onClick={() => fileInputRef.current?.click()}
					className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-brand)] text-white rounded-md text-sm hover:bg-brand/90"
				>
					<Upload size={16} />
					<span className="hidden sm:inline">{t('storage.upload')}</span>
				</button>
				<input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
			</div>

			{/* Content */}
			{uniqueEntries.length === 0 && !searchQuery ? (
				<EmptyState title={t('storage.empty')} description={t('storage.emptyDesc')} />
			) : filtered.length === 0 ? (
				<EmptyState title={t('storage.noResults')} />
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
					{filtered.map((entry) => {
						const id = entry._type === 'file' ? entry.fileId : entry.folderId;
						return (
							<div
								key={id}
								className="bg-white rounded-lg border p-4 transition-colors cursor-pointer relative group hover:border-neutral-300"
								onDoubleClick={() =>
									entry._type === 'folder' && id && navigateTo(id, entry.name || '')
								}
							>
								{/* Icon */}
								<div className="flex items-center justify-center mb-3">
									{entry._type === 'folder' ? (
										<FolderOpen size={40} className="text-amber-500" />
									) : (
										<File size={40} className="text-info" />
									)}
								</div>
								{/* Name */}
								<div className="text-sm font-medium text-center truncate mb-1" title={entry.name}>
									{entry.name}
								</div>
								{/* Meta */}
								<div className="text-xs text-neutral-600 text-center space-y-0.5">
									{entry._type === 'file' && entry.size !== undefined && (
										<div>{formatBytes(entry.size)}</div>
									)}
									<div>{formatDate(entry.updatedAt || entry.createdAt)}</div>
								</div>
								{/* Actions */}
								<div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
									<button
										onClick={(e) => {
											e.stopPropagation();
											setContextMenu(contextMenu?.entry === entry ? null : { entry, x: 0, y: 0 });
										}}
										className="p-1 rounded-xs hover:bg-neutral-200"
									>
										<MoreVertical size={14} />
									</button>
								</div>
								{/* Context Menu */}
								{contextMenu?.entry === entry && (
									<div
										className="absolute top-8 right-2 z-50 bg-white border rounded-lg shadow-brand py-1 min-w-[140px]"
										onClick={(e) => e.stopPropagation()}
									>
										{entry._type === 'file' && (
											<>
												<button
													onClick={() => downloadMut.mutate(entry)}
													className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50 flex items-center gap-2"
												>
													<Download size={14} /> {t('storage.download')}
												</button>
												<button
													onClick={() => shareMut.mutate(entry.fileId!)}
													className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50 flex items-center gap-2"
												>
													<Share2 size={14} /> {t('storage.share')}
												</button>
											</>
										)}
										{entry._type === 'folder' && (
											<button
												onClick={() => id && navigateTo(id, entry.name || '')}
												className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50 flex items-center gap-2"
											>
												<FolderOpen size={14} /> {t('storage.open')}
											</button>
										)}
										<button
											onClick={() => {
												setRenameTarget(entry);
												setRenameName(entry.name || '');
												setContextMenu(null);
											}}
											className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50 flex items-center gap-2"
										>
											<Copy size={14} /> {t('storage.rename')}
										</button>
										<hr className="my-1" />
										<button
											onClick={() => {
												deleteEntryMut.mutate(entry);
												setContextMenu(null);
											}}
											className="w-full text-left px-3 py-1.5 text-sm hover:bg-danger-soft text-danger flex items-center gap-2"
										>
											<Trash2 size={14} /> {t('common.delete')}
										</button>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{/* Create Folder Modal */}
			<Modal
				open={showCreateFolder}
				onClose={() => setShowCreateFolder(false)}
				title={t('storage.newFolder')}
				maxWidth="sm"
				footer={
					<>
						<button
							onClick={() => setShowCreateFolder(false)}
							className="px-4 py-2 border rounded-md text-sm"
						>
							{t('common.cancel')}
						</button>
						<button
							onClick={() => newFolderName.trim() && createFolderMut.mutate(newFolderName.trim())}
							disabled={createFolderMut.isPending || !newFolderName.trim()}
							className="px-4 py-2 bg-[var(--color-brand)] text-white rounded-md text-sm disabled:opacity-50"
						>
							{createFolderMut.isPending ? t('common.saving') : t('common.create')}
						</button>
					</>
				}
			>
				<input
					type="text"
					autoFocus
					value={newFolderName}
					onChange={(e) => setNewFolderName(e.target.value)}
					onKeyDown={(e) =>
						e.key === 'Enter' &&
						newFolderName.trim() &&
						createFolderMut.mutate(newFolderName.trim())
					}
					placeholder={t('storage.folderName')}
					className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
				/>
			</Modal>

			{/* Rename Modal */}
			<Modal
				open={!!renameTarget}
				onClose={() => setRenameTarget(null)}
				title={t('storage.rename')}
				maxWidth="sm"
				footer={
					<>
						<button
							onClick={() => setRenameTarget(null)}
							className="px-4 py-2 border rounded-md text-sm"
						>
							{t('common.cancel')}
						</button>
						<button
							onClick={() =>
								renameName.trim() &&
								renameEntryMut.mutate({ entry: renameTarget!, name: renameName.trim() })
							}
							disabled={renameEntryMut.isPending || !renameName.trim()}
							className="px-4 py-2 bg-[var(--color-brand)] text-white rounded-md text-sm disabled:opacity-50"
						>
							{renameEntryMut.isPending ? t('common.saving') : t('common.save')}
						</button>
					</>
				}
			>
				<input
					type="text"
					autoFocus
					value={renameName}
					onChange={(e) => setRenameName(e.target.value)}
					onKeyDown={(e) =>
						e.key === 'Enter' &&
						renameName.trim() &&
						renameEntryMut.mutate({ entry: renameTarget!, name: renameName.trim() })
					}
					className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
				/>
			</Modal>
		</div>
	);
}
