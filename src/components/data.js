// @ts-check
import { action, batch, computed, effect, signal } from '../html.js';
import {
	disambiguateFolderNames,
	findImageBySrc,
	isIncludedIn,
	isNotIncludedIn,
	isNotStrictEqual,
	measurePerf,
	recordPerfMetric,
	sanitizeFolderName,
	unique,
} from '../utils.js';
import { deduplicateImages } from './deduplicateImages.js';
import { findImages } from './findImages.js';
import { readBlobUrls } from './readBlobUrls.js';
import { getImageExtension } from './useImageStats.js';

// Options
/** @typedef {typeof defaults} Options */
export const defaults = {
	// UI
	open_mode: 'sidebar',
	theme: 'light',
	// Filters
	filter_url: '',
	filter_url_mode: 'normal',
	// Size Preset Filters
	filter_size_preset: 'all', // 'all' | 'large' | 'medium' | 'small' | 'custom'
	custom_large_threshold: 1200,
	custom_small_threshold: 400,
	// Format filter
	selected_formats: /** @type {string[]} */ ([]),
	// Advanced filters
	show_advanced_filters: true,
	filter_min_width_enabled: false,
	filter_min_width: 0,
	filter_max_width_enabled: false,
	filter_max_width: 3000,
	filter_min_height_enabled: false,
	filter_min_height: 0,
	filter_max_height_enabled: false,
	filter_max_height: 3000,
	only_unique_images: true,
	only_images_from_links: false,
	hide_errored_images: false,
	// Download
	folder_name: '',
	new_file_name: '',
	show_download_confirmation: true,
	save_source_url: true,
	max_concurrent_downloads: 4,
	// Images
	selected_images: /** @type {string[]} */ ([]),
	columns: 2,
	// Scope & Multi-Tab Grouping
	extraction_scope: 'current_tab', // 'current_tab' | 'current_window'
	group_by_tab: true,
	subfolder_per_tab: true,
};

/** @template {keyof Options} K */
function storedSignal(
	/** @type {K} */ key,
	/** @type {((val: Options[K]) => Options[K]) | undefined} */ serialize = undefined
) {
	const ss = signal(defaults[key]);

	effect(() => {
		if (initialized.value) {
			const valueToStore = serialize ? serialize(ss.value) : ss.value;
			chrome.storage.local.set({ [key]: valueToStore })?.catch?.(() => {});
		}
	});

	return ss;
}

export const initialized = signal(false);

// UI
export const openMode = storedSignal('open_mode');

export const theme = storedSignal('theme');

// Scope & Tab Groups
export const extractionScope = storedSignal('extraction_scope');
export const groupByTab = storedSignal('group_by_tab');
export const subfolderPerTab = storedSignal('subfolder_per_tab');

/**
 * @typedef {{
 *   id: number,
 *   title: string,
 *   url: string,
 *   hostname: string,
 *   favIconUrl?: string,
 *   folderName: string,
 *   allImages: string[],
 *   linkedImages: string[],
 *   imageDimensions: Record<string, { width: number; height: number }>,
 *   status: 'idle' | 'loading' | 'loaded' | 'error',
 *   error?: string,
 *   collapsed?: boolean,
 *   selected?: boolean
 * }} TabGroup
 */

/** @type {import('@preact/signals').Signal<TabGroup[]>} */
export const tabGroups = signal([]);

/** @type {import('@preact/signals').Signal<Map<string, { tabId: number; title: string; folderName: string }>>} */
export const imageToTabMap = signal(new Map());

// Filters
export const filterUrl = storedSignal('filter_url');

export const filterUrlMode = storedSignal('filter_url_mode');

// Size presets
export const filterSizePreset = storedSignal('filter_size_preset');
export const customLargeThreshold = storedSignal('custom_large_threshold');
export const customSmallThreshold = storedSignal('custom_small_threshold');

