import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { mockChrome, mockDOM } from '../test-helpers';

mockDOM();

import {
	allImages,
	applySizePreset,
	cancelPageScroll,
	isAutoScrolling,
	pageScrollDown,
	toggleAutoScroll,
	columns,
	currentSelectedImages,
	customLargeThreshold,
	customSmallThreshold,
	filterMaxHeight,
	filterMaxHeightEnabled,
	filterMaxWidth,
	filterMaxWidthEnabled,
	filterMinHeight,
	availableFormats,
	filterMinHeightEnabled,
	filterMinWidth,
	filterMinWidthEnabled,
	filterSizePreset,
	filterUrl,
	filterUrlMode,
	folderName,
	hostname,
	imageDimensions,
	imageLoaded,
	imagesCache,
	initialize,
	isFolderCustomized,
	linkedImages,
	loadImagesFromActiveTab,
	loadImagesFromCurrentWindow,
	matchingImages,
	newFileName,
	normalizeExtension,
	openMode,
	reloadImagesWhenPageLoads,
	scriptError,
	selectedFormats,
	selectedImages,
	setAllTabGroupsCollapsed,
	setLockedTabId,
	showAdvancedFilters,
	showDownloadConfirmation,
	subfolderPerTab,
	tab,
	tabGroups,
	toggleTabGroupCollapse,
	toggleTabGroupSelection,
	extractionScope,
	groupByTab,
	imageToTabMap,
	detectedImageExtensions,
	updateDetectedExtension,
} from './data.js';

let localStorageData: Record<string, string>;

function setupMocks(initialStorage?: Record<string, any>) {
	localStorageData = {};
	const mockLocalStorage = {
		get length() {
			return Object.keys(localStorageData).length;
		},
		getItem: (key: string) => localStorageData[key] || null,
		setItem: (key: string, value: string) => {
			localStorageData[key] = value;
		},
		removeItem: (key: string) => {
			delete localStorageData[key];
		},
		clear: () => {
			for (const key in localStorageData) {
				delete localStorageData[key];
			}
		},
		key: (index: number) => Object.keys(localStorageData)[index] || null,
	};
	Object.defineProperty(globalThis, 'localStorage', {
		value: mockLocalStorage,
		writable: true,
		configurable: true,
	});

	(global as any).chrome = mockChrome({ storage: initialStorage });
}

beforeEach(() => {
	setLockedTabId(null);
	openMode.value = 'sidebar';
	filterUrl.value = '';
	filterUrlMode.value = 'normal';
	showAdvancedFilters.value = true;
	filterMinWidth.value = 0;
	filterMaxWidth.value = 3000;
	filterMinHeight.value = 0;
	filterMaxHeight.value = 3000;
	selectedImages.value = [];
	selectedFormats.value = [];
	detectedImageExtensions.value = {};
	filterSizePreset.value = 'all';
	columns.value = 2;
	folderName.value = '';
	newFileName.value = '';
	extractionScope.value = 'current_tab';
	groupByTab.value = true;
	subfolderPerTab.value = true;
	tabGroups.value = [];
	setupMocks();
});

