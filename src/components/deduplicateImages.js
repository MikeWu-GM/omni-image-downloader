// @ts-check
import { findImageBySrc, measurePerf, recordPerfMetric, unique } from '../utils.js';
import { normalizeExtension } from './data.js';
import { getImageExtension } from './useImageStats.js';

const priorities = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'avif'];
/** @type {Map<string, string>} */
const normalizedKeyCache = new Map();
const MAX_KEY_CACHE_SIZE = 2000;

/**
 * @param {string[]} urls
 * @param {HTMLDivElement} imagesCache
 * @param {Record<string, { width: number; height: number }>} [imageDimensions]
 */
export function deduplicateImages(urls, imagesCache, imageDimensions = {}) {
	return measurePerf(`dedup:deduplicateImages(${urls.length} images)`, () => {
		const keysByUrl = new Map(urls.map((url) => [url, getCachedNormalizedBaseKey(url)]));
		const keys = new Set(keysByUrl.values());

		const groups = new Map();
		for (const url of urls) {
			const key = removeWidthSuffix(/** @type {string} */ (keysByUrl.get(url)), keys);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(url);
		}

		const result = [];
		for (const groupUrls of groups.values()) {
			const bestImageUrl = pickBestImageUrl(groupUrls, imagesCache, imageDimensions);
			if (bestImageUrl) {
				result.push(bestImageUrl);
			}
		}
		return result;
	});
}

function getCachedNormalizedBaseKey(/** @type {string} */ url) {
	if (url.startsWith('data:')) return url;
	const cached = normalizedKeyCache.get(url);
	if (cached !== undefined) return cached;
	const computedKey = getNormalizedBaseKey(url);
	if (normalizedKeyCache.size >= MAX_KEY_CACHE_SIZE) {
		const firstKey = normalizedKeyCache.keys().next().value;
		if (firstKey !== undefined) normalizedKeyCache.delete(firstKey);
	}
	normalizedKeyCache.set(url, computedKey);
	return computedKey;
}

// A bare `-<digits>` suffix (`banner-1920`) is a width only when the unsuffixed image
// is on the page too; otherwise it is likely part of the name (`report-2026`).
function removeWidthSuffix(/** @type {string} */ key, /** @type {Set<string>} */ keys) {
	const unsuffixedKey = key.replace(/-\d+$/, '');
	return keys.has(unsuffixedKey) ? unsuffixedKey : key;
}

