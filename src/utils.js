/** @type {<T>(array: T[]) => (item: T) => boolean} */
export const isIncludedIn = (array) => (item) => array.includes(item);

/** @type {<T>(array: T[]) => (item: T) => boolean} */
export const isNotIncludedIn = (array) => (item) => !array.includes(item);

/** @type {<T>(value1: T) => (value2: T) => boolean} */
export const isStrictEqual = (value1) => (value2) => value1 === value2;

/** @type {<T>(value1: T) => (value2: T) => boolean} */
export const isNotStrictEqual = (value1) => (value2) => value1 !== value2;

/** @type {<T>(value: T) => value is NonNullable<T>} */
export const isTruthy = (value) => !!value;

/** @type {(value: string) => string} */
export const removeSpecialCharacters = (value) => value.replace(/[<>:"|?*\x00-\x1f\x7f]/g, '');

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** @type {(value: string) => string} */
export const sanitizeFilenamePrefix = (value) => {
	const cleaned = removeSpecialCharacters(String(value || ''))
		.replace(/[\\/]+/g, '')
		.replace(/^\.+/, '');
	if (!cleaned || cleaned === '.' || cleaned === '..') return '';
	return WINDOWS_RESERVED_NAME.test(cleaned) ? `_${cleaned}` : cleaned;
};

/** @type {(value: string) => string} */
export const sanitizeSubfolderPath = (value) =>
	removeSpecialCharacters(String(value || ''))
		.replace(/\\/g, '/')
		.split('/')
		.map((segment) =>
			segment
				.trim()
				.replace(/^\.+|\.+$/g, '')
				.trim()
		)
		.filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
		.map((segment) => (WINDOWS_RESERVED_NAME.test(segment) ? `_${segment}` : segment))
		.join('/');

/** @type {(container: Element, src: string) => HTMLImageElement | undefined} */
export const findImageBySrc = (container, src) =>
	[...container.querySelectorAll('img')].find((image) => image.getAttribute('src') === src);

/** @type {(e: Event) => void} */
export const stopPropagation = (e) => e.stopPropagation();

/** @type {<T>(values: T[]) => T[]} */
export const unique = (values) => [...new Set(values)];

// Signals
export const increment = (/** @type {{ value: number }} */ signal) => () => signal.value++;

export const decrement = (/** @type {{ value: number }} */ signal) => () => signal.value--;

export const toggle = (/** @type {{ value: boolean }} */ signal) => () => (signal.value = !signal.value);

export const setToCheckboxValue = (/** @type {{ value: boolean }} */ signal) => (/** @type {Event} */ e) => {
	signal.value = /** @type {HTMLInputElement} */ (e.currentTarget).checked;
};

export const setToInvertedCheckboxValue = (/** @type {{ value: boolean }} */ signal) => (/** @type {Event} */ e) => {
	signal.value = !(/** @type {HTMLInputElement} */ (e.currentTarget).checked);
};

/** @type {(value: string) => string} */
export const escapeHtml = (value = '') =>
	String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

/** @type {(rawTitle?: string, fallbackHost?: string) => string} */
export const sanitizeFolderName = (rawTitle = '', fallbackHost = '') => {
	const sanitize = (/** @type {string} */ str) =>
		str
			.replace(/[:*?"<>|\\/\x00-\x1f\x7f]+\s*/g, '_')
			.replace(/_+/g, '_')
			.replace(/^[\s._-]+|[\s._-]+$/g, '')
			.trim()
			.slice(0, 80)
			.replace(/[\s._-]+$/, '');

	const cleanTitle = sanitize(rawTitle || '');
	if (cleanTitle) return cleanTitle;

	const cleanHost = sanitize(fallbackHost || '');
	if (cleanHost) return cleanHost;

	return 'images';
};

/**
 * Disambiguate folder names by appending numeric suffixes when duplicates occur.
 * @type {(names: string[]) => string[]}
 */
export const disambiguateFolderNames = (names) => {
	const counts = new Map();
	return names.map((name) => {
		const base = name || 'Tab';
		const c = counts.get(base) || 0;
		counts.set(base, c + 1);
		return c === 0 ? base : `${base} (${c + 1})`;
	});
};

/** @type {(url: string, title?: string) => string} */
export const generateSourceHtml = (url, title = '') => {
	let isHttpUrl = false;
	try {
		const parsed = new URL(url);
		isHttpUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		isHttpUrl = false;
	}

	const safeTitle = escapeHtml(title || (isHttpUrl ? url : 'Source Page'));
	const safeUrl = isHttpUrl ? escapeHtml(url) : '#';
	const metaRefresh = isHttpUrl ? `\n  <meta http-equiv="refresh" content="0; url=${safeUrl}">` : '';

	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">${metaRefresh}
  <title>${safeTitle}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; line-height: 1.5;">
  <h2>${safeTitle}</h2>
  <p>Redirecting to source webpage...</p>
  <p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 1.5rem 0;" />
  <p style="color: #666; font-size: 0.85rem;">Downloaded via OmniImage Downloader</p>
</body>
</html>`;
};

// Performance Diagnostics & Profiling
/** @typedef {{ count: number, totalMs: number, maxMs: number, lastMs: number }} PerfMetric */
/** @type {Record<string, PerfMetric>} */
const perfMetrics = {};
let perfLoggingEnabled = true;

/**
 * Measure execution time of a synchronous or asynchronous code block.
 * @template T
 * @param {string} tag
 * @param {() => T} fn
 * @returns {T}
 */
export function measurePerf(tag, fn) {
	const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
	try {
		const result = fn();
		if (result && typeof (/** @type {any} */ (result).then) === 'function') {
			return /** @type {any} */ (
				/** @type {Promise<any>} */ (result).finally(() => {
					const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
					recordPerfMetric(tag, now - start);
				})
			);
		}
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
		recordPerfMetric(tag, now - start);
		return result;
	} catch (error) {
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
		recordPerfMetric(tag, now - start, true);
		throw error;
	}
}

/**
 * Record a raw metric duration.
 * @param {string} tag
 * @param {number} durationMs
 * @param {boolean} [isError]
 */
export function recordPerfMetric(tag, durationMs, isError = false) {
	const metric = perfMetrics[tag] || (perfMetrics[tag] = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 });
	metric.count += 1;
	metric.totalMs += durationMs;
	metric.lastMs = durationMs;
	if (durationMs > metric.maxMs) metric.maxMs = durationMs;

	if (perfLoggingEnabled && (durationMs >= 8 || metric.count % 25 === 0)) {
		const warningIcon = durationMs >= 50 ? '🚨' : durationMs >= 15 ? '⚠️' : '⏱️';
		console.warn(
			`[ID-PERF] ${warningIcon} [${tag}] took ${durationMs.toFixed(1)}ms (avg: ${(metric.totalMs / metric.count).toFixed(1)}ms, max: ${metric.maxMs.toFixed(1)}ms, hits: ${metric.count})${isError ? ' [ERROR]' : ''}`
		);
	}
}

/**
 * Get current performance metrics report table.
 * @returns {Record<string, { count: number, avgMs: string, maxMs: string, totalMs: string }>}
 */
export function getPerfReport() {
	const report = /** @type {Record<string, any>} */ ({});
	for (const [tag, metric] of Object.entries(perfMetrics)) {
		report[tag] = {
			count: metric.count,
			avgMs: (metric.totalMs / metric.count).toFixed(2) + 'ms',
			maxMs: metric.maxMs.toFixed(2) + 'ms',
			totalMs: metric.totalMs.toFixed(2) + 'ms',
		};
	}
	return report;
}

if (typeof window !== 'undefined') {
	// Expose diagnostics on window for live debugging in DevTools Console
	/** @type {any} */ (window).__ID_PERF__ = {
		getReport: getPerfReport,
		printReport: () => console.table(getPerfReport()),
		reset: () => {
			for (const key in perfMetrics) delete perfMetrics[key];
		},
		enableLogging: (/** @type {boolean} */ enabled) => {
			perfLoggingEnabled = enabled;
		},
	};
}