describe('useOptions', () => {
	describe('initialization', () => {
		it('should initialize with default values when chrome.storage is empty', async () => {
			await initialize();

			expect(openMode.value).toBe('sidebar');
			expect(filterUrl.value).toBe('');
			expect(filterUrlMode.value).toBe('normal');
			expect(showAdvancedFilters.value).toBe(true);
			expect(filterMinWidthEnabled.value).toBe(false);
			expect(filterMinWidth.value).toBe(0);
			expect(filterMaxWidthEnabled.value).toBe(false);
			expect(filterMaxWidth.value).toBe(3000);
			expect(filterMinHeightEnabled.value).toBe(false);
			expect(filterMinHeight.value).toBe(0);
			expect(filterMaxHeightEnabled.value).toBe(false);
			expect(filterMaxHeight.value).toBe(3000);
			expect(folderName.value).toBe('');
			expect(newFileName.value).toBe('');
			expect(showDownloadConfirmation.value).toBe(true);
			expect(selectedImages.value).toEqual([]);
			expect(columns.value).toBe(2);
		});

		it('should load values from chrome.storage', async () => {
			setupMocks({ columns: 4 });
			await initialize();
			expect(columns.value).toBe(4);
		});

		it('should migrate values from localStorage and clear it', async () => {
			localStorageData.columns = '5';
			localStorageData.unknown_key = 'should_be_ignored';

			await initialize();
			expect(columns.value).toBe(5);
			expect(Object.keys(localStorageData).length).toBe(0);

			const stored = await chrome.storage.local.get(null);
			expect(stored.columns).toBe(5);
			expect(stored.unknown_key).toBeUndefined();
		});

		it('should not overwrite existing chrome.storage data during migration', async () => {
			setupMocks({ columns: 3 });
			localStorageData.columns = '4';

			await initialize();
			expect(columns.value).toBe(3);
			expect(Object.keys(localStorageData).length).toBe(0);
		});
	});

	describe('updates', () => {
		it('should update filterUrl signal and sync to storage', async () => {
			await initialize();

			filterUrl.value = 'test.jpg';

			const stored = await chrome.storage.local.get(['filter_url']);
			expect(stored.filter_url).toBe('test.jpg');
		});

		it('should update filterUrlMode signal and sync to storage', async () => {
			await initialize();

			filterUrlMode.value = 'regex';

			const stored = await chrome.storage.local.get(['filter_url_mode']);
			expect(stored.filter_url_mode).toBe('regex');
		});

		it('should update openMode signal and sync to storage', async () => {
			await initialize();

			openMode.value = 'popup';

			const stored = await chrome.storage.local.get(['open_mode']);
			expect(stored.open_mode).toBe('popup');
		});
	});

	describe('native types in storage', () => {
		it('should store numbers as numbers', async () => {
			await initialize();

			filterMinWidth.value = 100;

			const stored = await chrome.storage.local.get(['filter_min_width']);
			expect(stored.filter_min_width).toBe(100);
			expect(typeof stored.filter_min_width).toBe('number');
		});

		it('should store booleans as booleans', async () => {
			await initialize();

			showAdvancedFilters.value = false;

			const stored = await chrome.storage.local.get(['show_advanced_filters']);
			expect(stored.show_advanced_filters).toBe(false);
			expect(typeof stored.show_advanced_filters).toBe('boolean');
		});

		it('should store arrays as arrays and exclude transient data:/blob: URLs from storage persistence', async () => {
			await initialize();

			selectedImages.value = [
				'https://example.com/img1.jpg',
				'data:image/png;base64,' + 'A'.repeat(10000),
				'blob:https://example.com/1234',
				'https://example.com/img2.jpg',
			];
			await new Promise((resolve) => setTimeout(resolve, 0));

			// In-memory signal keeps all selected images so download works
			expect(selectedImages.value).toHaveLength(4);

			// Persistent storage only keeps non-transient URLs to prevent quota overflow
			const stored = await chrome.storage.local.get(['selected_images']);
			expect(stored.selected_images).toEqual(['https://example.com/img1.jpg', 'https://example.com/img2.jpg']);
			expect(Array.isArray(stored.selected_images)).toBe(true);
		});
	});
});

describe('matchingImages', () => {
	it('should prevent ReDoS on long data: URLs with multiple wildcards', () => {
		imagesCache.value = document.createElement('div');
		const hugeDataUrl = 'data:image/png;base64,' + 'a'.repeat(50000) + '!';
		allImages.value = [hugeDataUrl, 'https://example.com/photo.png'];

		filterUrlMode.value = 'wildcard';
		filterUrl.value = 'a*a*a*a*a*a*a*b';

		const start = performance.now();
		expect(matchingImages.value).toEqual([]);
		expect(performance.now() - start).toBeLessThan(50);
	});
	it('should include an image whose URL contains a double quote', () => {
		const url = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>';
		const cache = document.createElement('div');
		const image = document.createElement('img');
		image.setAttribute('src', url);
		cache.append(image);
		imagesCache.value = cache;

		allImages.value = [url];

		expect(matchingImages.value).toEqual([url]);
	});

	it('should treat every * in a wildcard filter as any sequence of characters', () => {
		imagesCache.value = document.createElement('div');
		allImages.value = ['https://example.com/ac.png', 'https://example.com/abc.png'];

		filterUrlMode.value = 'wildcard';
		filterUrl.value = 'a*b*c';

		expect(matchingImages.value).toEqual(['https://example.com/abc.png']);
	});

	it('should treat ? in a wildcard filter as exactly one character and + as itself', () => {
		imagesCache.value = document.createElement('div');
		allImages.value = [
			'https://example.com/photo.png',
			'https://example.com/photo1.png',
			'https://example.com/photo12.png',
			'https://example.com/a+b.png',
			'https://example.com/aab.png',
		];
		filterUrlMode.value = 'wildcard';

		filterUrl.value = 'photo?.png';
		expect(matchingImages.value).toEqual(['https://example.com/photo1.png']);

		filterUrl.value = 'a+b';
		expect(matchingImages.value).toEqual(['https://example.com/a+b.png']);
	});
});