export const applySizePreset = action((/** @type {'all' | 'large' | 'medium' | 'small' | 'custom'} */ preset) => {
	batch(() => {
		filterSizePreset.value = preset;
		if (preset === 'all') {
			filterMinWidthEnabled.value = false;
			filterMaxWidthEnabled.value = false;
			filterMinHeightEnabled.value = false;
			filterMaxHeightEnabled.value = false;
		} else if (preset === 'large') {
			filterMinWidth.value = customLargeThreshold.value;
			filterMinWidthEnabled.value = false;
			filterMaxWidthEnabled.value = false;
		} else if (preset === 'medium') {
			filterMinWidth.value = customSmallThreshold.value;
			filterMaxWidth.value = customLargeThreshold.value;
			filterMinWidthEnabled.value = false;
			filterMaxWidthEnabled.value = false;
		} else if (preset === 'small') {
			filterMaxWidth.value = customSmallThreshold.value;
			filterMinWidthEnabled.value = false;
			filterMaxWidthEnabled.value = false;
		}
	});
});

// Format filter
/** @type {import('@preact/signals').Signal<string[]>} */
export const selectedFormats = storedSignal('selected_formats');

// Advanced filters
export const showAdvancedFilters = storedSignal('show_advanced_filters');

export const filterMinWidthEnabled = storedSignal('filter_min_width_enabled');
export const filterMinWidth = storedSignal('filter_min_width');

export const filterMaxWidthEnabled = storedSignal('filter_max_width_enabled');
export const filterMaxWidth = storedSignal('filter_max_width');

export const filterMinHeightEnabled = storedSignal('filter_min_height_enabled');
export const filterMinHeight = storedSignal('filter_min_height');

export const filterMaxHeightEnabled = storedSignal('filter_max_height_enabled');
export const filterMaxHeight = storedSignal('filter_max_height');

export const onlyUniqueImages = storedSignal('only_unique_images');

export const onlyImagesFromLinks = storedSignal('only_images_from_links');

export const hideErroredImages = storedSignal('hide_errored_images');

// Download
export const folderName = signal('');
export const isFolderCustomized = signal(false);

export const newFileName = storedSignal('new_file_name');

export const showDownloadConfirmation = storedSignal('show_download_confirmation');

export const saveSourceUrl = storedSignal('save_source_url');

export const maxConcurrentDownloads = storedSignal('max_concurrent_downloads');

export const downloadIsInProgress = signal(false);
export const downloadConfirmationIsShown = signal(false);

// Images
/** @type {import('@preact/signals').Signal<string[]>} */
export const selectedImages = storedSignal('selected_images', (urls) =>
	urls.filter((url) => !url.startsWith('data:') && !url.startsWith('blob:'))
);

export const columns = storedSignal('columns');

export const initialize = action(async () => {
	await migrateFromLocalStorage();
	const stored = await chrome.storage.local.get(null);

	const options = {
		open_mode: openMode,
		theme: theme,
		filter_url: filterUrl,
		filter_url_mode: filterUrlMode,
		filter_size_preset: filterSizePreset,
		custom_large_threshold: customLargeThreshold,
		custom_small_threshold: customSmallThreshold,
		selected_formats: selectedFormats,
		show_advanced_filters: showAdvancedFilters,
		filter_min_width_enabled: filterMinWidthEnabled,
		filter_max_width_enabled: filterMaxWidthEnabled,
		filter_min_height_enabled: filterMinHeightEnabled,
		filter_max_height_enabled: filterMaxHeightEnabled,
		filter_min_width: filterMinWidth,
		filter_max_width: filterMaxWidth,
		filter_min_height: filterMinHeight,
		filter_max_height: filterMaxHeight,
		only_unique_images: onlyUniqueImages,
		only_images_from_links: onlyImagesFromLinks,
		hide_errored_images: hideErroredImages,
		new_file_name: newFileName,
		show_download_confirmation: showDownloadConfirmation,
		save_source_url: saveSourceUrl,
		max_concurrent_downloads: maxConcurrentDownloads,
		selected_images: selectedImages,
		columns: columns,
	};
	for (const key in options) {
		const defaultValue = defaults[/** @type {keyof Options} */ (key)];
		if (Array.isArray(defaultValue) ? Array.isArray(stored[key]) : typeof stored[key] === typeof defaultValue) {
			options[/** @type {keyof typeof options} */ (key)].value = /** @type {any} */ (stored[key]);
		}
	}

	initialized.value = true;
});

