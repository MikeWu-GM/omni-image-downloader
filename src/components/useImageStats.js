// @ts-check
import { useSignal } from '../html.js';

/**
 * @typedef {Object} ImageSize
 * @property {number} bytes
 * @property {string} formatted
 * @property {boolean} fromCache
 */

/**
 * @typedef {Object} ImageStatsData
 * @property {number} width
 * @property {number} height
 * @property {ImageSize | null} size
 * @property {string} extension
 * @property {'idle' | 'loaded' | 'error'} status
 */

/**
 * @typedef {Object} ImageStats
 * @property {{ value: ImageStatsData }} data
 * @property {(event: Event) => void} onLoad
 * @property {() => void} onError
 * @property {() => void} reset
 */

/** @type {Map<string, ImageStatsData>} */
const cache = new Map();
const MAX_CACHE_SIZE = 500;

/**
 * @typedef {(url: string, extension: string) => void} OnExtensionDetected
 */

/** @returns {ImageStats} */
export function useImageStats(
	/** @type {string} */ imageUrl,
	/** @type {OnExtensionDetected | undefined} */ onExtensionDetected = undefined
) {
	const cached = cache.get(imageUrl);

	if (cached?.extension && onExtensionDetected) {
		onExtensionDetected(imageUrl, cached.extension);
	}

	/** @type {{ value: ImageStatsData }} */
	const data = useSignal(
		cached || {
			width: 0,
			height: 0,
			size: null,
			extension: '',
			status: /** @type {ImageStatsData['status']} */ ('idle'),
		}
	);

	function onLoad(/** @type {Event} */ e) {
		const img = /** @type {HTMLImageElement} */ (e.currentTarget);
		const url = img.currentSrc || img.src;
		const size = getImageResourceSize(img);
		const urlExtension = getImageExtension(url);

		const loaded = {
			width: img.naturalWidth,
			height: img.naturalHeight,
			size,
			extension: urlExtension,
			status: /** @type {'loaded'} */ ('loaded'),
		};

		if (cache.size >= MAX_CACHE_SIZE) {
			const firstKey = cache.keys().next().value;
			if (firstKey !== undefined) cache.delete(firstKey);
		}
		cache.set(url, loaded);
		data.value = loaded;

		if (urlExtension && onExtensionDetected) {
			onExtensionDetected(url, urlExtension);
		}

		// Refine extension via fetch if URL parsing was inconclusive
		if (!urlExtension) {
			fetchImageExtension(url).then((extension) => {
				if (extension) {
					data.value = { ...data.value, extension };
					cache.set(url, data.value);
					onExtensionDetected?.(url, extension);
				}
			});
		}
	}

	function onError() {
		data.value = {
			width: 0,
			height: 0,
			size: null,
			extension: '',
			status: 'error',
		};
	}

	function reset() {
		cache.delete(imageUrl);
		data.value = {
			width: 0,
			height: 0,
			size: null,
			extension: '',
			status: 'idle',
		};
	}

	return {
		data,
		onLoad,
		onError,
		reset,
	};
}

export const KNOWN_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'avif',
	'svg',
	'bmp',
	'ico',
	'tiff',
	'tif',
	'jfif',
	'cur',
	'apng',
]);

/** @returns {string} */
export function getImageExtension(/** @type {string} */ url) {
	if (!url) return '';

	// Handle data URIs: data:image/png;base64,... or data:image/svg+xml,...
	if (url.startsWith('data:image/')) {
		const match = url.match(/^data:image\/([a-zA-Z0-9+]+)[;,]/);
		if (!match) return '';
		const mimeType = match[1].toLowerCase();
		// Extract base type from compound types like 'svg+xml'
		return mimeType.split('+')[0];
	}

	// Blob URLs have no extension; MIME detection requires fetch
	if (url.startsWith('blob:')) return '';

	// Extract pathname and query
	let pathname = '';
	let searchParams = /** @type {URLSearchParams | null} */ (null);
	try {
		const parsed = new URL(url);
		pathname = parsed.pathname;
		searchParams = parsed.searchParams;
	} catch {
		try {
			const parsed = new URL(url, 'https://placeholder.internal');
			pathname = parsed.pathname;
			searchParams = parsed.searchParams;
		} catch {
			const parts = url.split('?');
			pathname = parts[0].split('#')[0];
		}
	}

	// 1. Direct trailing extension: e.g. /path/to/image.jpg (must match KNOWN_EXTENSIONS)
	const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
	if (match && KNOWN_EXTENSIONS.has(match[1].toLowerCase())) {
		return match[1].toLowerCase();
	}

	// 2. Trailing extension followed by CDN pipeline processing symbols: e.g. .webp!thumb, .webp@watermark, .png/strip
	const pipelineMatch = pathname.match(/\.([a-zA-Z0-9]+)[!@~/]/);
	if (pipelineMatch && KNOWN_EXTENSIONS.has(pipelineMatch[1].toLowerCase())) {
		return pipelineMatch[1].toLowerCase();
	}

	// 3. Cloud image processing format in pathname: e.g. /format,webp or /format/webp
	const pathFormatMatch = pathname.match(/\/(?:format|fmt)[,/]([a-zA-Z0-9]+)/i);
	if (pathFormatMatch && KNOWN_EXTENSIONS.has(pathFormatMatch[1].toLowerCase())) {
		return pathFormatMatch[1].toLowerCase();
	}

	// 4. Query parameters format indicators: e.g. ?wx_fmt=webp, ?format=jpg, ?f=webp
	if (searchParams) {
		const formatParams = ['format', 'type', 'output', 'ext', 'fmt', 'wx_fmt', 'wxfmt', 'f'];
		for (const param of formatParams) {
			const value = searchParams.get(param)?.toLowerCase();
			if (value && (KNOWN_EXTENSIONS.has(value) || value === 'jpeg')) {
				return value;
			}
		}

		// Also check query param values containing cloud format transformations (e.g. x-oss-process=image/format,webp)
		for (const [, val] of searchParams.entries()) {
			const ossMatch = val.match(/(?:format|fmt)[,/]([a-zA-Z0-9]+)/i);
			if (ossMatch && KNOWN_EXTENSIONS.has(ossMatch[1].toLowerCase())) {
				return ossMatch[1].toLowerCase();
			}
		}
	}

	return '';
}

