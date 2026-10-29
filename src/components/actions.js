// @ts-check
import { generateSourceHtml, sanitizeSubfolderPath } from '../utils.js';
import {
	currentSelectedImages,
	downloadConfirmationIsShown,
	downloadIsInProgress,
	extractionScope,
	folderName,
	imageToTabMap,
	maxConcurrentDownloads,
	newFileName,
	pageTitle,
	pageUrl,
	saveSourceUrl,
	showDownloadConfirmation,
	subfolderPerTab,
} from './data.js';

export const triggerDownload = async () => {
	downloadIsInProgress.value = true;
	try {
		await downloadImages(currentSelectedImages.value);
	} finally {
		downloadIsInProgress.value = false;
	}
};

export const maybeDownloadImages = () => {
	if (showDownloadConfirmation.value && currentSelectedImages.value.length > 1) {
		downloadConfirmationIsShown.value = true;
	} else {
		triggerDownload();
	}
};

export const downloadImages = (/** @type {string[]} */ imagesToDownload) =>
	new Promise((resolve) => {
		const safeFolder = sanitizeSubfolderPath(folderName.value);
		const sourceUrlFile =
			saveSourceUrl.value && pageUrl.value
				? {
						url:
							'data:text/html;charset=utf-8,' + encodeURIComponent(generateSourceHtml(pageUrl.value, pageTitle.value)),
						filename: (safeFolder ? `${safeFolder}/` : '') + 'source.html',
					}
				: null;

		const isWindowScope = extractionScope.value === 'current_window';
		const subfolders =
			isWindowScope && subfolderPerTab.value
				? imagesToDownload.map((url) => {
						const info = imageToTabMap.value.get(url);
						return info ? info.folderName : '';
					})
				: undefined;

		console.info(`[ID-Download] 🚀 Sending download batch to serviceWorker:`, {
			count: imagesToDownload.length,
			folder_name: folderName.value,
			isWindowScope,
			subfolderPerTab: subfolderPerTab.value,
			subfoldersSample: subfolders ? subfolders.slice(0, 5) : 'none',
		});

		chrome.runtime.sendMessage(
			{
				type: 'downloadImages',
				imagesToDownload,
				options: {
					folder_name: folderName.value,
					new_file_name: newFileName.value,
					source_url_file: sourceUrlFile,
					subfolders,
					max_concurrent_downloads: maxConcurrentDownloads.value,
				},
			},
			resolve
		);
	});

const SAFE_RASTER_DATA_MIMES = new Set([
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/bmp',
	'image/x-icon',
	'image/vnd.microsoft.icon',
	'image/tiff',
	'image/apng',
]);

export const openImage = async (/** @type {string} */ url) => {
	if (!url || typeof url !== 'string') return;

	// Browsers refuse to open `data:` URLs in a tab; re-host only passive raster image MIME types
	// as temporary object URLs so active HTML/SVG payloads never execute under the extension origin.
	if (url.startsWith('data:')) {
		const headerMatch = url.match(/^data:([^;,]+)[;,]/i);
		const declaredMime = headerMatch ? headerMatch[1].trim().toLowerCase() : '';
		if (!SAFE_RASTER_DATA_MIMES.has(declaredMime)) {
			return;
		}
		const fetchedBlob = await (await fetch(url)).blob();
		const actualMime = (fetchedBlob.type || declaredMime).split(';')[0].trim().toLowerCase();
		if (!SAFE_RASTER_DATA_MIMES.has(actualMime)) {
			return;
		}
		const safeBlob = new Blob([await fetchedBlob.arrayBuffer()], { type: actualMime });
		const tabUrl = URL.createObjectURL(safeBlob);
		try {
			await chrome.tabs.create({ url: tabUrl, active: false });
		} finally {
			const revokeTimer = setTimeout(() => URL.revokeObjectURL(tabUrl), 60_000);
			/** @type {any} */ (revokeTimer)?.unref?.();
		}
		return;
	}

	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return;
	}
	await chrome.tabs.create({ url: parsed.href, active: false });
};