describe('loadImagesFromActiveTab', () => {
	it("reads blob URLs in the page's own world, in the frame that found them", async () => {
		const chrome = (global as any).chrome;
		chrome.windows.getCurrent = (callback: any) => callback({ id: 1 });
		chrome.tabs.query = (_query: any, callback: any) => callback([{ id: 7, url: 'https://example.com/' }]);
		const blobUrl = 'blob:https://example.com/0f8c3a52-5d1e-4c0b-9a7e-2b6f1d9e4c11';
		const dataUrl = 'data:image/webp;base64,AAAA';
		chrome.scripting = {
			executeScript: mock(async (injection: any) =>
				injection.world === 'MAIN'
					? [{ frameId: 3, result: [dataUrl] }]
					: [
							{ frameId: 0, result: { allImages: ['https://example.com/a.png'], linkedImages: [] } },
							{ frameId: 3, result: { allImages: [blobUrl], linkedImages: [blobUrl] } },
						]
			),
		};

		loadImagesFromActiveTab({ waitForIdleDOM: 1 });
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(chrome.scripting.executeScript.mock.calls[1][0]).toMatchObject({
			target: { tabId: 7, frameIds: [3] },
			world: 'MAIN',
			args: [[blobUrl]],
		});
		expect(allImages.value).toEqual(['https://example.com/a.png', dataUrl]);
		expect(linkedImages.value).toEqual([dataUrl]);
	});

	const firefoxError = 'Missing host permission for the tab or frames';

	function failToAccess(url: string) {
		const chrome = (global as any).chrome;
		chrome.windows.getCurrent = (callback: any) => callback({ id: 1 });
		chrome.tabs.query = (_query: any, callback: any) => callback([{ id: 7, url }]);
		chrome.scripting = { executeScript: mock(async () => Promise.reject(new Error(firefoxError))) };
	}

	it("doesn't report failing to access a browser page", async () => {
		failToAccess('about:home');

		loadImagesFromActiveTab({ waitForIdleDOM: 1 });
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(scriptError.value).toBe('');
	});

	it('reports failing to access a web page', async () => {
		failToAccess('https://example.com/');

		loadImagesFromActiveTab({ waitForIdleDOM: 1 });
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(scriptError.value).toBe(firefoxError);
	});

	it('targets the tabId from the URL query parameter when present', async () => {
		const chrome = (global as any).chrome;
		window.location.search = '?tabId=42';
		chrome.tabs.get = mock((tabId: number, callback: any) =>
			callback({ id: tabId, url: 'https://example.com/locked' })
		);
		chrome.tabs.query = mock((_query: any, callback: any) => callback([{ id: 7, url: 'https://example.com/other' }]));
		chrome.scripting = {
			executeScript: mock(async () => [
				{ frameId: 0, result: { allImages: ['https://example.com/locked.png'], linkedImages: [] } },
			]),
		};

		loadImagesFromActiveTab({ waitForIdleDOM: 1 });
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(chrome.scripting.executeScript.mock.calls[0][0].target.tabId).toBe(42);
		expect(allImages.value).toEqual(['https://example.com/locked.png']);

		window.location.search = '';
	});

	it('prefills folderName with sanitized page title from active tab', async () => {
		const chrome = (global as any).chrome;
		chrome.windows = { getCurrent: (cb: any) => cb({ id: 1 }) };
		chrome.tabs.query = mock((_query: any, callback: any) =>
			callback([{ id: 10, url: 'https://example.com/gallery', title: 'My Gallery: Summer 2026' }])
		);
		chrome.scripting = {
			executeScript: mock(async () => [
				{
					frameId: 0,
					result: {
						allImages: ['https://example.com/pic.jpg'],
						linkedImages: [],
						title: 'My Gallery: Summer 2026',
					},
				},
			]),
		};

		folderName.value = '';
		loadImagesFromActiveTab({ waitForIdleDOM: 1 });
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(folderName.value).toBe('My Gallery_Summer 2026');
	});

	it('prefers top-level frame (frameId: 0) title over child iframe titles', async () => {
		const chrome = (global as any).chrome;
		chrome.windows = { getCurrent: (cb: any) => cb({ id: 1 }) };
		chrome.tabs.query = mock((_query: any, callback: any) =>
			callback([{ id: 10, url: 'https://forum.example.com/thread-12345', title: 'Real Topic Title' }])
		);
		chrome.scripting = {
			executeScript: mock(async () => [
				{
					frameId: 0,
					result: {
						allImages: ['https://example.com/pic1.jpg'],
						linkedImages: [],
						title: 'Real Topic Title',
					},
				},
				{
					frameId: 1,
					result: {
						allImages: ['https://example.com/logo.jpg'],
						linkedImages: [],
						title: 'Auth Login',
					},
				},
			]),
		};

		folderName.value = '';
		loadImagesFromActiveTab({ waitForIdleDOM: 1 });
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(folderName.value).toBe('Real Topic Title');
	});
});

