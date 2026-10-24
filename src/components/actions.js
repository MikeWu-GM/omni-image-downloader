// @ts-check
import { generateSourceHtml } from '../utils.js';
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
		const sourceUrlFile =
			saveSourceUrl.value && pageUrl.value
				? {
						url:
							'data:text/html;charset=utf-8,' + encodeURIComponent(generateSourceHtml(pageUrl.value, pageTitle.value)),
						filename: (folderName.value ? `${folderName.value}/` : '') + 'source.html',
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

export const openImage = async (/** @type {string} */ url) => {
	// Browsers refuse to open `data:` URLs in a tab, but open a blob from the extension's own origin
	const tabUrl = url.startsWith('data:') ? URL.createObjectURL(await (await fetch(url)).blob()) : url;
	await chrome.tabs.create({ url: tabUrl, active: false });
};
