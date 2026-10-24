// @ts-check
import html, { For, Show, useComputed, useSignal } from '../html.js';

import { isIncludedIn, isNotStrictEqual, stopPropagation } from '../utils.js';
import * as actions from './actions.js';
import { Checkbox } from './Checkbox.js';
import {
	columns,
	displayedImages,
	extractionScope,
	groupByTab,
	imageErrored,
	imageLoaded,
	normalizeExtension,
	selectedImages,
	tabGroups,
	toggleTabGroupCollapse,
	toggleTabGroupSelection,
	updateDetectedExtension,
} from './data.js';
import { useImageStats } from './useImageStats.js';
import { useScrollToEnd } from './useScrollToEnd.js';

/**
 * @typedef {import('./useImageStats.js').ImageStatsData} ImageStatsData
 * @typedef {import('./useImageStats.js').ImageStats} ImageStats
 */

/**
 * @typedef {import('./data.js').Options} Options
 */

/**
 * @typedef {Object} CSSProperties
 * @property {string} [minHeight]
 * @property {string} [backgroundImage]
 * @property {string} [backgroundRepeat]
 * @property {string} [backgroundSize]
 */

/**
 * @typedef {Object} ImagesProps
 * @property {string} [class]
 * @property {CSSProperties} [style]
 */

