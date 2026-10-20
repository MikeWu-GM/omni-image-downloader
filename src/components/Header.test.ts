import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import html, { render } from '../html.js';
import { mockChrome, mockDOM } from '../test-helpers.js';
import {
	allImages,
	columns,
	customLargeThreshold,
	customSmallThreshold,
	defaults,
	detectedImageExtensions,
	filterMaxWidth,
	filterMaxWidthEnabled,
	filterMinWidth,
	filterMinWidthEnabled,
	filterSizePreset,
	filterUrl,
	filterUrlMode,
	hostname,
	imagesCache,
	openMode,
	scriptError,
	selectedFormats,
	selectedImages,
	setLockedTabId,
	showAdvancedFilters,
	tab,
	theme,
} from './data.js';
import { Header } from './Header.js';

mockDOM();

describe('Header component & defaults hygiene', () => {
	let container: HTMLElement;
	let chrome: ReturnType<typeof mockChrome>;

	beforeEach(() => {
		chrome = mockChrome();
		(globalThis as any).chrome = chrome;
		(globalThis as any).chrome.action = {
			setPopup: mock(() => Promise.resolve()),
			openPopup: mock(() => Promise.resolve()),
		};
		(globalThis as any).chrome.sidePanel = {
			open: mock(() => Promise.resolve()),
			setOptions: mock(() => Promise.resolve()),
		};
		(globalThis as any).chrome.tabs.query = mock((_q: any, cb: any) => cb([{ id: 42 }]));
		(globalThis as any).chrome.windows.getCurrent = mock((cb: any) => cb({ id: 1 }));
		(globalThis as any).window.close = mock();

		container = document.createElement('div');
		document.body.appendChild(container);
		imagesCache.value = document.createElement('div');

		setLockedTabId(42);
		openMode.value = 'sidebar';
		theme.value = 'light';
		filterUrl.value = '';
		filterUrlMode.value = 'normal';
		filterSizePreset.value = 'all';
		customLargeThreshold.value = 1200;
		customSmallThreshold.value = 400;
		selectedFormats.value = [];
		detectedImageExtensions.value = {};
		showAdvancedFilters.value = false;
		filterMinWidthEnabled.value = false;
		filterMaxWidthEnabled.value = false;
		filterMinWidth.value = 0;
		filterMaxWidth.value = 3000;
		hostname.value = 'example.com';
		scriptError.value = '';
		allImages.value = ['https://example.com/a.jpg', 'https://example.com/b.png', 'https://example.com/c.webp'];
		selectedImages.value = [];
		tab.value = 'matching';
		columns.value = 2;
	});

	afterEach(() => {
		showAdvancedFilters.value = true;
	});

	it('does not include obsolete prototype_variant in defaults', () => {
		expect('prototype_variant' in defaults).toBe(false);
	});

	it('renders unified English labels for size and format dropdown triggers', () => {
		render(html`<${Header} />`, container);

		const sizeBtn = container.querySelector('button[title="Filter by image size (Presets & Sliders)"]');
		expect(sizeBtn?.textContent).toContain('Size: All');

		const formatBtn = container.querySelector('button[title="Filter by detected image format"]');
		expect(formatBtn?.textContent).toContain('Format: All');
	});

	it('updates URL filter input and mode', () => {
		render(html`<${Header} />`, container);

		const urlInput = container.querySelector('#filter_by_url_input') as HTMLInputElement;
		urlInput.value = '  banner  ';
		urlInput.dispatchEvent(new (window as any).Event('input'));
		expect(filterUrl.value).toBe('banner');

		const modeSelect = container.querySelector('#url_filter_mode_select') as HTMLSelectElement;
		modeSelect.value = 'regex';
		modeSelect.dispatchEvent(new (window as any).Event('change'));
		expect(filterUrlMode.value).toBe('regex');
	});

	it('opens size menu, switches presets, adjusts custom thresholds, and opens sliders', async () => {
		render(html`<${Header} />`, container);

		const sizeTrigger = container.querySelector(
			'button[title="Filter by image size (Presets & Sliders)"]'
		) as HTMLButtonElement;
		sizeTrigger.click();
		await new Promise((r) => setTimeout(r, 10));

		// Click Large preset
		const buttons = Array.from(container.querySelectorAll('button'));
		const largeBtn = buttons.find((b) => b.textContent?.includes('Large (≥1200px)'));
		expect(largeBtn).toBeDefined();
		largeBtn!.click();
		await new Promise((r) => setTimeout(r, 10));
		expect(filterSizePreset.value).toBe('large');
		expect(sizeTrigger.textContent).toContain('Large ≥1200px');

		// Re-open size menu and test Medium, Small, All, Custom thresholds
		sizeTrigger.click();
		await new Promise((r) => setTimeout(r, 10));

		const numberInputs = container.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
		expect(numberInputs.length).toBe(2);

		// Update large threshold while preset is 'large'
		numberInputs[0].value = '1600';
		numberInputs[0].dispatchEvent(new (window as any).Event('input'));
		await new Promise((r) => setTimeout(r, 10));
		expect(customLargeThreshold.value).toBe(1600);
		expect(filterMinWidth.value).toBe(1600);

		// Switch to medium preset and all preset
		const mediumBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Medium (400-1600px)')
		);
		mediumBtn!.click();
		await new Promise((r) => setTimeout(r, 10));
		expect(filterSizePreset.value).toBe('medium');

		sizeTrigger.click();
		await new Promise((r) => setTimeout(r, 10));
		const allBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('All sizes (No limit)')
		);
		allBtn!.click();
		await new Promise((r) => setTimeout(r, 10));
		expect(filterSizePreset.value).toBe('all');

		// Switch to small preset and update small threshold
		sizeTrigger.click();
		await new Promise((r) => setTimeout(r, 10));
		const smallBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Small (<400px)')
		);
		smallBtn!.click();
		await new Promise((r) => setTimeout(r, 10));
		expect(filterSizePreset.value).toBe('small');

		sizeTrigger.click();
		await new Promise((r) => setTimeout(r, 10));
		const inputsAfterReopen = container.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
		inputsAfterReopen[1].value = '300';
		inputsAfterReopen[1].dispatchEvent(new (window as any).Event('input'));
		expect(customSmallThreshold.value).toBe(300);
		expect(filterMaxWidth.value).toBe(300);

		// Click "Adjust with sliders" button
		const sliderBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Adjust with sliders')
		);
		expect(sliderBtn).toBeDefined();
		sliderBtn!.click();
		await new Promise((r) => setTimeout(r, 10));
		expect(showAdvancedFilters.value).toBe(true);
		expect(filterSizePreset.value).toBe('custom');
	});

	it('displays custom size range labels accurately', () => {
		filterSizePreset.value = 'custom';
		filterMinWidthEnabled.value = true;
		filterMaxWidthEnabled.value = true;
		filterMinWidth.value = 200;
		filterMaxWidth.value = 800;

		render(html`<${Header} />`, container);
		const sizeBtn = container.querySelector('button[title="Filter by image size (Presets & Sliders)"]');
		expect(sizeBtn?.textContent).toContain('200~800px');

		filterMaxWidthEnabled.value = false;
		render(html`<${Header} />`, container);
		expect(sizeBtn?.textContent).toContain('≥200px');

		filterMinWidthEnabled.value = false;
		filterMaxWidthEnabled.value = true;
		render(html`<${Header} />`, container);
		expect(sizeBtn?.textContent).toContain('≤800px');

		filterMaxWidthEnabled.value = false;
		render(html`<${Header} />`, container);
		expect(sizeBtn?.textContent).toContain('Custom size');
	});

	it('toggles formats in the format dropdown menu and resets to all formats', async () => {
		selectedFormats.value = ['gif']; // orphaned format not in allImages
		render(html`<${Header} />`, container);

		const formatTrigger = container.querySelector('button[title*="Selected formats"]') as HTMLButtonElement;
		expect(formatTrigger).not.toBeNull();
		expect(formatTrigger.textContent).toContain('Format: GIF');

		formatTrigger.click();
		await new Promise((r) => setTimeout(r, 10));

		// Toggle jpg on
		const jpgBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('jpg'));
		expect(jpgBtn).toBeDefined();
		jpgBtn!.click();
		await new Promise((r) => setTimeout(r, 10));
		expect(selectedFormats.value).toEqual(['gif', 'jpg']);

		// Toggle gif off
		const gifBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('gif'));
		gifBtn!.click();
		await new Promise((r) => setTimeout(r, 10));
		expect(selectedFormats.value).toEqual(['jpg']);

		// Reset all formats
		const allFormatsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('All formats')
		);
		allFormatsBtn!.click();
		await new Promise((r) => setTimeout(r, 10));
		expect(selectedFormats.value).toEqual([]);
	});

	it('switches openMode between sidebar and popup and handles close button', async () => {
		render(html`<${Header} />`, container);

		const modeBtn = container.querySelector('button[title="Switch to popup mode"]') as HTMLButtonElement;
		expect(modeBtn).not.toBeNull();
		await modeBtn.click();
		expect(openMode.value).toBe('popup');
		expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false });
		expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: 'src/Popup/index.html' });

		render(html`<${Header} />`, container);
		const sidebarBtn = container.querySelector('button[title="Switch to sidebar mode"]') as HTMLButtonElement;
		sidebarBtn.click();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(openMode.value).toBe('sidebar');
		expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });

		const closeBtn = container.querySelector('button[title="Close extension"]') as HTMLButtonElement;
		closeBtn.click();
		expect((globalThis as any).window.close).toHaveBeenCalled();
	});

	it('updates StatusToolbar selection checkbox and theme cycle button', () => {
		render(html`<${Header} />`, container);

		// Select all matching images via StatusToolbar checkbox
		const selectAllCheckbox = container.querySelector(
			'label[title="Click to select or unselect all displayed images"] input'
		) as HTMLInputElement;
		expect(selectAllCheckbox).not.toBeNull();
		selectAllCheckbox.checked = true;
		selectAllCheckbox.dispatchEvent(new (window as any).Event('change'));
		expect(selectedImages.value.length).toBe(3);

		// Unselect all
		selectAllCheckbox.checked = false;
		selectAllCheckbox.dispatchEvent(new (window as any).Event('change'));
		expect(selectedImages.value.length).toBe(0);

		// Cycle theme: light -> dark -> system -> light
		const themeBtn = container.querySelector('button[title*="click to cycle"]') as HTMLButtonElement;
		expect(theme.value).toBe('light');
		themeBtn.click();
		expect(theme.value).toBe('dark');
		themeBtn.click();
		expect(theme.value).toBe('system');
		themeBtn.click();
		expect(theme.value).toBe('light');

		// Switch between matching and filtered_out tabs
		const filteredTabBtn = container.querySelector(
			'button[title="Images removed by your filters"]'
		) as HTMLButtonElement;
		filteredTabBtn.click();
		expect(tab.value).toBe('filtered_out');

		const matchingTabBtn = container.querySelector('button[title="Images matching your filters"]') as HTMLButtonElement;
		matchingTabBtn.click();
		expect(tab.value).toBe('matching');

		// Adjust columns (- and +)
		const fewerColsBtn = container.querySelector('button[title="Fewer columns"]') as HTMLButtonElement;
		const moreColsBtn = container.querySelector('button[title="More columns"]') as HTMLButtonElement;
		fewerColsBtn.click();
		expect(columns.value).toBe(1);
		moreColsBtn.click();
		expect(columns.value).toBe(2);
	});
});