async function migrateFromLocalStorage() {
	if (localStorage.length === 0) return;

	const existing = await chrome.storage.local.get(null);

	/** @type {Record<string, unknown>} */
	const toMigrate = {};
	for (let index = localStorage.length - 1; index >= 0; index--) {
		const key = localStorage.key(index);
		if (key && key in defaults && !(key in existing)) {
			toMigrate[key] = parseLocalStorageValue(localStorage.getItem(key), defaults[/** @type {keyof Options} */ (key)]);
		}
	}

	if (Object.keys(toMigrate).length > 0) {
		await chrome.storage.local.set(toMigrate);
	}

	localStorage.clear();
}

/** @returns {Options[keyof Options]} */
function parseLocalStorageValue(
	/** @type {string | null} */ value,
	/** @type {Options[keyof Options]} */ defaultValue
) {
	if (value == null) return defaultValue;

	switch (typeof defaultValue) {
		case 'number': {
			const number = parseFloat(value);
			return isNaN(number) ? defaultValue : number;
		}
		case 'boolean':
			return value === 'true';
		case 'object':
			try {
				return JSON.parse(value);
			} catch {
				return defaultValue;
			}
		default:
			return value;
	}
}

// State
export const allImages = signal(/** @type {string[]} */ ([]));
export const linkedImages = signal(/** @type {string[]} */ ([]));
export const imageDimensions = signal(/** @type {Record<string, { width: number; height: number }>} */ ({}));
export const imagesLoadedVersion = signal(0);

export const imagesCache = { value: /** @type {HTMLDivElement | null} */ (null) }; // Not displayed; used for loading images and their stats like size or resolution

export const imageLoaded = action(
	(/** @type {string | undefined} */ url, /** @type {number} */ width = 0, /** @type {number} */ height = 0) => {
		if (!url) return;

		recordPerfMetric('event:imageLoaded', 0);
		batch(() => {
			if (width > 0 && height > 0) {
				const existing = imageDimensions.peek()[url];
				if (!existing || width * height > existing.width * existing.height) {
					imageDimensions.value = { ...imageDimensions.peek(), [url]: { width, height } };
				}
			}
			if (erroredImages.peek().includes(url)) {
				erroredImages.value = erroredImages.value.filter(isNotStrictEqual(url));
			}
			imagesLoadedVersion.value++;
		});
	}
);

export const erroredImages = signal(/** @type {string[]} */ ([]));
export const imageErrored = action((/** @type {string | undefined} */ url) => {
	if (!url) return;

	batch(() => {
		if (!erroredImages.peek().includes(url)) {
			// Use `allImages` to preserve order
			erroredImages.value = allImages.value.filter(isIncludedIn([...erroredImages.value, url]));
		}
		imagesLoadedVersion.value++;
	});
});

export function normalizeExtension(/** @type {string} */ ext) {
	if (!ext) return '';
	const lower = ext.toLowerCase();
	if (lower === 'jpeg' || lower === 'jfif') return 'jpg';
	if (lower === 'tiff') return 'tif';
	if (lower === 'x-icon') return 'ico';
	return lower;
}

/** @type {import('@preact/signals').Signal<Record<string, string>>} */
export const detectedImageExtensions = signal({});

export const updateDetectedExtension = action((/** @type {string} */ url, /** @type {string} */ ext) => {
	if (!url || !ext) return;
	const normalized = normalizeExtension(ext);
	if (!normalized) return;
	const current = detectedImageExtensions.peek();
	if (current[url] === normalized) return;
	detectedImageExtensions.value = {
		...current,
		[url]: normalized,
	};
});

export const availableFormats = computed(() => {
	const counts = /** @type {Record<string, number>} */ ({});
	const detected = detectedImageExtensions.value;
	for (const url of allImages.value) {
		const rawExt = detected[url] || getImageExtension(url);
		const ext = normalizeExtension(rawExt) || 'other';
		counts[ext] = (counts[ext] || 0) + 1;
	}
	return Object.entries(counts)
		.map(([format, count]) => ({ format, count }))
		.sort((a, b) => b.count - a.count);
});

// Tabs
export const tab = signal('matching');

function getFilterableUrl(/** @type {string} */ url) {
	if (url.startsWith('data:') && url.length > 256) {
		const commaIndex = url.indexOf(',');
		return url.slice(0, commaIndex !== -1 ? Math.min(commaIndex + 1, 128) : 128);
	}
	return url.length > 2048 ? url.slice(0, 2048) : url;
}

