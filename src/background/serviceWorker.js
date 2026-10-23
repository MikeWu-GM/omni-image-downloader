// @ts-check
// Handle updates
chrome.runtime.onInstalled.addListener(async () => {
	// Set initial popup state based on open_mode
	await updateActionPopup();
});

// Handle storage changes to update popup state
chrome.storage.onChanged.addListener(async (changes, areaName) => {
	if (areaName === 'local' && changes.open_mode) {
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
	const { open_mode = 'sidebar' } = await chrome.storage.local.get('open_mode');
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

const MAX_CONCURRENT_DOWNLOADS = 4;
let activeDownloadsCount = 0;
/** @type {Set<number>} */
const inFlightDownloadIds = new Set();
/** @type {((value?: any) => void)[]} */
const downloadQueue = [];

function runWithDownloadSlot(/** @type {() => Promise<void>} */ fn) {
	if (activeDownloadsCount < MAX_CONCURRENT_DOWNLOADS) {
		activeDownloadsCount += 1;
		return fn();
	}
	return new Promise((/** @type {(value?: any) => void} */ resolve) => {
		downloadQueue.push(resolve);
	}).then(fn);
}

function releaseDownloadSlot() {
	const next = downloadQueue.shift();
	if (next) {
		next();
	} else if (activeDownloadsCount > 0) {
		activeDownloadsCount -= 1;
	}
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
function startDownload(
	/** @type {any} */ message,
	/** @type {chrome.runtime.MessageSender} */ sender,
	/** @type {(response?: any) => void} */ resolve
) {
	if (!(message && message.type === 'downloadImages')) return;

	downloadImages({
		imagesToDownload: message.imagesToDownload,
		options: message.options,
		indices: new Map(),
	}).then(resolve);

	return true; // Keeps the message channel open until `resolve` is called
}

async function downloadImages(/** @type {Task} */ task) {
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

		if (task.options?.source_url_file) {
			const { url, filename } = task.options.source_url_file;
			promises.push(
				runWithDownloadSlot(
					() =>
						new Promise((/** @type {(response?: any) => void} */ resolve) => {
							/** @type {chrome.downloads.DownloadOptions} */
							const downloadOptions = canSuggestFilename()
								? { url }
								: { url, filename: normalizeSlashes(filename), conflictAction: 'uniquify' };
							chrome.downloads.download(downloadOptions, (downloadId) => {
								if (downloadId != null) {
									inFlightDownloadIds.add(downloadId);
									task.sourceDownloadId = downloadId;
									task.sourceFilename = normalizeSlashes(filename);
									tasksByDownloadId.set(downloadId, task);
								} else {
									releaseDownloadSlot();
									if (chrome.runtime.lastError) {
										console.warn(`${filename}:`, chrome.runtime.lastError.message);
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
	if (!task.options.folder_name && !task.options.new_file_name) return { url };

	// A `data:` URL's path is its payload, not a filename.
	const isDataUrl = url.startsWith('data:');
	const urlFilename = isDataUrl ? '' : decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
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
	if (task.options.folder_name) {
		newFilename += `${task.options.folder_name}/`;
	}

	const regex = /(?:\.([^.]+))?$/;
	const extension = regex.exec(originalFilename)?.[1] || mime?.split('/')?.[1]?.replace('jpeg', 'jpg');

	if (task.options.new_file_name) {
		const numberOfDigits = task.imagesToDownload.length.toString().length;
		const formattedImageNumber = `${index + 1}`.padStart(numberOfDigits, '0');

		newFilename += `${task.options.new_file_name}${formattedImageNumber}${extension ? `.${extension}` : ''}`;
	} else {
		newFilename += originalFilename || `image${extension ? `.${extension}` : ''}`;
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
