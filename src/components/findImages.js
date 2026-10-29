// @ts-check
// Executed via `chrome.scripting.executeScript` - cannot have imports!

export async function findImages(
	/** @type {{ waitForIdleDOM?: number | false; document?: Document; window?: Window; }} */ {
		waitForIdleDOM,
		...rest
	} = {}
) {
	const context = {
		document: rest.document || document,
		window: /** @type {Window & typeof globalThis} */ (rest.window || window),
	};

	// Settle and clean up any previously created observer and timers from prior executions
	context.window.__observer?.disconnect();
	clearTimeout(context.window.__idleDomTimer);
	clearTimeout(context.window.__maxIdleDomTimer);
	context.window.__resolveIdleDom?.();
	context.window.__resolveIdleDom = undefined;

	// Maybe wait briefly until DOM settles, bounded by a strict ceiling so streaming/mutating pages never livelock
	if (waitForIdleDOM !== false && waitForIdleDOM != null && waitForIdleDOM >= 0 && Number.isFinite(waitForIdleDOM)) {
		const rootElement = context.document.documentElement;
		const ObserverCtor = context.window.MutationObserver;
		if (rootElement && typeof ObserverCtor === 'function') {
			const maxWaitMs = Math.min(Math.max(waitForIdleDOM * 2.5, waitForIdleDOM), 2500);
			await new Promise((/** @type {(...args: any[]) => void} */ resolve) => {
				let settled = false;
				const finish = () => {
					if (settled) return;
					settled = true;
					observer.disconnect();
					clearTimeout(context.window.__idleDomTimer);
					clearTimeout(context.window.__maxIdleDomTimer);
					if (context.window.__resolveIdleDom === finish) {
						context.window.__resolveIdleDom = undefined;
					}
					resolve();
				};

				const observer = new ObserverCtor(() => {
					resetTimer(waitForIdleDOM);
				});

				observer.observe(rootElement, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset', 'style'],
				});

				context.window.__observer = observer;
				context.window.__resolveIdleDom = finish;
				context.window.__maxIdleDomTimer = setTimeout(finish, maxWaitMs);
				resetTimer(waitForIdleDOM);

				function resetTimer(/** @type {number} */ delayMs) {
					clearTimeout(context.window.__idleDomTimer);
					context.window.__idleDomTimer = setTimeout(finish, delayMs);
				}
			});
		}
	}

	// Source: https://support.google.com/webmasters/answer/2598805?hl=en
	const imageUrlRegex =
		/(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*\.(?:bmp|gif|ico|jfif|jpe?g|png|svg|tiff?|webp|avif))(?:\?([^#]*))?(?:#(.*))?/i;

	/** @returns {(Document | ShadowRoot)[]} */
	function getRoots(/** @type {Document} */ root) {
		/** @type {(Document | ShadowRoot)[]} */
		const roots = [root];

		for (let index = 0; index < roots.length; index++) {
			const current = roots[index];
			// Find all potential shadow hosts in this root
			for (const element of current.querySelectorAll('*')) {
				if (element.shadowRoot) {
					roots.push(element.shadowRoot);
				}
			}
		}

		return roots;
	}

	const imageDimensions = /** @type {Record<string, { width: number; height: number }>} */ ({});

	/** @returns {string[]} */
	function extractImagesFromSelector(/** @type {(Document | ShadowRoot)[]} */ roots, /** @type {string} */ selector) {
		const images = /** @type {Set<string>} */ (new Set());

		for (const root of roots) {
			root.querySelectorAll(selector).forEach((element) => {
				const urls = extractImageUrlsFromElement(element);
				urls?.forEach((url) => {
					if (url) {
						const absUrl = relativeUrlToAbsolute(url);
						if (!isAllowedExtractedUrl(absUrl)) return;
						images.add(absUrl);

						if (element.tagName.toLowerCase() === 'img') {
							const img = /** @type {HTMLImageElement} */ (element);
							const width = img.naturalWidth || 0;
							const height = img.naturalHeight || 0;
							if (width > 0 && height > 0) {
								const existing = imageDimensions[absUrl];
								if (!existing || width * height > existing.width * existing.height) {
									imageDimensions[absUrl] = { width, height };
								}
							}
						}
					}
				});
			});
		}

		return [...images];
	}

	/** @returns {string[] | null | undefined} */
	function extractImageUrlsFromElement(/** @type {Element} */ element) {
		if (element.tagName.toLowerCase() === 'img') {
			const images = [];

			// Extract src (skip empty src="" attribute placeholders that resolve to document.baseURI)
			const rawSrcAttr = element.getAttribute?.('src');
			const src = rawSrcAttr === '' ? '' : /** @type {HTMLImageElement} */ (element).src;
			if (src) {
				const hashIndex = src.indexOf('#');
				images.push(hashIndex >= 0 ? src.slice(0, hashIndex) : src);
			}

			// Extract data-src for lazy loading
			const dataSrc = element.getAttribute?.('data-src');
			if (dataSrc) {
				const hashIndex = dataSrc.indexOf('#');
				images.push(hashIndex >= 0 ? dataSrc.slice(0, hashIndex) : dataSrc);
			}

			// Extract srcset URLs
			const srcset = element.getAttribute?.('srcset');
			if (srcset) {
				const srcsetUrls = extractSrcsetURLs(srcset);
				images.push(...srcsetUrls);
			}

			// Extract data-srcset URLs for lazy loading
			const dataSrcset = element.getAttribute?.('data-srcset');
			if (dataSrcset) {
				const dataSrcsetUrls = extractSrcsetURLs(dataSrcset);
				images.push(...dataSrcsetUrls);
			}

			return images.length > 0 ? images : null;
		}

		if (element.tagName.toLowerCase() === 'image') {
			const src = /** @type {string}  */ (element.getAttribute('xlink:href'));
			if (src) {
				const hashIndex = src.indexOf('#');
				return [hashIndex >= 0 ? src.slice(0, hashIndex) : src];
			}
			return null;
		}

		if (element.tagName.toLowerCase() === 'use') {
			// <use> elements in SVG reference external images via xlink:href
			const href = element.getAttribute?.('xlink:href');
			if (href) {
				const hashIndex = href.indexOf('#');
				return [hashIndex >= 0 ? href.slice(0, hashIndex) : href];
			}
			return null;
		}

		if (element.tagName.toLowerCase() === 'source') {
			// <source> elements in <picture> use srcset for responsive images
			const srcset = element.getAttribute?.('srcset');
			if (srcset) {
				return extractSrcsetURLs(srcset);
			}
			return null;
		}

		if (element.tagName.toLowerCase() === 'a') {
			const href = /** @type {HTMLAnchorElement} */ (element).href;
			if (isImageURL(href)) {
				return [href];
			}
		}

		const backgroundImage = context.window.getComputedStyle(element).backgroundImage;
		if (backgroundImage) {
			const parsedURLs = extractURLsFromStyle(backgroundImage);
			// For background images, accept any valid URL (not just ones with image extensions)
			// since the browser will load whatever image is specified
			const validURLs = parsedURLs.filter((url) => isImageURL(url) || isValidBackgroundImageURL(url));
			if (validURLs.length > 0) {
				return validURLs;
			}
		}
	}

	function isImageURL(/** @type {string} */ url) {
		return url.indexOf('data:image') === 0 || imageUrlRegex.test(url);
	}

	function extractSrcsetURLs(/** @type {string} */ srcset) {
		// Parse srcset format: "url1 1x, url2 2x, url3 100w"
		// Each candidate has a URL followed by an optional descriptor (width or pixel density)
		return srcset
			.split(',')
			.map((candidate) => {
				const url = candidate.trim().split(/\s+/)[0];
				const hashIndex = url.indexOf('#');
				return hashIndex >= 0 ? url.slice(0, hashIndex) : url;
			})
			.filter((url) => url.length > 0);
	}

	const DISALLOWED_BG_EXTENSIONS =
		/\.(?:exe|msi|msp|bat|cmd|com|scr|pif|ps1|psm1|vbs|vbe|js|jse|mjs|cjs|wsf|wsh|hta|cpl|jar|reg|lnk|dll|sys|html?|xhtml|shtml|swf|sh|dmg|pkg|apk)(?:[?#]|$)/i;

	function isAllowedExtractedUrl(/** @type {string} */ candidateUrl) {
		if (!candidateUrl) return false;
		if (/^data:image\//i.test(candidateUrl)) return true;
		if (/^blob:https?:\/\//i.test(candidateUrl)) return true;
		try {
			const parsed = new URL(candidateUrl);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:';
		} catch {
			return false;
		}
	}

	function isValidBackgroundImageURL(/** @type {string} */ url) {
		if (DISALLOWED_BG_EXTENSIONS.test(url)) return false;
		// Accept any URL that looks like it could be a background image
		// (has an http(s) protocol, is protocol-relative, or is an http(s) blob URL)
		return /^https?:\/\//.test(url) || /^\/\//.test(url) || /^blob:https?:\/\//i.test(url);
	}

	function extractURLsFromStyle(/** @type {string} */ style) {
		// Extract all URLs from CSS functions like url() - handles multiple values
		const urls = [];
		const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
		let match;
		while ((match = urlRegex.exec(style)) !== null) {
			urls.push(match[1]);
		}
		return urls;
	}

	function relativeUrlToAbsolute(/** @type {string} */ url) {
		try {
			return new URL(url, context.document.baseURI).href;
		} catch {
			return url;
		}
	}

	const roots = getRoots(context.document);
	return {
		allImages: extractImagesFromSelector(roots, 'img, image, source, use, a, [class], [style]'),
		linkedImages: extractImagesFromSelector(roots, 'a'), // Do not merge into `allImages` - we want to preserve the order of images from the DOM
		imageDimensions,
		origin: context.window.location.origin,
		title: context.document.title || '',
	};
}