export const matchingImages = computed(() => {
	return measurePerf('computed:matchingImages', () => {
		let filtered = onlyImagesFromLinks.value ? linkedImages.value : allImages.value;

		let filterValue = filterUrl.value;
		if (filterValue) {
			switch (filterUrlMode.value) {
				case 'normal':
					const terms = filterValue.split(/\s+/);
					filtered = filtered.filter((url) => {
						const targetUrl = getFilterableUrl(url);
						for (let index = 0; index < terms.length; index++) {
							let term = terms[index];
							if (term.length !== 0) {
								const expected = term[0] !== '-';
								if (!expected) {
									term = term.substr(1);
									if (term.length === 0) {
										continue;
									}
								}
								const found = targetUrl.indexOf(term) !== -1;
								if (found !== expected) {
									return false;
								}
							}
						}
						return true;
					});
					break;
				case 'wildcard':
					filterValue = filterValue
						.replace(/([.^$[\]\\(){}|+-])/g, '\\$1')
						.replace(/\*+/g, '.*')
						.replace(/\?/g, '.');
				/* fall through */
				case 'regex':
					try {
						const regex = new RegExp(filterValue);
						filtered = filtered.filter((url) => regex.test(getFilterableUrl(url)));
					} catch (error) {
						filtered = [];
					}
					break;
			}
		}

		// Subscribe to imagesLoadedVersion so matchingImages re-evaluates when images finish loading
		imagesLoadedVersion.value;
		const currentDimensions = imageDimensions.value;
		/** @type {Record<string, { width: number; height: number }>} */
		const effectiveDimensions = { ...currentDimensions };
		/** @type {Map<string, HTMLImageElement> | null} */
		let domImagesBySrc = null;
		const getDomImage = (/** @type {string} */ src) => {
			if (!imagesCache.value) return undefined;
			if (!domImagesBySrc) {
				domImagesBySrc = new Map();
				for (const img of imagesCache.value.querySelectorAll('img')) {
					const attr = img.getAttribute('src');
					if (attr && !domImagesBySrc.has(attr)) {
						domImagesBySrc.set(attr, img);
					}
				}
			}
			return domImagesBySrc.get(src);
		};

		const preset = filterSizePreset.value;
		const activeFormats = selectedFormats.value;
		const largeThreshold = customLargeThreshold.value;
		const smallThreshold = customSmallThreshold.value;

		filtered = filtered.filter((url) => {
			if (!imagesCache.value) return false;

			const cachedDim = effectiveDimensions[url];
			let width = cachedDim?.width;
			let height = cachedDim?.height;

			if (width == null || height == null) {
				const image = getDomImage(url);
				width = image?.naturalWidth || 0;
				height = image?.naturalHeight || 0;
				if (width > 0 && height > 0) {
					effectiveDimensions[url] = { width, height };
				}
			}

			// Size preset logic
			let matchesSize = true;
			if (preset !== 'all' && preset !== 'custom') {
				const maxDim = Math.max(width, height);
				if (preset === 'large') {
					matchesSize = maxDim >= largeThreshold;
				} else if (preset === 'medium') {
					matchesSize = maxDim >= smallThreshold && maxDim < largeThreshold;
				} else if (preset === 'small') {
					matchesSize = maxDim > 0 && maxDim < smallThreshold;
				}
			}

			// Format filter logic
			let matchesFormat = true;
			if (activeFormats.length > 0) {
				const detected = detectedImageExtensions.value;
				const rawExt = detected[url] || getImageExtension(url);
				const ext = normalizeExtension(rawExt) || 'other';
				matchesFormat = activeFormats.includes(ext);
			}

			return (
				matchesSize &&
				matchesFormat &&
				// image && <-- we don't want this, it results in overly filtered images on initial load
				(!filterMinWidthEnabled.value || filterMinWidth.value <= width) &&
				(!filterMaxWidthEnabled.value || width <= filterMaxWidth.value) &&
				(!filterMinHeightEnabled.value || filterMinHeight.value <= height) &&
				(!filterMaxHeightEnabled.value || height <= filterMaxHeight.value) &&
				(!hideErroredImages.value || !erroredImages.value.includes(url))
			);
		});

		if (onlyUniqueImages.value && imagesCache.value) {
			filtered = deduplicateImages(filtered, imagesCache.value, effectiveDimensions);
		}

		return filtered;
	});
});

