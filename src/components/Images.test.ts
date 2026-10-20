import { beforeEach, describe, expect, it, mock } from 'bun:test';
import html, { render } from '../html.js';
import { mockChrome, mockDOM } from '../test-helpers.js';
import { allImages, columns, displayedImages, imagesCache, selectedImages, tab } from './data.js';
import { Images } from './Images.js';

mockDOM();

describe('Images component', () => {
	let container: HTMLElement;
	let chrome: ReturnType<typeof mockChrome>;

	beforeEach(() => {
		chrome = mockChrome();
		(globalThis as any).chrome = chrome;

		container = document.createElement('div');
		document.body.appendChild(container);

		imagesCache.value = document.createElement('div');
		tab.value = 'matching';
		columns.value = 2;
		selectedImages.value = [];
		allImages.value = ['https://example.com/1.png', 'https://example.com/2.png'];
	});

	it('renders image cards for displayed images with lazy loading and async decoding', () => {
		render(html`<${Images} />`, container);

		const imgElements = container.querySelectorAll('img.drop-shadow-md');
		expect(imgElements.length).toBe(2);
		expect(imgElements[0].getAttribute('loading')).toBe('lazy');
		expect(imgElements[0].getAttribute('decoding')).toBe('async');
	});

	it('copies image URL to clipboard when copy button is clicked', async () => {
		const writeTextMock = mock(() => Promise.resolve());
		Object.defineProperty(window.navigator, 'clipboard', {
			value: { writeText: writeTextMock },
			configurable: true,
		});

		render(html`<${Images} />`, container);

		const urlInputs = container.querySelectorAll('input[readonly]') as NodeListOf<HTMLInputElement>;
		expect(urlInputs.length).toBe(2);
		urlInputs[0].click();

		const copyButtons = container.querySelectorAll('button[title="Copy image URL to clipboard"]');
		expect(copyButtons.length).toBe(2);
		(copyButtons[0] as HTMLButtonElement).click();

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(writeTextMock).toHaveBeenCalledWith('https://example.com/1.png');
		expect(urlInputs[0].value).toBe('Copied URL!');
	});

	it('toggles image selection when a card is clicked', () => {
		render(html`<${Images} />`, container);

		const cards = container.querySelectorAll('.group.cursor-pointer');
		expect(cards.length).toBe(2);

		// Click to select
		(cards[0] as HTMLElement).click();
		expect(selectedImages.value).toContain('https://example.com/1.png');

		// Click to unselect
		(cards[0] as HTMLElement).click();
		expect(selectedImages.value).not.toContain('https://example.com/1.png');
	});

	it('shows error UI on image loading failure and allows retry', async () => {
		render(html`<${Images} />`, container);

		const firstImg = container.querySelector('img.drop-shadow-md') as HTMLImageElement;
		expect(firstImg).not.toBeNull();

		// Dispatch error event using window.Event
		firstImg.dispatchEvent(new (window as any).Event('error'));

		await new Promise((resolve) => setTimeout(resolve, 50));

		// Check for error element
		const retryButton = container.querySelector('button[title="Retry loading image"]') as HTMLButtonElement;
		expect(retryButton).not.toBeNull();
		expect(retryButton.textContent).toContain('Error loading image');

		// Click to retry
		retryButton.click();
		await new Promise((resolve) => setTimeout(resolve, 50));

		// After reset, img element should be restored
		const restoredImg = container.querySelector('img.drop-shadow-md') as HTMLImageElement;
		expect(restoredImg).not.toBeNull();
	});

	it('triggers single download when download button on card is clicked', () => {
		render(html`<${Images} />`, container);

		const downloadButtons = container.querySelectorAll('button[title="Download"]');
		expect(downloadButtons.length).toBe(2);

		(downloadButtons[0] as HTMLButtonElement).click();
		expect(chrome.runtime.sendMessage).toHaveBeenCalled();
		const sentMessage = chrome.runtime.sendMessage.mock.calls[0][0];
		expect(sentMessage.type).toBe('downloadImages');
		expect(sentMessage.imagesToDownload).toEqual(['https://example.com/1.png']);
	});

	it('opens image in new tab when open image button is clicked', () => {
		render(html`<${Images} />`, container);

		const openButtons = container.querySelectorAll('button[title="Open in new tab"]');
		expect(openButtons.length).toBe(2);

		(openButtons[1] as HTMLButtonElement).click();
		expect(chrome.tabs.create).toHaveBeenCalledWith({
			url: 'https://example.com/2.png',
			active: false,
		});
	});
});