export function Images(/** @type {ImagesProps} */ { class: className = '', style, ...props }) {
	const isWindowGrouping = extractionScope.value === 'current_window' && groupByTab.value;

	if (isWindowGrouping && tabGroups.value.length > 0) {
		return html`
			<div class="${className} flex flex-col gap-3 p-2" style=${style} ...${props}>
				<${For} each=${tabGroups}>
					${(/** @type {import('./data.js').TabGroup} */ group) => html`
						<${TabGroupCard} key=${group.id} group=${group} />
					`}
				<//>
			</div>
		`;
	}

	return html`
		<div
			class="${className} grid gap-2 p-2"
			style=${{ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))`, ...style }}
			...${props}
		>
			<${For} each=${displayedImages}>
				${(/** @type {string} */ imageUrl) => html`
					<${ImageCard}
						key=${imageUrl}
						imageUrl=${imageUrl}
						onClick=${() => {
							selectedImages.value = selectedImages.value.includes(imageUrl)
								? selectedImages.value.filter(isNotStrictEqual(imageUrl))
								: [...selectedImages.value, imageUrl];
						}}
					/>
				`}
			<//>
		</div>
	`;
}

function TabGroupCard(/** @type {{ group: import('./data.js').TabGroup }} */ { group }) {
	const tabDisplayedImages = group.allImages.filter(isIncludedIn(displayedImages.value));
	const isAllSelected = tabDisplayedImages.length > 0 && tabDisplayedImages.every(isIncludedIn(selectedImages.value));
	const isPartiallySelected = tabDisplayedImages.some(isIncludedIn(selectedImages.value)) && !isAllSelected;

	return html`
		<div
			class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/60"
		>
			<!-- Tab Group Header -->
			<div
				class="tab-group-header flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-xs select-none dark:border-slate-800 dark:bg-slate-800/80"
			>
				<div
					class="flex flex-1 cursor-pointer items-center gap-2 overflow-hidden"
					onClick=${() => toggleTabGroupCollapse(group.id)}
					title="Click to expand/collapse this tab group"
				>
					<span
						class="text-3xs ${group.collapsed ? '-rotate-90' : 'rotate-0'} inline-block text-slate-400 transition-transform"
					>
						▼
					</span>
					${
						group.favIconUrl
							? html`<img
									src=${group.favIconUrl}
									class="size-4 shrink-0 rounded-xs object-contain"
									onError=${(/** @type {any} */ e) => {
										if (e.currentTarget) e.currentTarget.style.display = 'none';
									}}
								/>`
							: html`<span class="text-xs">📄</span>`
					}
					<div class="flex flex-col overflow-hidden">
						<div class="flex items-center gap-1.5 overflow-hidden">
							<span class="truncate font-semibold text-slate-800 dark:text-slate-100" title=${group.title}>
								${group.title || group.hostname || `Tab ${group.id}`}
							</span>
							<span
								class="text-3xs rounded bg-sky-100/80 px-1 py-0.5 font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-300"
								title="Target subfolder for this tab"
							>
								📁 ${group.folderName}
							</span>
						</div>
						<span class="text-3xs truncate text-slate-400 dark:text-slate-500" title=${group.url}>
							${group.hostname || group.url}
						</span>
					</div>
				</div>

				<div class="flex shrink-0 items-center gap-2">
					<span
						class="text-3xs rounded-full bg-slate-200/80 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300"
					>
						${tabDisplayedImages.length} images
					</span>

					<${Checkbox}
						class="flex items-center"
						checked=${isAllSelected}
						indeterminate=${isPartiallySelected}
						disabled=${tabDisplayedImages.length === 0}
						title="Select or unselect all images from this tab"
						onChange=${(/** @type {Event} */ e) => {
							const { checked } = /** @type {HTMLInputElement} */ (e.currentTarget);
							toggleTabGroupSelection(group.id, checked);
						}}
					/>
				</div>
			</div>

			<!-- Tab Images Body -->
			${
				!group.collapsed
					? tabDisplayedImages.length === 0
						? html`
								<div class="p-4 text-center text-xs text-slate-400 italic dark:text-slate-500">
									No images matching current filters in this tab
								</div>
							`
						: html`
								<div
									class="grid gap-2 p-2"
									style=${{ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }}
								>
									${tabDisplayedImages.map(
										(imageUrl) => html`
											<${ImageCard}
												key=${imageUrl}
												imageUrl=${imageUrl}
												onClick=${() => {
													selectedImages.value = selectedImages.value.includes(imageUrl)
														? selectedImages.value.filter(isNotStrictEqual(imageUrl))
														: [...selectedImages.value, imageUrl];
												}}
											/>
										`
									)}
								</div>
							`
					: null
			}
		</div>
	`;
}

function ImageCard(/** @type {{ imageUrl: string }} */ { imageUrl, ...props }) {
	const stats = useImageStats(imageUrl, updateDetectedExtension);
	const statsAreLoaded = useComputed(() => stats.data.value.status === 'loaded');
	const retryCount = useSignal(0);
	const isSelected = selectedImages.value.includes(imageUrl);

	return html`
		<div
			class="group relative cursor-pointer flex justify-center items-center overflow-hidden rounded-xl shadow-md border contain-paint bg-[conic-gradient(var(--color-slate-100)_90deg,var(--color-slate-300)_90deg_180deg,var(--color-slate-100)_180deg_270deg,var(--color-slate-300)_270deg)] dark:bg-[conic-gradient(var(--color-slate-800)_90deg,var(--color-slate-700)_90deg_180deg,var(--color-slate-800)_180deg_270deg,var(--color-slate-700)_270deg)] ${isSelected ? 'border-sky-600 dark:border-sky-400 outline-2 outline-sky-600 dark:outline-sky-400' : 'border-slate-300 dark:border-slate-700'}"
			style=${{
				minHeight: `192px`,
				backgroundRepeat: 'repeat',
				backgroundSize: '12px 12px',
			}}
			...${props}
		>
			${
				stats.data.value.status === 'error'
					? html`<${ImageError}
							onClick=${() => {
								retryCount.value++;
								stats.reset();
							}}
						/>`
					: html`<img
							key=${retryCount}
							loading="lazy"
							decoding="async"
							src=${imageUrl}
							onLoad=${(/** @type {Event}  */ e) => {
								const img = /** @type {HTMLImageElement} */ (e.currentTarget);
								imageLoaded(imageUrl, img.naturalWidth, img.naturalHeight);
								stats.onLoad(e);
							}}
							onError=${(/** @type {Event}  */ e) => {
								imageErrored(imageUrl);
								stats.onError();
							}}
						/>`
			}

			<div
				class=${`
					absolute top-1 left-1
					w-7 h-7
					rounded-md border shadow-md
					${isSelected ? 'border-sky-600 bg-sky-600' : 'hidden border-slate-400 bg-white'}
					group-hover:block
					after:content-['']
					after:absolute after:top-1/2 after:left-1/2
					after:-translate-x-1/2 after:-translate-y-2/3
					after:w-4.5 after:h-2.5
					after:border-3 after:border-t-0 after:border-r-0
					after:-rotate-45
					${isSelected ? 'after:border-white' : 'after:border-slate-400'}
				`}
			></div>

			<div class="absolute top-1 right-1 hidden group-hover:flex gap-1">
				<${OpenImageButton} imageUrl=${imageUrl} onClick=${stopPropagation} />
				<${DownloadImageButton} imageUrl=${imageUrl} onClick=${stopPropagation} />
			</div>

			<div class="absolute right-1 bottom-1 left-1">
				<!-- Toggle opacity - toggling display messes with the input content scrolling -->
				<${ImageUrlTextbox} class="opacity-0 group-hover:opacity-100 w-full" url=${imageUrl} />

				<div class="group-hover:hidden flex gap-1">
					<${ImageStat} class="uppercase">${normalizeExtension(stats.data.value.extension)}</${ImageStat}>

					<${Show} when=${statsAreLoaded}>
						<${ImageStat}>${stats.data.value.width}×${stats.data.value.height}</${ImageStat}>
						<${ImageStat} class="small-caps lowercase">${stats.data.value.size ? stats.data.value.size.formatted : ''}</${ImageStat}>
					<//>
				</div>
			</div>
		</div>
	`;
}

function ImageError(/** @type {{ onClick?: (e: MouseEvent) => void }} */ { onClick, ...props }) {
	return html`
		<button
			class="m-2 flex h-auto flex-col items-center justify-center gap-1 border-red-300 bg-red-50 p-4 text-xs text-red-600 hover:bg-red-100"
			type="button"
			title="Retry loading image"
			onClick=${(/** @type {MouseEvent} e */ e) => {
				e.stopPropagation();
				onClick?.(e);
			}}
			...${props}
		>
			<div><${Circle} class="bg-red-600 text-white">×<//> Error loading image</div>
			Click to retry
		</button>
	`;
}

function Circle(/** @type {{ class?: string, children?: any }} */ { class: className = '', children, ...props }) {
	return html`
		<span
			class="corner-round ${className} inline-block h-4 min-w-4 rounded-full px-1 text-center font-bold"
			...${props}
		>
			${children}
		</span>
	`;
}

// `data:` and `blob:` URLs mean nothing outside this browser - and a `data:` URL is the whole image as text.
const isBrowserOnlyUrl = (/** @type {string} */ url) => url.startsWith('data:') || url.startsWith('blob:');

// A `blob:` URL is left only where `readBlobUrls()` couldn't read it, and nothing outside the page can either
const isUnreadableBlobUrl = (/** @type {string} */ url) => url.startsWith('blob:');

function OpenImageButton(
	/** @type {{ imageUrl: string, onClick?: (e: MouseEvent) => void }} */ { imageUrl, onClick, ...props }
) {
	function openNewTab(/** @type {MouseEvent} */ e) {
		actions.openImage(imageUrl);
		if (onClick) {
			onClick(e);
		}
	}

	return html`
		<button
			class="h-7 w-7 rounded bg-size-[20px] bg-center bg-no-repeat shadow-md"
			style=${{ backgroundImage: 'url("/images/open.svg")' }}
			type="button"
			disabled=${isUnreadableBlobUrl(imageUrl)}
			title="Open in new tab"
			onClick=${openNewTab}
			...${props}
		/>
	`;
}

function DownloadImageButton(
	/** @type {{ imageUrl: string, onClick?: (e: MouseEvent) => void }} */ { imageUrl, onClick, ...props }
) {
	function downloadImages(/** @type {MouseEvent} */ e) {
		actions.downloadImages([imageUrl]);
		if (onClick) {
			onClick(e);
		}
	}

	return html`
		<button
			class="h-7 w-7 rounded bg-size-[20px] bg-center bg-no-repeat shadow-md"
			style=${{ backgroundImage: 'url("/images/download.svg")' }}
			type="button"
			title="Download"
			onClick=${downloadImages}
			...${props}
		/>
	`;
}

function ImageStat(/** @type {{ class?: string; children?: any }} */ { class: className = '', children, ...props }) {
	return html`
		<small class="${className} rounded bg-slate-950/80 px-1 text-white empty:hidden" ...${props}>${children}</small>
	`;
}

function ImageUrlTextbox(/** @type {{ class?: string; url: string }} */ { class: className = '', url, ...props }) {
	const inputRef = useScrollToEnd();
	const isTextboxDisabled = isBrowserOnlyUrl(url);
	const displayedUrl = isTextboxDisabled ? `${url.slice(0, url.indexOf(':') + 1)}…` : url;

	function setInputValue(/** @type {string} */ value) {
		if (inputRef.current) {
			inputRef.current.value = value;
		}
	}

	return html`
		<div class="${className} flex">
			<input
				ref=${inputRef}
				class="flex-1 rounded-r-none border-r-0"
				type="text"
				readonly
				disabled=${isTextboxDisabled}
				value=${displayedUrl}
				onClick=${(/** @type {MouseEvent} */ e) => {
					e.stopPropagation();
					/** @type {HTMLInputElement} */ (e.currentTarget).select();
				}}
				...${props}
			/>

			<button
				type="button"
				class="w-8 rounded-l-none bg-center bg-no-repeat"
				style=${{ backgroundImage: 'url("/images/copy.svg")' }}
				disabled=${isUnreadableBlobUrl(url)}
				title="Copy image URL to clipboard"
				onClick=${async (/** @type {Event} */ e) => {
					e.stopPropagation();
					await window.navigator.clipboard.writeText(url);
					setInputValue('Copied URL!');
					setTimeout(() => setInputValue(displayedUrl), 2000);
				}}
			/>
		</div>
	`;
}