export const filteredOutImages = computed(() => allImages.value.filter(isNotIncludedIn(matchingImages.value)));

export const displayedImages = computed(() => {
	return (
		{
			matching: matchingImages.value,
			filtered_out: filteredOutImages.value,
		}[tab.value] ?? []
	);
});

// Selection
export const selectedMatchingImages = computed(() => selectedImages.value.filter(isIncludedIn(matchingImages.value)));
export const selectedFilteredOutImages = computed(() =>
	selectedImages.value.filter(isIncludedIn(filteredOutImages.value))
);
export const currentSelectedImages = computed(() =>
	tab.value === 'matching' ? selectedMatchingImages.value : selectedFilteredOutImages.value
);

// Loading
export const hostname = signal('');
export const pageTitle = signal('');
export const pageUrl = signal('');
export const limitedAccessHostnames = /\.google\.com/;

export const scriptError = signal('');

const browserPageUrl = /^(about|chrome|chrome-extension|edge|moz-extension|view-source):/;

function executeOnTab(
	/** @type {chrome.tabs.Tab | { id: number, url?: string, title?: string }} */ activeTab,
	/** @type {number | false} */ waitForIdleDOM
) {
	if (activeTab.url) {
		pageUrl.value = activeTab.url;
		try {
			hostname.value = new URL(activeTab.url).hostname;
		} catch (error) {
			hostname.value = activeTab.url;
		}
	}
	if (activeTab.title) {
		pageTitle.value = activeTab.title;
	}

	scriptError.value = '';
	if (activeTab.id == null) return;
	const tabId = activeTab.id;

	chrome.scripting
		.executeScript({
			target: { tabId, allFrames: true },
			func: findImages,
			args: [{ waitForIdleDOM }],
		})
		.then((messages) => Promise.all(messages.map((message) => withBlobUrlsRead(tabId, message))))
		.then((messages) => {
			batch(() => {
				allImages.value = unique(messages.flatMap((message) => message.result?.allImages || []));
				linkedImages.value = unique(messages.flatMap((message) => message.result?.linkedImages || []));
				const dimensions = /** @type {Record<string, { width: number; height: number }>} */ ({});
				for (const message of messages) {
					if (message.result?.imageDimensions) {
						Object.assign(dimensions, message.result.imageDimensions);
					}
				}
				imageDimensions.value = dimensions;
				// Use `allImages` to preserve original DOM order.
				erroredImages.value = allImages.value.filter(isIncludedIn(erroredImages.value));
				selectedImages.value = allImages.value.filter(isIncludedIn(selectedImages.value));

				// Reset detected extensions and prune invalid formats that do not exist on the new page
				detectedImageExtensions.value = {};
				if (selectedFormats.value.length > 0) {
					const currentFormats = new Set(
						allImages.value.map((url) => normalizeExtension(getImageExtension(url)) || 'other')
					);
					selectedFormats.value = selectedFormats.value.filter((fmt) => currentFormats.has(fmt));
				}

				const topMessage = messages.find((m) => m.frameId === 0);
				if (topMessage?.result?.origin) {
					try {
						hostname.value = new URL(topMessage.result.origin).hostname;
					} catch (error) {
						// ignore
					}
				}
				const resolvedTitle = topMessage?.result?.title || activeTab.title || '';
				if (resolvedTitle) {
					pageTitle.value = resolvedTitle;
				}

				if (!isFolderCustomized.value) {
					folderName.value = sanitizeFolderName(pageTitle.value || activeTab.title, hostname.value);
				}
			});

			if (!waitForIdleDOM) {
				loadImagesFromActiveTab({ waitForIdleDOM: 1000 });
			}
		})
		.catch((error) => {
			const msg = error?.message || '';
			// Ignore expected browser/permission errors that happen regularly when navigating around
			if (
				msg === 'Cannot access a chrome:// URL' ||
				msg.startsWith('Cannot access a chrome') ||
				msg.startsWith('Cannot access contents of') ||
				msg.includes('extensions gallery cannot be scripted') ||
				msg.includes('Frame with ID') ||
				msg.includes('No tab with id')
			) {
				return;
			}
			// Extensions can't access browser pages, and Firefox's error for them is the same as for losing access to a web page
			if (activeTab.url && browserPageUrl.test(activeTab.url)) return;

			scriptError.value = msg;
		});
}

