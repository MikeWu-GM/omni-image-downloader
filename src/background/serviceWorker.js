// @ts-check
// Handle updates
chrome.runtime.onInstalled.addListener(async () => {
	// Set initial popup state based on open_mode
	await updateActionPopup();
});

// Handle storage changes to update popup state and concurrency limit
chrome.storage.onChanged.addListener(async (changes, areaName) => {
	if (areaName !== 'local') return;
	if (changes.max_concurrent_downloads) {
		setMaxConcurrentDownloads(changes.max_concurrent_downloads.newValue);
	}
	if (changes.open_mode) {
		await updateActionPopup();
	}
});

// Initialize popup state on service worker startup
updateActionPopup();

// Disable the side panel globally so newly opened tabs do not show it by default.
// Only tabs explicitly opened by the user will have enabled: true.
if (chrome.sidePanel?.setOptions) {
	chrome.sidePanel.setOptions({ enabled: false })?.catch?.(() => {});
}

async function updateActionPopup() {
	const { open_mode = 'sidebar', max_concurrent_downloads } = await chrome.storage.local.get([
		'open_mode',
		'max_concurrent_downloads',
	]);
	if (max_concurrent_downloads != null) {
		setMaxConcurrentDownloads(max_concurrent_downloads);
	}
	// Some Chromium-based browsers (e.g. Opera) don't implement the sidePanel
	// API. Fall back to the popup so the extension stays functional there.
	if (open_mode === 'sidebar' && chrome.sidePanel) {
		// Clear popup so onClicked listener fires
		await chrome.action.setPopup({ popup: '' });
	} else {
		// Set popup so it opens naturally
		await chrome.action.setPopup({ popup: 'src/Popup/index.html' });
	}
}

// Handle icon click - open sidebar specifically for the active tab
if (chrome.sidePanel) {
	chrome.action.onClicked.addListener((tab) => {
		if (tab.id == null) return;

		if (chrome.sidePanel.setOptions) {
			chrome.sidePanel
				.setOptions({
					tabId: tab.id,
					path: `src/SidePanel/index.html?tabId=${tab.id}`,
					enabled: true,
				})
				?.catch?.(() => {});
		}

		// Must call sidePanel.open synchronously to preserve the user gesture token!
		const fallbackOpen = () => {
			try {
				chrome.sidePanel.open({ windowId: tab.windowId })?.catch?.(() => {});
			} catch {}
		};
		try {
			const openPromise = chrome.sidePanel.open({ tabId: tab.id });
			if (openPromise && typeof openPromise.catch === 'function') {
				openPromise.catch(fallbackOpen);
			}
		} catch {
			fallbackOpen();
		}
	});
}

// Download images
/** @typedef {{
 *   imagesToDownload: string[],
 *   options: any,
 *   indices: Map<number, number>, // downloadId → original index
 *   sourceDownloadId?: number,
 *   sourceFilename?: string
 * }} Task */

/** @type {Map<number, Task>} */
const tasksByDownloadId = new Map();

let maxConcurrentDownloads = 4;
let activeDownloadsCount = 0;
/** @type {Set<number>} */
const inFlightDownloadIds = new Set();
/** @type {((value?: any) => void)[]} */
const downloadQueue = [];

function setMaxConcurrentDownloads(/** @type {any} */ value) {
	const parsed = Math.trunc(Number(value));
	if (!isNaN(parsed) && parsed >= 1) {
		maxConcurrentDownloads = Math.min(128, Math.max(1, parsed));
		drainDownloadQueue();
	}
}

function drainDownloadQueue() {
	while (activeDownloadsCount < maxConcurrentDownloads && downloadQueue.length > 0) {
		const next = downloadQueue.shift();
		if (next) {
			activeDownloadsCount += 1;
			next();
		}
	}
}

function runWithDownloadSlot(/** @type {() => Promise<void>} */ fn) {
	if (activeDownloadsCount < maxConcurrentDownloads) {
		activeDownloadsCount += 1;
		return fn();
	}
	return new Promise((/** @type {(value?: any) => void} */ resolve) => {
		downloadQueue.push(resolve);
	}).then(fn);
}

function releaseDownloadSlot() {
	if (activeDownloadsCount > 0) {
		activeDownloadsCount -= 1;
	}
	drainDownloadQueue();
}

// Chromium ignores the `filename` passed to `downloads.download()` by other
// extensions whenever any extension listens for `onDeterminingFilename`, so only
// listen while Image Downloader is itself downloading.
let activeBatchCount = 0;

