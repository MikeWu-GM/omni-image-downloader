import { beforeEach, describe, expect, it, mock } from 'bun:test';
import html, { render } from '../html.js';
import { mockChrome, mockDOM } from '../test-helpers.js';
import {
	allImages,
	downloadConfirmationIsShown,
	folderName,
	imagesCache,
	isFolderCustomized,
	newFileName,
	saveSourceUrl,
	selectedImages,
	showDownloadConfirmation,
	tab,
} from './data.js';
import { Footer } from './Footer.js';

mockDOM();

describe('Footer component', () => {
	let container: HTMLElement;
	let chrome: ReturnType<typeof mockChrome>;

	beforeEach(() => {
		chrome = mockChrome();
		(globalThis as any).chrome = chrome;

		container = document.createElement('div');
		document.body.appendChild(container);

		imagesCache.value = document.createElement('div');
		allImages.value = ['https://example.com/1.jpg', 'https://example.com/2.jpg'];
		selectedImages.value = ['https://example.com/1.jpg', 'https://example.com/2.jpg'];
		tab.value = 'matching';
		folderName.value = '';
		isFolderCustomized.value = false;
		newFileName.value = '';
		saveSourceUrl.value = true;
		showDownloadConfirmation.value = true;
		downloadConfirmationIsShown.value = false;
	});

	it('sanitizes subfolder and rename inputs while marking folder as customized', () => {
		render(html`<${Footer} />`, container);

		const subfolderInput = container.querySelector('#subfolder_name_input') as HTMLInputElement;
		expect(subfolderInput).not.toBeNull();
		subfolderInput.value = 'my:folder*name?';
		subfolderInput.selectionStart = 5;
		subfolderInput.dispatchEvent(new (window as any).Event('change'));

		expect(isFolderCustomized.value).toBe(true);
		expect(folderName.value).toBe('myfoldername');

		const renameInput = container.querySelector('#rename_pattern_input') as HTMLInputElement;
		expect(renameInput).not.toBeNull();
		renameInput.value = 'photo<>:"|?*';
		renameInput.selectionStart = 6;
		renameInput.dispatchEvent(new (window as any).Event('change'));

		expect(newFileName.value).toBe('photo');
	});

	it('renders DownloadConfirmation when downloadConfirmationIsShown is true and closes on Cancel', () => {
		downloadConfirmationIsShown.value = true;
		render(html`<${Footer} />`, container);

		expect(container.textContent).toContain('2 popup windows');

		const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel');
		expect(cancelBtn).toBeDefined();
		cancelBtn!.click();
		expect(downloadConfirmationIsShown.value).toBe(false);
	});

	it('exposes max_concurrent_downloads input in Footer and clamps values between 1 and 20', async () => {
		const dataModule = await import('./data.js');
		render(html`<${Footer} />`, container);

		const concurrencyInput = container.querySelector('#max_concurrent_downloads_input') as HTMLInputElement;
		expect(concurrencyInput).not.toBeNull();
		expect(concurrencyInput.value).toBe('4');

		concurrencyInput.value = '8';
		concurrencyInput.dispatchEvent(new (window as any).Event('change'));
		expect((dataModule as any).maxConcurrentDownloads?.value).toBe(8);

		concurrencyInput.value = '99';
		concurrencyInput.dispatchEvent(new (window as any).Event('change'));
		expect((dataModule as any).maxConcurrentDownloads?.value).toBe(20);

		concurrencyInput.value = '0';
		concurrencyInput.dispatchEvent(new (window as any).Event('change'));
		expect((dataModule as any).maxConcurrentDownloads?.value).toBe(1);
	});
});