/** @type {number | null} */
let lockedTabId = null;

export function getLockedTabId() {
	if (lockedTabId != null) return lockedTabId;
	const urlTabId = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tabId');
	if (urlTabId) {
		lockedTabId = parseInt(urlTabId, 10);
		return lockedTabId;
	}
	return null;
}

export function setLockedTabId(/** @type {number | null} */ tabId) {
	lockedTabId = tabId;
}

export const loadImagesFromActiveTab = action(
	(/** @type {{ waitForIdleDOM: number | false }} */ { waitForIdleDOM } = { waitForIdleDOM: false }) => {
		const targetId = getLockedTabId();
		if (targetId != null) {
			if (chrome.tabs.get) {
				chrome.tabs.get(targetId, (tab) => {
					if (chrome.runtime?.lastError || !tab) return;
					executeOnTab(tab, waitForIdleDOM);
				});
			} else {
				executeOnTab({ id: targetId }, waitForIdleDOM);
			}
			return;
		}

		chrome.windows.getCurrent((currentWindow) => {
			if (chrome.runtime?.lastError || !currentWindow) return;
			chrome.tabs.query({ active: true, windowId: currentWindow.id }, (activeTabs) => {
				if (chrome.runtime?.lastError || !activeTabs || activeTabs.length === 0) return;
				const activeTab = activeTabs[0];
				if (activeTab.id != null) {
					setLockedTabId(activeTab.id);
				}
				executeOnTab(activeTab, waitForIdleDOM);
			});
		});
	}
);

/**
 * Neither the popup nor `findImages()` can read the page's `blob:` URLs - see `readBlobUrls()`.
 * @template {{ frameId: number, result?: ReturnType<typeof findImages> extends Promise<infer R> ? R : never }} Message
 */
async function withBlobUrlsRead(/** @type {number} */ tabId, /** @type {Message} */ message) {
	const { result } = message;
	if (!result) return message;

	const blobUrls = unique([...result.allImages, ...result.linkedImages].filter((url) => url.startsWith('blob:')));
	if (blobUrls.length === 0) return message;

	const [injection] = await chrome.scripting
		.executeScript({
			target: { tabId, frameIds: [message.frameId] },
			world: 'MAIN',
			func: readBlobUrls,
			args: [blobUrls],
		})
		.catch(() => []);
	/** @type {string[]} */
	const dataUrls = injection?.result || [];

	// The page's world can return anything, so keep only image `data:` URLs
	const dataUrlsByBlobUrl = new Map(
		blobUrls.map((url, index) => [url, dataUrls[index]?.startsWith('data:image/') ? dataUrls[index] : url])
	);
	const read = (/** @type {string} */ url) => dataUrlsByBlobUrl.get(url) ?? url;
	return {
		...message,
		result: { ...result, allImages: result.allImages.map(read), linkedImages: result.linkedImages.map(read) },
	};
}

async function extractImagesFromTab(/** @type {any} */ tab, /** @type {number | false} */ waitForIdleDOM) {
	if (tab.id == null) return null;
	const tabId = tab.id;
	try {
		console.info(`[ID-Window] 🔍 Extracting from Tab ${tabId} ("${tab.title || tab.url || 'Pending Tab'}") ...`);
		const messages = await chrome.scripting.executeScript({
			target: { tabId, allFrames: true },
			func: findImages,
			args: [{ waitForIdleDOM }],
		});
		const processed = await Promise.all(messages.map((m) => withBlobUrlsRead(tabId, m)));
		const tabAllImages = unique(processed.flatMap((m) => m.result?.allImages || []));
		const tabLinkedImages = unique(processed.flatMap((m) => m.result?.linkedImages || []));
		const dimensions = /** @type {Record<string, { width: number; height: number }>} */ ({});
		for (const m of processed) {
			if (m.result?.imageDimensions) {
				Object.assign(dimensions, m.result.imageDimensions);
			}
		}
		const topMessage = processed.find((m) => m.frameId === 0);
		const tabTitle = topMessage?.result?.title || tab.title || '';
		const tabOrigin = topMessage?.result?.origin || '';
		console.info(`[ID-Window] ✅ Tab ${tabId} success: ${tabAllImages.length} images found (title: "${tabTitle}")`);
		return {
			allImages: tabAllImages,
			linkedImages: tabLinkedImages,
			imageDimensions: dimensions,
			title: tabTitle,
			origin: tabOrigin,
		};
	} catch (error) {
		const errMsg = /** @type {any} */ (error)?.message || String(error);
		console.warn(`[ID-Window] ⚠️ Tab ${tabId} extraction failed:`, errMsg);
		throw error;
	}
}