chrome.runtime.onMessage.addListener(startDownload);
chrome.downloads.onChanged.addListener(cleanupCompletedDownloadTasks);

// Firefox has no `onDeterminingFilename`, but takes the filename in `downloads.download()`.
function canSuggestFilename() {
	return Boolean(chrome.downloads.onDeterminingFilename);
}

function ensureFilenameListener() {
	if (canSuggestFilename() && !chrome.downloads.onDeterminingFilename.hasListener(suggestNewFilename)) {
		chrome.downloads.onDeterminingFilename.addListener(suggestNewFilename);
	}
}

function removeFilenameListenerIfIdle() {
	if (
		canSuggestFilename() &&
		activeBatchCount === 0 &&
		tasksByDownloadId.size === 0 &&
		chrome.downloads.onDeterminingFilename.hasListener(suggestNewFilename)
	) {
		chrome.downloads.onDeterminingFilename.removeListener(suggestNewFilename);
	}
}

// NOTE: Don't directly use an `async` function as a listener for `onMessage`:
// https://stackoverflow.com/a/56483156
// https://developer.chrome.com/docs/extensions/reference/runtime/#event-onMessage
function isTrustedExtensionSender(/** @type {chrome.runtime.MessageSender} */ sender) {
	if (!sender || !chrome.runtime?.id || sender.id !== chrome.runtime.id) {
		return false;
	}
	const baseUrl = chrome.runtime.getURL ? chrome.runtime.getURL('') : '';
	if (!baseUrl || typeof sender.url !== 'string' || !sender.url.startsWith(baseUrl)) {
		return false;
	}
	return true;
}

function isAllowedDownloadUrl(/** @type {unknown} */ url) {
	if (typeof url !== 'string' || !url) return false;
	if (/^data:image\//i.test(url)) return true;
	if (/^blob:/i.test(url)) return true;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

const SAFE_IMAGE_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'avif',
	'svg',
	'bmp',
	'ico',
	'tif',
	'tiff',
	'jfif',
	'apng',
	'cur',
]);

const DANGEROUS_EXTENSIONS = new Set([
	'exe',
	'msi',
	'msp',
	'bat',
	'cmd',
	'com',
	'scr',
	'pif',
	'ps1',
	'psm1',
	'vbs',
	'vbe',
	'js',
	'jse',
	'mjs',
	'cjs',
	'wsf',
	'wsh',
	'hta',
	'cpl',
	'msc',
	'jar',
	'reg',
	'lnk',
	'url',
	'scf',
	'inf',
	'dll',
	'sys',
	'drv',
	'ocx',
	'html',
	'htm',
	'xhtml',
	'shtml',
	'svgz',
	'swf',
	'sh',
	'bash',
	'zsh',
	'command',
	'app',
	'dmg',
	'pkg',
	'deb',
	'rpm',
	'apk',
]);

/** @type {Record<string, string>} */
const MIME_TO_EXTENSION = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
	'image/bmp': 'bmp',
	'image/tiff': 'tif',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
	'image/apng': 'apng',
};

const WINDOWS_RESERVED_SEGMENT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function safeDecodeUrlPath(/** @type {string} */ value) {
	let current = value;
	for (let pass = 0; pass < 2; pass++) {
		if (!/%[0-9a-fA-F]{2}/.test(current)) break;
		try {
			const decoded = decodeURIComponent(current);
			if (decoded === current) break;
			current = decoded;
		} catch {
			break;
		}
	}
	return current;
}

function sanitizePathSegment(/** @type {unknown} */ raw) {
	if (typeof raw !== 'string') return '';
	const cleaned = raw
		.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '')
		.trim()
		.replace(/^\.+|\.+$/g, '')
		.trim();
	if (!cleaned || cleaned === '.' || cleaned === '..') return '';
	return WINDOWS_RESERVED_SEGMENT.test(cleaned) ? `_${cleaned}` : cleaned;
}

function sanitizeRelativeFolder(/** @type {unknown} */ rawFolder) {
	if (typeof rawFolder !== 'string' || !rawFolder) return '';
	return rawFolder
		.replace(/\\/g, '/')
		.split('/')
		.map((seg) => sanitizePathSegment(seg))
		.filter(Boolean)
		.join('/');
}