// Common country suffixes like .co.uk and .com.au, so sites under them aren't treated as one domain.
const secondLevelLabels = ['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'ne', 'or'];

function hasTwoPartSuffix(/** @type {string[]} */ hostnameParts) {
	const [secondLevel, topLevel] = hostnameParts.slice(-2);
	return hostnameParts.length > 2 && topLevel.length === 2 && secondLevelLabels.includes(secondLevel);
}

/** @returns {string} */
function getNormalizedBaseKey(/** @type {string} */ url) {
	if (url.startsWith('data:')) return url;

	try {
		const parsed = new URL(url);

		const rawExt = getImageExtension(url);
		const normalizedExt = normalizeExtension(rawExt);
		let cleanPathname = parsed.pathname;

		if (rawExt && (priorities.includes(rawExt) || priorities.includes(normalizedExt))) {
			cleanPathname = cleanPathname.replace(new RegExp(`\\.${rawExt}(?:[!@~/].*)?$`, 'i'), '');
		} else {
			const parts = cleanPathname.split('.');
			if (parts.length > 1 && priorities.includes(/** @type {string} */ (parts.at(-1)))) {
				cleanPathname = parts.slice(0, -1).join('.');
			}
		}

		// Get base name without resolution suffixes
		const basename = cleanPathname.replace(/(?:[-_](?:\d{2,4}x\d{2,4}|\d{2,4}w)|@\d+x|@._V1_(FMjpg_UY\d+_?)?)$/i, '');

		// Extract identifier: look for hash-like pattern at end (e.g., 7qulxnmlw8sg1 from longer names).
		// Shorter names like photo01 recur across folders for different images.
		const identifierMatch = basename.match(/((?=[a-zA-Z0-9]*\d)(?=[a-zA-Z0-9]*[a-zA-Z])[a-zA-Z0-9]{10,})$/);
		const identifier = identifierMatch ? identifierMatch[1] : basename;

		// Extract special query params
		const urlParamKeys = ['url', 'domain'];
		for (const key of urlParamKeys) {
			const value = parsed.searchParams.get(key);
			if (value) {
				const decodedUrl = decodeURIComponent(value);

				if (decodedUrl.startsWith('http:') || decodedUrl.startsWith('https:')) {
					const ampIndex = decodedUrl.indexOf('&');
					return ampIndex !== -1
						? getNormalizedBaseKey(decodedUrl.slice(0, ampIndex) + '?' + decodedUrl.slice(ampIndex + 1))
						: getNormalizedBaseKey(decodedUrl);
				}

				if (decodedUrl.startsWith('/')) {
					const ampIndex = decodedUrl.indexOf('&');
					if (ampIndex !== -1) {
						return getNormalizedBaseKey(
							parsed.origin + decodedUrl.slice(0, ampIndex) + '?' + decodedUrl.slice(ampIndex + 1)
						);
					}
					return getNormalizedBaseKey(parsed.origin + decodedUrl);
				}

				// Attempt to add a protocol and parse the value
				try {
					return new URL(`https://${value}`).href;
				} catch (error) {
					// ignore
				}
			}
		}

		// Normalize subdomain: use hostname without subdomain for deduplication
		const hostnameParts = parsed.hostname.split('.');
		const domainPartCount = hasTwoPartSuffix(hostnameParts) ? 3 : 2;
		const domain = hostnameParts.slice(-domainPartCount).join('.');

		// Use filename for cross-subdomain matching, full path otherwise
		const normalizedPath = identifier || basename;

		return domain + normalizedPath;
	} catch {
		return url;
	}
}

/**
 * @param {string[]} urlStrings
 * @param {HTMLDivElement} imagesCache
 * @param {Record<string, { width: number; height: number }>} [imageDimensions]
 */
function pickBestImageUrl(urlStrings, imagesCache, imageDimensions = {}) {
	const uniqueUrlStrings = unique(urlStrings);

	const realUrls = /** @type {URL[]} */ ([]);
	for (const urlString of uniqueUrlStrings) {
		try {
			realUrls.push(new URL(urlString));
		} catch {
			// skip invalid URLs
		}
	}

	if (realUrls.length === 0) return undefined;

	const getResolution = (/** @type {URL} */ url) => {
		const dim = imageDimensions?.[url.href];
		if (dim && dim.width > 0 && dim.height > 0) {
			return dim;
		}
		const startFind = typeof performance !== 'undefined' ? performance.now() : Date.now();
		const img = findImageBySrc(imagesCache, url.href);
		const endFind = typeof performance !== 'undefined' ? performance.now() : Date.now();
		recordPerfMetric('dedup:findImageBySrc_domQuery', endFind - startFind);
		return img ? { width: img.naturalWidth, height: img.naturalHeight } : { width: 0, height: 0 };
	};

	const bestResolutionUrls = realUrls.slice(1).reduce(
		(/** @type {URL[]} */ bestUrls, /** @type {URL} */ currentUrl) => {
			const bestResolution = getResolution(bestUrls[0]);
			const currentResolution = getResolution(currentUrl);

			if (currentResolution.width > bestResolution.width && currentResolution.height > bestResolution.height) {
				return [currentUrl];
			}

			if (currentResolution.width === bestResolution.width && currentResolution.height === bestResolution.height) {
				return [...bestUrls, currentUrl];
			}

			return bestUrls;
		},
		[realUrls[0]]
	);

	const bestResolutionUrl = bestResolutionUrls.reduce((/** @type {URL} */ bestUrl, /** @type {URL} */ currentUrl) => {
		const bestPriority = priorities.indexOf(getExtension(bestUrl));
		const currentPriority = priorities.indexOf(getExtension(currentUrl));

		if (currentPriority < 0) return bestUrl;
		if (bestPriority < 0) return currentUrl;
		return currentPriority < bestPriority ? currentUrl : bestUrl;
	}, bestResolutionUrls[0]);

	return bestResolutionUrl.href;
}

function getExtension(/** @type {URL} */ url) {
	const raw = getImageExtension(url.href);
	if (priorities.includes(raw)) return raw;
	const norm = normalizeExtension(raw);
	if (priorities.includes(norm)) return norm;
	return /** @type {string} */ (url.pathname.split('.').at(-1)).toLowerCase();
}