export const loadImagesFromCurrentWindow = action(
	(/** @type {{ waitForIdleDOM: number | false }} */ { waitForIdleDOM } = { waitForIdleDOM: false }) => {
		return new Promise((resolve) => {
			chrome.windows.getCurrent(async (currentWindow) => {
				if (chrome.runtime?.lastError || !currentWindow) {
					console.warn('[ID-Window] ⚠️ Failed to get current window:', chrome.runtime?.lastError?.message);
					resolve(undefined);
					return;
				}
				chrome.tabs.query({ windowId: currentWindow.id }, async (tabs) => {
					if (chrome.runtime?.lastError || !tabs || tabs.length === 0) {
						console.warn('[ID-Window] ⚠️ Failed to query tabs for window:', chrome.runtime?.lastError?.message);
						resolve(undefined);
						return;
					}

					console.info(
						`[ID-Window] 🗂️ Query returned ${tabs.length} tabs for window ${currentWindow.id}:`,
						tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, active: t.active }))
					);

					const validTabs = tabs.filter((t) => t.id != null && (!t.url || !browserPageUrl.test(t.url)));
					console.info(`[ID-Window] 🎯 Usable web tabs after system filtering: ${validTabs.length}`);

					if (validTabs.length === 0) {
						tabGroups.value = [];
						resolve(undefined);
						return;
					}

					const existingGroupsMap = new Map(tabGroups.value.map((/** @type {TabGroup} */ g) => [g.id, g]));
					/** @type {TabGroup[]} */
					const groups = validTabs.map((t) => {
						const tabId = /** @type {number} */ (t.id);
						const existing = existingGroupsMap.get(tabId);
						let h = t.url || '';
						try {
							h = new URL(t.url || '').hostname;
						} catch {}
						return {
							id: tabId,
							title: t.title || h || `Tab ${tabId}`,
							url: t.url || '',
							hostname: h,
							favIconUrl: t.favIconUrl || '',
							folderName: sanitizeFolderName(t.title || h, h),
							allImages: existing?.allImages || [],
							linkedImages: existing?.linkedImages || [],
							imageDimensions: existing?.imageDimensions || {},
							status:
								existing?.status === 'loaded'
									? 'loaded'
									: /** @type {'idle' | 'loading' | 'loaded' | 'error'} */ ('loading'),
							error: existing?.error || '',
							collapsed: existing?.collapsed ?? false,
							selected: existing?.selected ?? true,
						};
					});

					tabGroups.value = groups;

					const tabResults = await Promise.allSettled(
						validTabs.map(async (tab, index) => {
							try {
								const res = await extractImagesFromTab(tab, waitForIdleDOM);
								return { index, tab, res };
							} catch (err) {
								const errMsg = /** @type {any} */ (err)?.message || String(err);
								return { index, tab, error: errMsg };
							}
						})
					);

					batch(() => {
						const newMap = new Map();
						const aggregatedAll = [];
						const aggregatedLinked = [];
						const aggregatedDimensions = /** @type {Record<string, { width: number; height: number }>} */ ({});

						const rawFolderNames = groups.map((group, idx) => {
							const resultItem = tabResults[idx];
							if (resultItem.status === 'fulfilled' && resultItem.value.res) {
								const safeTitle = resultItem.value.res.title || group.title;
								return sanitizeFolderName(safeTitle, group.hostname);
							}
							return group.folderName;
						});
						const uniqueFolderNames = disambiguateFolderNames(rawFolderNames);

						/** @type {TabGroup[]} */
						const updatedGroups = groups.map((group, idx) => {
							const resultItem = tabResults[idx];
							const folder = uniqueFolderNames[idx];
							if (resultItem.status === 'fulfilled') {
								const { res, error } = resultItem.value;
								if (res) {
									const safeTitle = res.title || group.title;
									return {
										...group,
										title: safeTitle,
										folderName: folder,
										allImages: res.allImages,
										linkedImages: res.linkedImages,
										imageDimensions: res.imageDimensions,
										status: /** @type {'idle' | 'loading' | 'loaded' | 'error'} */ ('loaded'),
									};
								} else if (error) {
									return {
										...group,
										folderName: folder,
										status: /** @type {'idle' | 'loading' | 'loaded' | 'error'} */ ('error'),
										error,
									};
								}
							}
							return { ...group, folderName: folder };
						});

						tabGroups.value = updatedGroups;

						for (const g of updatedGroups) {
							aggregatedAll.push(...g.allImages);
							aggregatedLinked.push(...g.linkedImages);
							Object.assign(aggregatedDimensions, g.imageDimensions);

							for (const imgUrl of g.allImages) {
								newMap.set(imgUrl, {
									tabId: g.id,
									title: g.title,
									folderName: g.folderName,
								});
							}
						}

						imageToTabMap.value = newMap;
						allImages.value = unique(aggregatedAll);
						linkedImages.value = unique(aggregatedLinked);
						imageDimensions.value = aggregatedDimensions;
						erroredImages.value = allImages.value.filter(isIncludedIn(erroredImages.value));
						selectedImages.value = allImages.value.filter(isIncludedIn(selectedImages.value));

						console.info(
							`[ID-Window] 📊 Aggregated total: ${allImages.value.length} unique images across ${updatedGroups.length} tabs`
						);

						if (!isFolderCustomized.value) {
							// In window mode with subfolders, leave parent folderName empty so images download
							// directly into each tab's subfolder (e.g. <Downloads>/<Tab_Title>/<file>) without a redundant outer wrapper.
							folderName.value = '';
						}
					});

					if (!waitForIdleDOM) {
						loadImagesFromCurrentWindow({ waitForIdleDOM: 1000 });
					}
					resolve(undefined);
				});
			});
		});
	}
);