function resolveMimeImageExtension(/** @type {string | undefined} */ mime) {
	if (!mime) return '';
	const cleanMime = mime.split(';')[0].trim().toLowerCase();
	if (MIME_TO_EXTENSION[cleanMime]) return MIME_TO_EXTENSION[cleanMime];
	if (cleanMime.startsWith('image/')) {
		const sub = cleanMime
			.slice('image/'.length)
			.split('+')[0]
			.replace(/[^a-z0-9]/g, '');
		if (SAFE_IMAGE_EXTENSIONS.has(sub)) return sub;
	}
	return '';
}

function startDownload(
	/** @type {any} */ message,
	/** @type {chrome.runtime.MessageSender} */ sender,
	/** @type {(response?: any) => void} */ resolve
) {
	if (!(message && message.type === 'downloadImages')) return;
	if (!isTrustedExtensionSender(sender)) return;
	if (!Array.isArray(message.imagesToDownload)) return;

	downloadImages({
		imagesToDownload: message.imagesToDownload.filter(isAllowedDownloadUrl),
		options: message.options || {},
		indices: new Map(),
	}).then(resolve);

	return true; // Keeps the message channel open until `resolve` is called
}

async function downloadImages(/** @type {Task} */ task) {
	if (task.options?.max_concurrent_downloads != null) {
		setMaxConcurrentDownloads(task.options.max_concurrent_downloads);
	}
	activeBatchCount += 1;
	ensureFilenameListener();

	try {
		const promises = task.imagesToDownload.map((image, index) =>
			runWithDownloadSlot(
				() =>
					new Promise((/** @type {(response?: any) => void} */ resolve) => {
						const downloadOptions = canSuggestFilename() ? { url: image } : withFilename(task, index, image);
						chrome.downloads.download(downloadOptions, (downloadId) => {
							if (downloadId != null) {
								inFlightDownloadIds.add(downloadId);
								task.indices.set(downloadId, index);
								tasksByDownloadId.set(downloadId, task);
							} else {
								releaseDownloadSlot();
								if (chrome.runtime.lastError) {
									console.warn(`${image}:`, chrome.runtime.lastError.message);
								}
							}
							resolve();
						});
					})
			)
		);

		if (
			task.options?.source_url_file &&
			typeof task.options.source_url_file.url === 'string' &&
			task.options.source_url_file.url.startsWith('data:text/html;charset=utf-8,')
		) {
			const url = task.options.source_url_file.url;
			const rawSourceFolder = String(task.options.source_url_file.filename || '')
				.replace(/\\/g, '/')
				.split('/')
				.slice(0, -1)
				.join('/');
			const safeSourceFolder = sanitizeRelativeFolder(rawSourceFolder);
			const safeSourceFilename = safeSourceFolder ? `${safeSourceFolder}/source.html` : 'source.html';

			promises.push(
				runWithDownloadSlot(
					() =>
						new Promise((/** @type {(response?: any) => void} */ resolve) => {
							/** @type {chrome.downloads.DownloadOptions} */
							const downloadOptions = canSuggestFilename()
								? { url }
								: { url, filename: safeSourceFilename, conflictAction: 'uniquify' };
							chrome.downloads.download(downloadOptions, (downloadId) => {
								if (downloadId != null) {
									inFlightDownloadIds.add(downloadId);
									task.sourceDownloadId = downloadId;
									task.sourceFilename = safeSourceFilename;
									tasksByDownloadId.set(downloadId, task);
								} else {
									releaseDownloadSlot();
									if (chrome.runtime.lastError) {
										console.warn(`${safeSourceFilename}:`, chrome.runtime.lastError.message);
									}
								}
								resolve();
							});
						})
				)
			);
		}

		await Promise.allSettled(promises);
	} finally {
		// Runs even when the batch registered no downloads, so the listener can't leak.
		activeBatchCount -= 1;
		removeFilenameListenerIfIdle();
	}
}