/** @type {Record<string, string>} */
const mimeExtensions = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
	'image/bmp': 'bmp',
	'image/tiff': 'tiff',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
};

const MAX_CONCURRENT_EXTENSION_FETCHES = 4;
let activeExtensionFetches = 0;
/** @type {((value?: any) => void)[]} */
const extensionFetchQueue = [];
/** @type {Map<string, Promise<string>>} */
const inFlightExtensionFetches = new Map();

function acquireExtensionFetchSlot() {
	if (activeExtensionFetches < MAX_CONCURRENT_EXTENSION_FETCHES) {
		activeExtensionFetches += 1;
		return Promise.resolve();
	}
	return new Promise((/** @type {(value?: any) => void} */ resolve) => {
		extensionFetchQueue.push(resolve);
	});
}

function releaseExtensionFetchSlot() {
	const next = extensionFetchQueue.shift();
	if (next) {
		next();
	} else if (activeExtensionFetches > 0) {
		activeExtensionFetches -= 1;
	}
}

/** @returns {Promise<string>} */
export function fetchImageExtension(/** @type {string} */ url) {
	if (!url) return Promise.resolve('');

	const existing = inFlightExtensionFetches.get(url);
	if (existing) return existing;

	const promise = (async () => {
		await acquireExtensionFetchSlot();
		try {
			// Blob URLs: fetch the blob and read its type property
			if (url.startsWith('blob:')) {
				const response = await fetch(url);
				const blob = await response.blob();
				return mimeExtensions[blob.type] || blob.type.replace('image/', '') || '';
			}

			// Try HEAD request from browser cache
			const response = await fetch(url, {
				method: 'HEAD',
				cache: 'force-cache',
			});

			if (response.ok) {
				const contentType = response.headers.get('content-type');
				if (contentType) {
					const mime = contentType.split(';')[0].trim().toLowerCase();
					return mimeExtensions[mime] || (mime.startsWith('image/') ? mime.replace('image/', '') : '');
				}
			}
		} catch {
			// CORS blocked, unreadable blob, or network error
		} finally {
			releaseExtensionFetchSlot();
			inFlightExtensionFetches.delete(url);
		}

		return '';
	})();

	inFlightExtensionFetches.set(url, promise);
	return promise;
}

/** @returns {ImageSize | null} */
export function getImageResourceSize(/** @type {HTMLImageElement} */ img) {
	const url = img.src;
	if (!url) return null;

	// Data URIs: decode base64 payload to estimate byte size
	if (url.startsWith('data:')) {
		const base64Index = url.indexOf('base64,');
		if (base64Index !== -1) {
			try {
				const base64 = url.slice(base64Index + 7);
				const bytes = atob(base64).length;
				return {
					bytes,
					formatted: formatFileSize(bytes),
					fromCache: false,
				};
			} catch {
				return null;
			}
		}
		// Non-base64 data URI (e.g. SVG encoded as text)
		const commaIndex = url.indexOf(',');
		if (commaIndex !== -1) {
			const bytes = decodeURIComponent(url.slice(commaIndex + 1)).length;
			return {
				bytes,
				formatted: formatFileSize(bytes),
				fromCache: false,
			};
		}
		return null;
	}

	const entries = performance.getEntriesByName(url);
	const entry = entries.find((entry) => /** @type {PerformanceResourceTiming} */ (entry).initiatorType === 'img');

	if (!entry) return null;

	const resourceEntry = /** @type {PerformanceResourceTiming} */ (entry);
	const encodedSize = resourceEntry.encodedBodySize || resourceEntry.transferSize;
	const decodedSize = resourceEntry.decodedBodySize;

	if (!encodedSize && !decodedSize) return null;

	const fromCache = resourceEntry.transferSize === 0 || (resourceEntry.transferSize === undefined && encodedSize > 0);

	const bytes = encodedSize || decodedSize;

	return {
		bytes,
		formatted: formatFileSize(bytes),
		fromCache,
	};
}

/** @returns {string} */
export function formatFileSize(/** @type {number} */ bytes) {
	if (bytes === 0 || bytes == null || isNaN(bytes)) return '';

	const units = ['KB', 'MB', 'GB'];
	const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024)) - 1);
	const size = (bytes / Math.pow(1024, i + 1)).toFixed(1);
	return `${size.endsWith('.0') ? size.slice(0, -2) : size}${units[i]}`;
}