export const toggleTabGroupSelection = action((/** @type {number} */ tabId, /** @type {boolean} */ selected) => {
	batch(() => {
		const target = tabGroups.value.find((/** @type {TabGroup} */ g) => g.id === tabId);
		if (!target) return;
		target.selected = selected;
		tabGroups.value = [...tabGroups.value];

		const tabImageSet = new Set(target.allImages);
		if (selected) {
			const toAdd = target.allImages.filter((/** @type {string} */ img) => !selectedImages.value.includes(img));
			selectedImages.value = [...selectedImages.value, ...toAdd];
		} else {
			selectedImages.value = selectedImages.value.filter((img) => !tabImageSet.has(img));
		}
	});
});

export const toggleTabGroupCollapse = action((/** @type {number} */ tabId) => {
	tabGroups.value = tabGroups.value.map((/** @type {TabGroup} */ g) =>
		g.id === tabId ? { ...g, collapsed: !g.collapsed } : g
	);
});

export const setAllTabGroupsCollapsed = action((/** @type {boolean} */ collapsed) => {
	tabGroups.value = tabGroups.value.map((/** @type {TabGroup} */ g) => ({ ...g, collapsed }));
});

export const reloadImagesWhenPageLoads = action(
	(/** @type {number | undefined}*/ tabId, /** @type {any} */ changeInfo, /** @type {any} */ tab) => {
		const targetId = getLockedTabId();
		if (targetId != null) {
			if (!tab || tabId !== targetId) return;
		}

		if (!tab) {
			hostname.value = '';
			loadImagesFromActiveTab({ waitForIdleDOM: 1 });
			return;
		}

		if (tab?.active || (targetId != null && tabId === targetId)) {
			if (changeInfo?.url) {
				isFolderCustomized.value = false;
				pageUrl.value = tab?.url || changeInfo.url;
				try {
					hostname.value = new URL(tab.url).hostname;
				} catch (error) {
					hostname.value = tab.url;
				}
			}

			if (changeInfo?.status === 'complete') {
				loadImagesFromActiveTab({ waitForIdleDOM: false });
			}
		}
	}
);
