// @ts-check
import { generateSourceHtml } from '../utils.js';
import {
	currentSelectedImages,
	downloadConfirmationIsShown,
	downloadIsInProgress,
	folderName,
	newFileName,
	pageTitle,
	pageUrl,
	saveSourceUrl,
	showDownloadConfirmation,
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

		chrome.runtime.sendMessage(
			{
				type: 'downloadImages',
				imagesToDownload,
				options: {
					folder_name: folderName.value,
					new_file_name: newFileName.value,
					source_url_file: sourceUrlFile,
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
