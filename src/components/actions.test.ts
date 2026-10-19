import { beforeEach, describe, expect, it } from 'bun:test';
import { mockChrome, mockDOM } from '../test-helpers';

mockDOM();

let chrome: ReturnType<typeof mockChrome>;

beforeEach(() => {
	chrome = mockChrome();
	(globalThis as any).chrome = chrome;
});

describe('openImage', () => {
	it('opens a regular image URL as is', async () => {
		const { openImage } = await import('./actions.js');
		await openImage('https://example.com/a.png');

		expect(chrome.tabs.create.mock.calls).toEqual([[{ url: 'https://example.com/a.png', active: false }]]);
	});

	it('opens a data: URL as a blob, because browsers refuse data: URLs in tabs', async () => {
		const { openImage } = await import('./actions.js');
		await openImage(`data:image/webp;base64,${btoa('webp bytes')}`);

		const { url } = chrome.tabs.create.mock.calls[0][0];
		expect(url).toStartWith('blob:');
		const blob = await (await fetch(url)).blob();
		expect([blob.type, await blob.text()]).toEqual(['image/webp', 'webp bytes']);
	});
});

describe('downloadImages', () => {
	it('sends download message with source_url_file option when saveSourceUrl is true', async () => {
		const { downloadImages } = await import('./actions.js');
		const { folderName, pageTitle, pageUrl, saveSourceUrl } = await import('./data.js');

		folderName.value = 'my_gallery';
		pageUrl.value = 'https://example.com/art';
		pageTitle.value = 'Art Gallery';
		saveSourceUrl.value = true;

		let sentMessage: any;
		chrome.runtime.sendMessage = ((message: any, cb: any) => {
			sentMessage = message;
			cb?.();
		}) as any;

		await downloadImages(['https://example.com/1.jpg']);

		expect(sentMessage.type).toBe('downloadImages');
		expect(sentMessage.imagesToDownload).toEqual(['https://example.com/1.jpg']);
		expect(sentMessage.options.folder_name).toBe('my_gallery');
		expect(sentMessage.options.source_url_file.filename).toBe('my_gallery/source.html');
		expect(sentMessage.options.source_url_file.url).toStartWith('data:text/html;charset=utf-8,');
	});
});

describe('maybeDownloadImages & triggerDownload', () => {
	it('shows download confirmation when showDownloadConfirmation is true and multiple images selected', async () => {
		const { maybeDownloadImages } = await import('./actions.js');
		const { allImages, imagesCache, selectedImages, tab, showDownloadConfirmation, downloadConfirmationIsShown } =
			await import('./data.js');

		imagesCache.value = document.createElement('div');
		const imgs = ['https://example.com/1.jpg', 'https://example.com/2.jpg'];
		tab.value = 'matching';
		allImages.value = imgs;
		selectedImages.value = imgs;
		showDownloadConfirmation.value = true;
		downloadConfirmationIsShown.value = false;

		maybeDownloadImages();

		expect(downloadConfirmationIsShown.value).toBe(true);
	});

	it('triggers download directly when showDownloadConfirmation is false', async () => {
		const { maybeDownloadImages } = await import('./actions.js');
		const { allImages, selectedImages, tab, showDownloadConfirmation, downloadConfirmationIsShown } =
			await import('./data.js');

		const imgs = ['https://example.com/1.jpg'];
		tab.value = 'matching';
		allImages.value = imgs;
		selectedImages.value = imgs;
		showDownloadConfirmation.value = false;
		downloadConfirmationIsShown.value = false;

		let sent = false;
		chrome.runtime.sendMessage = ((message: any, cb: any) => {
			sent = true;
			cb?.();
		}) as any;

		maybeDownloadImages();

		expect(sent).toBe(true);
		showDownloadConfirmation.value = true;
	});
});
