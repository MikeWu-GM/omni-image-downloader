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
export const removeSpecialCharacters = (value) => value.replace(/[<>:"|?*]/g, '');

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
  <p style="color: #666; font-size: 0.85rem;">Downloaded via Image Downloader</p>
</body>
</html>`;
};