// https://developer.chrome.com/docs/extensions/reference/downloads/#event-onDeterminingFilename
/** @type {Parameters<typeof chrome.downloads.onDeterminingFilename.addListener>[0]} */
function suggestNewFilename(item, suggest) {
	const task = tasksByDownloadId.get(item.id);
	if (!task) {
		// Bare `suggest()` means "use `item.filename`" and is not an override, so it
		// won't clobber a filename another extension suggested.
		suggest();
		removeFilenameListenerIfIdle();
		return;
	}

	if (task.sourceDownloadId === item.id) {
		suggest({
			filename: task.sourceFilename || 'source.html',
			conflictAction: 'uniquify',
		});
		tasksByDownloadId.delete(item.id);
		removeFilenameListenerIfIdle();
		return;
	}

	const index = task.indices.get(item.id);
	if (index === undefined) {
		suggest();
		tasksByDownloadId.delete(item.id);
		removeFilenameListenerIfIdle();
		return;
	}

	suggest({
		filename: buildFilename(task, index, item.filename, item.mime),
		conflictAction: 'uniquify',
	});

	task.indices.delete(item.id);
	tasksByDownloadId.delete(item.id);
	removeFilenameListenerIfIdle();
}

/** @returns {chrome.downloads.DownloadOptions} */
function withFilename(/** @type {Task} */ task, /** @type {number} */ index, /** @type {string} */ url) {
	const safeFolder = sanitizeRelativeFolder(task.options?.folder_name);
	const safeSubfolder = sanitizeRelativeFolder(task.options?.subfolders?.[index]);
	const safeNewName = sanitizePathSegment(task.options?.new_file_name);
	if (!safeFolder && !safeNewName && !safeSubfolder) return { url };

	// A `data:` URL's path is its payload, not a filename.
	const isDataUrl = url.startsWith('data:');
	const isBlobUrl = url.startsWith('blob:');
	let urlFilename = '';
	if (!isDataUrl && !isBlobUrl) {
		try {
			const decodedPathname = safeDecodeUrlPath(new URL(url).pathname);
			urlFilename = sanitizePathSegment(decodedPathname.replace(/\\/g, '/').split('/').pop() || '');
		} catch {
			urlFilename = '';
		}
	}
	const mime = isDataUrl ? url.slice('data:'.length).split(/[;,]/)[0] : undefined;
	return {
		url,
		filename: buildFilename(task, index, urlFilename, mime),
		conflictAction: 'uniquify',
	};
}

function buildFilename(
	/** @type {Task} */ task,
	/** @type {number} */ index,
	/** @type {string} */ originalFilename,
	/** @type {string | undefined} */ mime = undefined
) {
	let newFilename = '';
	const safeFolder = sanitizeRelativeFolder(task.options?.folder_name);
	if (safeFolder) {
		newFilename += `${safeFolder}/`;
	}

	const safeSubfolder = sanitizeRelativeFolder(task.options?.subfolders?.[index]);
	if (safeSubfolder) {
		newFilename += `${safeSubfolder}/`;
	}

	const rawBase =
		safeDecodeUrlPath(String(originalFilename || ''))
			.replace(/\\/g, '/')
			.split('/')
			.pop() || '';
	const cleanOriginal = sanitizePathSegment(rawBase);

	const extMatch = /^(.*?)(?:\.([^.]+))?$/.exec(cleanOriginal);
	const baseWithoutExt = extMatch?.[1] || '';
	const rawFileExt = extMatch?.[2]?.toLowerCase() || '';
	const mimeExt = resolveMimeImageExtension(mime);
	const isDangerousExt = Boolean(rawFileExt && DANGEROUS_EXTENSIONS.has(rawFileExt));
	const safeExt = isDangerousExt ? mimeExt || 'bin' : rawFileExt || mimeExt;

	const safeNewFileName = sanitizePathSegment(task.options?.new_file_name);
	if (safeNewFileName) {
		const numberOfDigits = task.imagesToDownload.length.toString().length;
		const formattedImageNumber = `${index + 1}`.padStart(numberOfDigits, '0');

		newFilename += `${safeNewFileName}${formattedImageNumber}${safeExt ? `.${safeExt}` : ''}`;
	} else if (cleanOriginal) {
		if (isDangerousExt) {
			newFilename += `${baseWithoutExt || 'image'}.${safeExt}`;
		} else {
			newFilename += cleanOriginal;
		}
	} else {
		newFilename += `image${safeExt ? `.${safeExt}` : ''}`;
	}

	return normalizeSlashes(newFilename);
}

function cleanupCompletedDownloadTasks(/** @type {chrome.downloads.DownloadDelta} */ delta) {
	if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
		if (inFlightDownloadIds.delete(delta.id)) {
			releaseDownloadSlot();
		}
		tasksByDownloadId.delete(delta.id);
		removeFilenameListenerIfIdle();
	}
}

function normalizeSlashes(/** @type {string} */ filename) {
	return filename.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}