describe('reloadImagesWhenPageLoads', () => {
	it('ignores tab switching and updates from other tabs when tabId is locked in URL', () => {
		const chrome = (global as any).chrome;
		window.location.search = '?tabId=42';
		hostname.value = 'example.com';
		chrome.scripting = { executeScript: mock() };

		// Simulate tab switching (onActivated passes tabId 99 and null tab)
		reloadImagesWhenPageLoads(99, {}, null);
		expect(hostname.value).toBe('example.com');
		expect(chrome.scripting.executeScript).not.toHaveBeenCalled();

		// Simulate another tab updating (onUpdated passes tabId 99)
		reloadImagesWhenPageLoads(99, { status: 'complete' }, { active: true, url: 'https://other.com' });
		expect(hostname.value).toBe('example.com');
		expect(chrome.scripting.executeScript).not.toHaveBeenCalled();

		window.location.search = '';
	});
});

describe('currentSelectedImages', () => {
	it('only includes selected images that match the active tab', () => {
		allImages.value = ['https://example.com/1.png', 'https://example.com/2.png', 'https://example.com/3.png'];
		filterUrl.value = '1.png';
		selectedImages.value = ['https://example.com/1.png', 'https://example.com/2.png'];

		tab.value = 'matching';
		expect(currentSelectedImages.value).toEqual(['https://example.com/1.png']);

		tab.value = 'filtered_out';
		expect(currentSelectedImages.value).toEqual(['https://example.com/2.png']);
	});

	it('respects dimension filters so filtered-out images are not selected on matching tab', () => {
		const cache = document.createElement('div');
		const imgSmall = document.createElement('img');
		imgSmall.src = 'https://example.com/small.png';
		Object.defineProperty(imgSmall, 'naturalWidth', { value: 100 });
		Object.defineProperty(imgSmall, 'naturalHeight', { value: 100 });

		const imgLarge = document.createElement('img');
		imgLarge.src = 'https://example.com/large.png';
		Object.defineProperty(imgLarge, 'naturalWidth', { value: 800 });
		Object.defineProperty(imgLarge, 'naturalHeight', { value: 800 });

		cache.append(imgSmall, imgLarge);
		imagesCache.value = cache;

		allImages.value = ['https://example.com/small.png', 'https://example.com/large.png'];
		selectedImages.value = ['https://example.com/small.png', 'https://example.com/large.png'];

		filterMinWidthEnabled.value = true;
		filterMinWidth.value = 500;

		tab.value = 'matching';
		expect(matchingImages.value).toEqual(['https://example.com/large.png']);
		expect(currentSelectedImages.value).toEqual(['https://example.com/large.png']);

		tab.value = 'filtered_out';
		expect(currentSelectedImages.value).toEqual(['https://example.com/small.png']);
	});

	it('automatically recomputes matchingImages when images finish loading in imagesCache', () => {
		const cache = document.createElement('div');
		const img = document.createElement('img');
		img.src = 'https://example.com/loading.png';
		Object.defineProperty(img, 'naturalWidth', { value: 0, writable: true });
		Object.defineProperty(img, 'naturalHeight', { value: 0, writable: true });
		cache.append(img);
		imagesCache.value = cache;

		allImages.value = ['https://example.com/loading.png'];
		filterMinWidthEnabled.value = true;
		filterMinWidth.value = 500;

		// Initially not matching because naturalWidth is 0
		expect(matchingImages.value).toEqual([]);

		// Image finishes loading and onLoad triggers imageLoaded
		(img as any).naturalWidth = 800;
		(img as any).naturalHeight = 600;
		imageLoaded('https://example.com/loading.png');

		// matchingImages MUST update reactively to include the loaded image
		expect(matchingImages.value).toEqual(['https://example.com/loading.png']);
	});

	it('uses imageDimensions from tab when filtering without waiting for imagesCache', () => {
		const cache = document.createElement('div');
		imagesCache.value = cache;

		imageDimensions.value = {
			'https://example.com/from-tab.png': { width: 1920, height: 1080 },
		};
		allImages.value = ['https://example.com/from-tab.png'];
		filterMinWidthEnabled.value = true;
		filterMinWidth.value = 500;

		expect(matchingImages.value).toEqual(['https://example.com/from-tab.png']);
	});

	it('filters images by size presets (large, medium, small)', () => {
		const cache = document.createElement('div');
		imagesCache.value = cache;

		imageDimensions.value = {
			'https://example.com/large.png': { width: 1920, height: 1080 },
			'https://example.com/medium.jpg': { width: 800, height: 600 },
			'https://example.com/small.png': { width: 200, height: 200 },
		};
		allImages.value = [
			'https://example.com/large.png',
			'https://example.com/medium.jpg',
			'https://example.com/small.png',
		];
		filterMinWidthEnabled.value = false;
		filterMaxWidthEnabled.value = false;

		// Large: >= 1200
		filterSizePreset.value = 'large';
		expect(matchingImages.value).toEqual(['https://example.com/large.png']);

		// Medium: 400 <= size < 1200
		filterSizePreset.value = 'medium';
		expect(matchingImages.value).toEqual(['https://example.com/medium.jpg']);

		// Small: < 400
		filterSizePreset.value = 'small';
		expect(matchingImages.value).toEqual(['https://example.com/small.png']);

		// All
		filterSizePreset.value = 'all';
		expect(matchingImages.value).toHaveLength(3);
	});

	it('filters images by dynamic format selection and counts available formats', () => {
		const cache = document.createElement('div');
		imagesCache.value = cache;
		allImages.value = [
			'https://example.com/1.png',
			'https://example.com/2.png',
			'https://example.com/3.jpg',
			'https://example.com/4.webp',
		];
		filterSizePreset.value = 'all';

		expect(availableFormats.value).toEqual([
			{ format: 'png', count: 2 },
			{ format: 'jpg', count: 1 },
			{ format: 'webp', count: 1 },
		]);

		selectedFormats.value = ['png'];
		expect(matchingImages.value).toEqual(['https://example.com/1.png', 'https://example.com/2.png']);

		selectedFormats.value = ['jpg', 'webp'];
		expect(matchingImages.value).toEqual(['https://example.com/3.jpg', 'https://example.com/4.webp']);

		selectedFormats.value = [];
		expect(matchingImages.value).toHaveLength(4);

		// Add complex CDN WebP URLs
		allImages.value = [
			'https://mmbiz.qpic.cn/sz_mmbiz_png/xxx/640?wx_fmt=webp',
			'http://example.com/photo.webp!thumbnail',
			'http://example.com/regular.png',
		];
		expect(availableFormats.value).toEqual([
			{ format: 'webp', count: 2 },
			{ format: 'png', count: 1 },
		]);
	});

	it('normalizes common image extension variants (jpeg, jfif, tiff, x-icon)', () => {
		expect(normalizeExtension('jpeg')).toBe('jpg');
		expect(normalizeExtension('jfif')).toBe('jpg');
		expect(normalizeExtension('tiff')).toBe('tif');
		expect(normalizeExtension('tif')).toBe('tif');
		expect(normalizeExtension('x-icon')).toBe('ico');
		expect(normalizeExtension('png')).toBe('png');
	});

	it('reactively updates availableFormats and matchingImages when dynamic extension is detected via updateDetectedExtension', () => {
		const cache = document.createElement('div');
		imagesCache.value = cache;
		const dynamicUrl = 'https://example.com/image/dynamic_raw_id_888';
		allImages.value = [dynamicUrl];
		detectedImageExtensions.value = {};
		selectedFormats.value = [];

		// Initially without detected extension, it should fall back to 'other'
		expect(availableFormats.value).toEqual([{ format: 'other', count: 1 }]);

		// Asynchronous detection resolves extension as webp
		updateDetectedExtension(dynamicUrl, 'webp');

		// availableFormats must immediately reflect webp instead of other
		expect(availableFormats.value).toEqual([{ format: 'webp', count: 1 }]);

		// Filtering by webp must match the dynamic image
		selectedFormats.value = ['webp'];
		expect(matchingImages.value).toEqual([dynamicUrl]);

		// Filtering by png must not match
		selectedFormats.value = ['png'];
		expect(matchingImages.value).toEqual([]);
	});

	it('supports applySizePreset and dynamic custom threshold changes', () => {
		const cache = document.createElement('div');
		imagesCache.value = cache;
		allImages.value = [
			'https://example.com/large.jpg',
			'https://example.com/medium.jpg',
			'https://example.com/small.jpg',
		];
		imageDimensions.value = {
			'https://example.com/large.jpg': { width: 1400, height: 900 },
			'https://example.com/medium.jpg': { width: 800, height: 600 },
			'https://example.com/small.jpg': { width: 200, height: 200 },
		};

		// 1. Select Large Preset
		applySizePreset('large');
		expect(filterSizePreset.value).toBe('large');
		expect(filterMinWidth.value).toBe(customLargeThreshold.value);
		expect(matchingImages.value).toEqual(['https://example.com/large.jpg']);

		// 2. Adjust Large Threshold dynamically from 1200 down to 700
		customLargeThreshold.value = 700;
		expect(matchingImages.value).toEqual(['https://example.com/large.jpg', 'https://example.com/medium.jpg']);

		// 3. Select Small Preset
		applySizePreset('small');
		expect(filterSizePreset.value).toBe('small');
		expect(filterMaxWidth.value).toBe(customSmallThreshold.value);
		expect(matchingImages.value).toEqual(['https://example.com/small.jpg']);

		// 4. Select Medium Preset (with large threshold restored to 1200)
		customLargeThreshold.value = 1200;
		applySizePreset('medium');
		expect(filterSizePreset.value).toBe('medium');
		expect(filterMinWidth.value).toBe(customSmallThreshold.value);
		expect(filterMaxWidth.value).toBe(customLargeThreshold.value);
		expect(matchingImages.value).toEqual(['https://example.com/medium.jpg']);

		// 5. Reset to All
		applySizePreset('all');
		expect(filterSizePreset.value).toBe('all');
		expect(filterMinWidthEnabled.value).toBe(false);
		expect(filterMaxWidthEnabled.value).toBe(false);
		expect(matchingImages.value).toHaveLength(3);
	});

	describe('Window scope multi-tab extraction & grouping', () => {
		beforeEach(() => {
			setupMocks();
		});

		it('initializes with default extraction_scope, group_by_tab and subfolder_per_tab', async () => {
			await initialize();
			expect(extractionScope.value).toBe('current_tab');
			expect(groupByTab.value).toBe(true);
			expect(subfolderPerTab.value).toBe(true);
		});

		it('extracts images from multiple tabs in current window, skipping restricted tabs', async () => {
			await initialize();

			(chrome.windows.getCurrent as any) = mock((cb: any) => cb({ id: 100 }));

			const mockTabs = [
				{
					id: 1,
					windowId: 100,
					url: 'https://site-a.com/gallery',
					title: 'Site A Gallery',
					favIconUrl: 'https://site-a.com/fav.png',
				},
				{ id: 2, windowId: 100, url: 'chrome://extensions', title: 'Extensions' },
				{
					id: 3,
					windowId: 100,
					url: 'https://site-b.com/photos',
					title: 'Site B Photos',
					favIconUrl: 'https://site-b.com/fav.ico',
				},
			];
			(chrome.tabs.query as any) = mock((_query: any, cb: any) => cb(mockTabs));

			(chrome as any).scripting = {
				executeScript: mock(async ({ target }: any) => {
					if (target.tabId === 1) {
						return [
							{
								result: {
									allImages: ['https://site-a.com/img1.jpg', 'https://site-a.com/img2.jpg'],
									linkedImages: [],
									imageDimensions: { 'https://site-a.com/img1.jpg': { width: 1000, height: 800 } },
									title: 'Site A Gallery',
								},
							},
						];
					}
					if (target.tabId === 3) {
						return [
							{
								result: {
									allImages: ['https://site-b.com/pic1.png'],
									linkedImages: [],
									imageDimensions: { 'https://site-b.com/pic1.png': { width: 1200, height: 900 } },
									title: 'Site B Photos',
								},
							},
						];
					}
					return [];
				}),
			};

			extractionScope.value = 'current_window';
			await loadImagesFromCurrentWindow({ waitForIdleDOM: 1000 });

			expect(tabGroups.value.length).toBe(2);
			expect(tabGroups.value[0].id).toBe(1);
			expect(tabGroups.value[0].title).toBe('Site A Gallery');
			expect(tabGroups.value[0].allImages).toEqual(['https://site-a.com/img1.jpg', 'https://site-a.com/img2.jpg']);
			expect(tabGroups.value[1].id).toBe(3);
			expect(tabGroups.value[1].allImages).toEqual(['https://site-b.com/pic1.png']);

			expect(allImages.value).toEqual([
				'https://site-a.com/img1.jpg',
				'https://site-a.com/img2.jpg',
				'https://site-b.com/pic1.png',
			]);

			expect(imageToTabMap.value.get('https://site-a.com/img1.jpg')?.tabId).toBe(1);
			expect(imageToTabMap.value.get('https://site-b.com/pic1.png')?.tabId).toBe(3);
		});

		it('disambiguates identical tab titles to ensure unique subfolder names', async () => {
			await initialize();

			(chrome.windows.getCurrent as any) = mock((cb: any) => cb({ id: 100 }));
			const mockTabs = [
				{ id: 10, windowId: 100, url: 'https://forum.example.com/post/1', title: 'Auth Login' },
				{ id: 20, windowId: 100, url: 'https://forum.example.com/post/2', title: 'Auth Login' },
				{ id: 30, windowId: 100, url: 'https://forum.example.com/post/3', title: 'Auth Login' },
			];
			(chrome.tabs.query as any) = mock((_query: any, cb: any) => cb(mockTabs));

			(chrome as any).scripting = {
				executeScript: mock(async ({ target }: any) => {
					return [
						{
							result: {
								allImages: [`https://forum.example.com/img_${target.tabId}.jpg`],
								linkedImages: [],
								imageDimensions: {},
								title: 'Auth Login',
							},
						},
					];
				}),
			};

			extractionScope.value = 'current_window';
			await loadImagesFromCurrentWindow({ waitForIdleDOM: 1000 });

			expect(tabGroups.value.length).toBe(3);
			expect(tabGroups.value[0].folderName).toBe('Auth Login');
			expect(tabGroups.value[1].folderName).toBe('Auth Login (2)');
			expect(tabGroups.value[2].folderName).toBe('Auth Login (3)');
			expect(folderName.value).toBe('');
		});

		it('leaves folderName empty by default in window mode and preserves customized folderName', async () => {
			const chrome = (global as any).chrome;
			chrome.windows = { getCurrent: (cb: any) => cb({ id: 1 }) };
			chrome.tabs = {
				query: (_query: any, cb: any) => cb([{ id: 101, title: 'Tab One', url: 'https://site-one.com' }]),
			};
			chrome.scripting = {
				executeScript: mock(async () => [
					{
						result: {
							allImages: ['https://site-one.com/img.jpg'],
							linkedImages: [],
							imageDimensions: {},
							title: 'Tab One',
						},
					},
				]),
			};

			extractionScope.value = 'current_window';
			isFolderCustomized.value = true;
			folderName.value = 'MyCustomBatch';

			await loadImagesFromCurrentWindow({ waitForIdleDOM: 1000 });
			expect(folderName.value).toBe('MyCustomBatch');
		});

		it('toggles selection and collapse state for a tab group', async () => {
			tabGroups.value = [
				{
					id: 1,
					title: 'Tab 1',
					url: 'https://site-a.com',
					hostname: 'site-a.com',
					favIconUrl: '',
					error: '',
					folderName: 'Tab_1',
					allImages: ['https://site-a.com/1.jpg', 'https://site-a.com/2.jpg'],
					linkedImages: [],
					imageDimensions: {},
					status: 'loaded',
					collapsed: false,
					selected: true,
				},
				{
					id: 2,
					title: 'Tab 2',
					url: 'https://site-b.com',
					hostname: 'site-b.com',
					favIconUrl: '',
					error: '',
					folderName: 'Tab_2',
					allImages: ['https://site-b.com/3.jpg'],
					linkedImages: [],
					imageDimensions: {},
					status: 'loaded',
					collapsed: false,
					selected: true,
				},
			];
			allImages.value = ['https://site-a.com/1.jpg', 'https://site-a.com/2.jpg', 'https://site-b.com/3.jpg'];
			selectedImages.value = [...allImages.value];

			toggleTabGroupSelection(1, false);
			expect(tabGroups.value[0].selected).toBe(false);
			expect(selectedImages.value).toEqual(['https://site-b.com/3.jpg']);

			toggleTabGroupSelection(1, true);
			expect(tabGroups.value[0].selected).toBe(true);
			expect(selectedImages.value).toEqual([
				'https://site-b.com/3.jpg',
				'https://site-a.com/1.jpg',
				'https://site-a.com/2.jpg',
			]);

			toggleTabGroupCollapse(1);
			expect(tabGroups.value[0].collapsed).toBe(true);
			toggleTabGroupCollapse(1);
			expect(tabGroups.value[0].collapsed).toBe(false);

			setAllTabGroupsCollapsed(true);
			expect(tabGroups.value.every((g: any) => g.collapsed)).toBe(true);
			setAllTabGroupsCollapsed(false);
			expect(tabGroups.value.every((g: any) => !g.collapsed)).toBe(true);
		});
	});

	describe('auto-scroll lazy-loading feature', () => {
		it('handles pageScrollDown and cancelPageScroll', async () => {
			(globalThis as any).window.__omniScrollCancelled = false;
			let mockScrollY = 0;
			Object.defineProperty(window, 'scrollY', {
				get: () => mockScrollY,
				set: (v) => {
					mockScrollY = v;
				},
				configurable: true,
			});
			(globalThis as any).window.innerHeight = 800;
			Object.defineProperty(document.documentElement, 'scrollHeight', {
				value: 3000,
				configurable: true,
			});
			(globalThis as any).window.scrollBy = mock(({ top }: any) => {
				mockScrollY += top;
			});

			const steps = await pageScrollDown(3, 500, 1);
			expect(steps).toBe(3);
			expect(mockScrollY).toBe(1500);

			cancelPageScroll();
			expect((globalThis as any).window.__omniScrollCancelled).toBe(true);
		});

		it('toggles isAutoScrolling state and triggers image reloading', async () => {
			setLockedTabId(99);
			const executeScriptMock = mock(() => Promise.resolve([{ result: 2 }]));
			(globalThis as any).chrome.scripting = { executeScript: executeScriptMock };

			expect(isAutoScrolling.value).toBe(false);
			const scrollPromise = toggleAutoScroll({ maxSteps: 2, stepPx: 100, delayMs: 1 });
			await scrollPromise;
			expect(isAutoScrolling.value).toBe(false);
			expect(executeScriptMock).toHaveBeenCalled();
		});
	});
});
