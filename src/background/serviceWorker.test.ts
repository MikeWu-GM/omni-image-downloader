import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { mockChrome } from '../test-helpers';

// `serviceWorker.js` is a classic script with no exports: importing it registers its
// listeners as a side effect. Each test imports a fresh instance (a new query string
// bypasses the module cache) against a fresh chrome mock, through a variable so
// `bun check` (which sees no module type) stays happy.
const serviceWorkerPath = './serviceWorker.js';
let serviceWorkerInstance = 0;

let chrome: ReturnType<typeof mockChrome>;
let downloadIds: number[];
let deferDownloadCallbacks: boolean;
let pendingDownloadCallbacks: (() => void)[];

beforeEach(async () => {
	chrome = mockChrome();
	downloadIds = [];
	deferDownloadCallbacks = false;
	pendingDownloadCallbacks = [];
	chrome.downloads.download = mock((_options: any, callback: (downloadId?: number) => void) => {
		const downloadId = downloadIds.length + 1;
		downloadIds.push(downloadId);
		const respond = () => callback(downloadId);
		if (deferDownloadCallbacks) pendingDownloadCallbacks.push(respond);
		else respond();
	});

	(globalThis as any).chrome = chrome;
	serviceWorkerInstance += 1;
	await import(`${serviceWorkerPath}?${serviceWorkerInstance}`);
});

function trustedSender() {
	return {
		id: chrome.runtime.id,
		url: chrome.runtime.getURL('src/Popup/index.html'),
	};
}

function startBatch(images: string[], options: any = {}, sender: any = trustedSender()) {
	const startDownload = chrome.runtime.onMessage.addListener.mock.calls[0][0];
	return new Promise<void>((resolve) => {
		const handled = startDownload({ type: 'downloadImages', imagesToDownload: images, options }, sender, resolve);
		if (!handled) resolve();
	});
}

function filenameListener() {
	return [...chrome.downloads.onDeterminingFilename.listeners][0] as (
		item: { id: number; filename: string },
		suggest: (suggestion?: { filename: string }) => void
	) => void;
}

describe('serviceWorker filename suggestions', () => {
	it('does not listen for onDeterminingFilename until a batch starts', () => {
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('passes an unrelated download through with a bare suggest()', async () => {
		const done = startBatch(['https://example.com/1.jpg']);
		const downloadId = downloadIds[downloadIds.length - 1];

		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(1);
		const listener = filenameListener();

		const unrelated = mock();
		listener({ id: downloadId + 1000, filename: 'external.jpg' }, unrelated);
		expect(unrelated.mock.calls).toEqual([[]]);

		const own = mock();
		listener({ id: downloadId, filename: '1.jpg' }, own);
		expect(own.mock.calls).toEqual([[{ filename: '1.jpg', conflictAction: 'uniquify' }]]);

		await done;
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('suggests the configured folder and filename for its own downloads', async () => {
		const done = startBatch(['https://example.com/a.jpg'], { folder_name: 'folder', new_file_name: 'name' });
		const downloadId = downloadIds[downloadIds.length - 1];

		const suggest = mock();
		filenameListener()({ id: downloadId, filename: 'a.jpg' }, suggest);
		expect(suggest.mock.calls).toEqual([[{ filename: 'folder/name1.jpg', conflictAction: 'uniquify' }]]);

		await done;
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('suggests tab-specific subfolders when subfolders are provided in options', async () => {
		const done = startBatch(['https://example.com/1.jpg', 'https://example.com/2.jpg'], {
			folder_name: 'batch_root',
			subfolders: ['Tab_Alpha', 'Tab_Beta'],
		});
		const [firstId, secondId] = downloadIds.slice(-2);

		const suggestFirst = mock();
		filenameListener()({ id: firstId, filename: '1.jpg' }, suggestFirst);
		expect(suggestFirst.mock.calls).toEqual([[{ filename: 'batch_root/Tab_Alpha/1.jpg', conflictAction: 'uniquify' }]]);

		const suggestSecond = mock();
		filenameListener()({ id: secondId, filename: '2.jpg' }, suggestSecond);
		expect(suggestSecond.mock.calls).toEqual([[{ filename: 'batch_root/Tab_Beta/2.jpg', conflictAction: 'uniquify' }]]);

		await done;
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('suggests direct tab subfolders without outer folder when folder_name is empty', async () => {
		const done = startBatch(['https://example.com/1.jpg', 'https://example.com/2.jpg'], {
			folder_name: '',
			subfolders: ['Tab_Alpha', 'Tab_Beta'],
		});
		const [firstId, secondId] = downloadIds.slice(-2);

		const suggestFirst = mock();
		filenameListener()({ id: firstId, filename: '1.jpg' }, suggestFirst);
		expect(suggestFirst.mock.calls).toEqual([[{ filename: 'Tab_Alpha/1.jpg', conflictAction: 'uniquify' }]]);

		const suggestSecond = mock();
		filenameListener()({ id: secondId, filename: '2.jpg' }, suggestSecond);
		expect(suggestSecond.mock.calls).toEqual([[{ filename: 'Tab_Beta/2.jpg', conflictAction: 'uniquify' }]]);

		await done;
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('keeps listening until every download in the batch has been named', async () => {
		deferDownloadCallbacks = true;
		const done = startBatch(['https://example.com/1.jpg', 'https://example.com/2.jpg']);
		deferDownloadCallbacks = false;
		const [firstId, secondId] = downloadIds.slice(-2);
		const [registerFirst, registerSecond] = pendingDownloadCallbacks.splice(0);

		registerFirst();
		filenameListener()({ id: firstId, filename: '1.jpg' }, mock());
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(1);

		registerSecond();
		filenameListener()({ id: secondId, filename: '2.jpg' }, mock());
		await done;
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('stops listening after a batch whose downloads all failed to start', async () => {
		chrome.downloads.download.mockImplementationOnce((_options: any, callback: (downloadId?: number) => void) =>
			callback(undefined)
		);

		await startBatch(['https://example.com/broken.jpg']);
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('downloads source_url_file and suggests its filename without numbering', async () => {
		const sourceFile = {
			url: 'data:text/html;charset=utf-8,redirect',
			filename: 'my_folder/source.html',
		};
		const done = startBatch(['https://example.com/a.jpg'], {
			folder_name: 'my_folder',
			new_file_name: 'pic',
			source_url_file: sourceFile,
		});

		const [imgId, sourceId] = downloadIds.slice(-2);

		const imgSuggest = mock();
		filenameListener()({ id: imgId, filename: 'a.jpg' }, imgSuggest);
		expect(imgSuggest.mock.calls).toEqual([[{ filename: 'my_folder/pic1.jpg', conflictAction: 'uniquify' }]]);

		const sourceSuggest = mock();
		filenameListener()({ id: sourceId, filename: 'download.html' }, sourceSuggest);
		expect(sourceSuggest.mock.calls).toEqual([[{ filename: 'my_folder/source.html', conflictAction: 'uniquify' }]]);

		await done;
		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});
});

describe('Firefox', () => {
	describe('serviceWorker without onDeterminingFilename', () => {
		beforeEach(() => {
			chrome.downloads.onDeterminingFilename = undefined;
		});

		it('passes the configured folder and filename to downloads.download()', async () => {
			await startBatch(['https://example.com/path/a.png?size=large'], { folder_name: 'folder', new_file_name: 'name' });

			expect(chrome.downloads.download.mock.calls.at(-1)[0]).toEqual({
				url: 'https://example.com/path/a.png?size=large',
				filename: 'folder/name1.png',
				conflictAction: 'uniquify',
			});
		});

		it('passes subfolders to downloads.download() in Firefox mode', async () => {
			await startBatch(['https://example.com/photo.png'], {
				folder_name: 'firefox_root',
				subfolders: ['SubTab'],
			});

			expect(chrome.downloads.download.mock.calls.at(-1)[0]).toEqual({
				url: 'https://example.com/photo.png',
				filename: 'firefox_root/SubTab/photo.png',
				conflictAction: 'uniquify',
			});
		});

		it('passes direct subfolder without outer folder when folder_name is empty in Firefox mode', async () => {
			await startBatch(['https://example.com/photo.png'], {
				folder_name: '',
				subfolders: ['SubTab'],
			});

			expect(chrome.downloads.download.mock.calls.at(-1)[0]).toEqual({
				url: 'https://example.com/photo.png',
				filename: 'SubTab/photo.png',
				conflictAction: 'uniquify',
			});
		});

		it('takes the extension of a data: URL from its MIME type', async () => {
			const url = 'data:image/png;base64,iVBORw0KGgo/AAAA+BBB=';
			await startBatch([url], { folder_name: 'folder', new_file_name: 'name' });

			expect(chrome.downloads.download.mock.calls.at(-1)[0]).toEqual({
				url,
				filename: 'folder/name1.png',
				conflictAction: 'uniquify',
			});
		});

		it('names a download without a URL filename "image" when only a folder is set', async () => {
			const url = 'data:image/png;base64,iVBORw0KGgo/AAAA+BBB=';
			await startBatch([url], { folder_name: 'folder' });

			expect(chrome.downloads.download.mock.calls.at(-1)[0]).toEqual({
				url,
				filename: 'folder/image.png',
				conflictAction: 'uniquify',
			});
		});
	});
});

describe('serviceWorker tab-scoped sidePanel', () => {
	it('globally disables the sidePanel on startup so other tabs do not show it by default', () => {
		expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({ enabled: false });
	});

	it('opens the sidePanel specifically for the active tab with tabId and locked path', async () => {
		const actionListener = chrome.action.onClicked.addListener.mock.calls[0]?.[0];
		expect(actionListener).toBeDefined();

		await actionListener({ id: 101, windowId: 1 });

		expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({
			tabId: 101,
			path: 'src/SidePanel/index.html?tabId=101',
			enabled: true,
		});
		expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 101 });
	});

	it('falls back to opening sidePanel by windowId when open({ tabId }) rejects asynchronously', async () => {
		const actionListener = chrome.action.onClicked.addListener.mock.calls[0]?.[0];
		chrome.sidePanel.open = mock((opts: any) =>
			opts.tabId != null ? Promise.reject(new Error('Tab closed')) : Promise.resolve()
		);

		await actionListener({ id: 101, windowId: 7 });
		await new Promise((r) => setTimeout(r, 10));

		expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
	});
});

describe('serviceWorker cleanup completed tasks', () => {
	it('removes tasks and filename listener when downloads complete', async () => {
		const done = startBatch(['https://example.com/1.jpg']);
		const downloadId = downloadIds[downloadIds.length - 1];

		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(1);

		const onChangedListener = [...chrome.downloads.onChanged.listeners][0] as (delta: any) => void;
		expect(onChangedListener).toBeDefined();

		onChangedListener({ id: downloadId, state: { current: 'complete' } });
		await done;

		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('cleans up task when download gets interrupted', async () => {
		const done = startBatch(['https://example.com/2.jpg']);
		const downloadId = downloadIds[downloadIds.length - 1];

		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(1);

		const onChangedListener = [...chrome.downloads.onChanged.listeners][0] as (delta: any) => void;
		expect(onChangedListener).toBeDefined();

		onChangedListener({ id: downloadId, state: { current: 'interrupted' } });
		await done;

		expect(chrome.downloads.onDeterminingFilename.listeners.size).toBe(0);
	});

	it('throttles concurrent downloads to MAX_CONCURRENT_DOWNLOADS (4) and advances queue as downloads complete or fail', async () => {
		const urls = [
			'https://example.com/1.jpg',
			'https://example.com/2.jpg',
			'https://example.com/3.jpg',
			'https://example.com/4.jpg',
			'https://example.com/5.jpg',
			'https://example.com/6.jpg',
		];

		const done = startBatch(urls);
		await new Promise((r) => setTimeout(r, 10));

		// Only the first 4 downloads should have been started immediately
		expect(chrome.downloads.download).toHaveBeenCalledTimes(4);

		const onChangedListener = [...chrome.downloads.onChanged.listeners][0] as (delta: any) => void;

		// Completing download 1 frees 1 slot -> download 5 starts
		onChangedListener({ id: downloadIds[0], state: { current: 'complete' } });
		await new Promise((r) => setTimeout(r, 10));
		expect(chrome.downloads.download).toHaveBeenCalledTimes(5);

		// Interrupting download 2 frees 1 slot -> download 6 starts
		onChangedListener({ id: downloadIds[1], state: { current: 'interrupted' } });
		await new Promise((r) => setTimeout(r, 10));
		expect(chrome.downloads.download).toHaveBeenCalledTimes(6);

		await done;
	});

	it('respects custom max_concurrent_downloads passed in options or updated via storage', async () => {
		const urls = [
			'https://example.com/1.jpg',
			'https://example.com/2.jpg',
			'https://example.com/3.jpg',
			'https://example.com/4.jpg',
		];

		const done = startBatch(urls, { max_concurrent_downloads: 2 });
		await new Promise((r) => setTimeout(r, 10));

		// With custom limit 2, only 2 downloads should start initially
		expect(chrome.downloads.download).toHaveBeenCalledTimes(2);

		// Dynamically raising max_concurrent_downloads via storage immediately drains queued slots
		const storageListener = [...chrome.storage.onChanged.listeners][0] as (
			changes: Record<string, any>,
			areaName: string
		) => Promise<void>;
		await storageListener({ max_concurrent_downloads: { newValue: 4 } }, 'local');
		await new Promise((r) => setTimeout(r, 10));

		expect(chrome.downloads.download).toHaveBeenCalledTimes(4);
		await done;
	});

	it('clamps max_concurrent_downloads between 1 and 128', async () => {
		const urls = Array.from({ length: 140 }, (_, i) => `https://example.com/${i}.jpg`);
		const done = startBatch(urls, { max_concurrent_downloads: 200 });
		await new Promise((r) => setTimeout(r, 10));

		// Clamped to 128
		expect(chrome.downloads.download).toHaveBeenCalledTimes(128);

		const onChangedListener = [...chrome.downloads.onChanged.listeners][0] as (delta: any) => void;
		// Completing one download should advance the queue to 129
		onChangedListener({ id: downloadIds[0], state: { current: 'complete' } });
		await new Promise((r) => setTimeout(r, 10));
		expect(chrome.downloads.download).toHaveBeenCalledTimes(129);

		for (const id of [...downloadIds]) {
			onChangedListener({ id, state: { current: 'complete' } });
		}
		await done;
	});
});

describe('serviceWorker open_mode dynamic updates and installation', () => {
	it('initializes action popup without opening any unsolicited Options tab on install', async () => {
		const installedListener = [...chrome.runtime.onInstalled.listeners][0] as (details: {
			reason: string;
		}) => Promise<void>;
		expect(installedListener).toBeDefined();

		await installedListener({ reason: 'install' });
		expect(chrome.tabs.create).not.toHaveBeenCalled();
	});

	it('updates action popup when storage changes open_mode', async () => {
		const storageListener = [...chrome.storage.onChanged.listeners][0] as (
			changes: Record<string, any>,
			areaName: string
		) => Promise<void>;
		expect(storageListener).toBeDefined();

		await chrome.storage.local.set({ open_mode: 'popup' });
		await storageListener({ open_mode: { newValue: 'popup' } }, 'local');
		expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: 'src/Popup/index.html' });

		await chrome.storage.local.set({ open_mode: 'sidebar' });
		await storageListener({ open_mode: { newValue: 'sidebar' } }, 'local');
		expect(chrome.action.setPopup).toHaveBeenCalledWith({ popup: '' });
	});

	it('ignores storage changes from non-local areas or unrelated keys', async () => {
		const storageListener = [...chrome.storage.onChanged.listeners][0] as (
			changes: Record<string, any>,
			areaName: string
		) => Promise<void>;
		chrome.action.setPopup.mockClear();

		await storageListener({ other_key: { newValue: 123 } }, 'local');
		await storageListener({ open_mode: { newValue: 'popup' } }, 'sync');

		expect(chrome.action.setPopup).not.toHaveBeenCalled();
	});
});

describe('serviceWorker security boundaries', () => {
	it('rejects downloadImages messages from untrusted senders (content scripts or foreign extensions)', async () => {
		await startBatch(['https://example.com/1.jpg'], {}, {});
		await startBatch(
			['https://example.com/1.jpg'],
			{},
			{ id: 'foreign-ext', url: 'chrome-extension://foreign-ext/p.html' }
		);
		await startBatch(
			['https://example.com/1.jpg'],
			{},
			{ id: chrome.runtime.id, url: 'https://evil.example/page.html', tab: { id: 9 } }
		);

		expect(chrome.downloads.download).not.toHaveBeenCalled();
	});

	it('blocks unsafe download URL schemes and untrusted external source_url_file payloads', async () => {
		await startBatch(
			['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'data:text/html,<h1>x</h1>', 'https://example.com/ok.png'],
			{
				source_url_file: {
					url: 'https://evil.example/dropper.exe',
					filename: '../../dropper.exe',
				},
			}
		);

		expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
		expect(chrome.downloads.download.mock.calls[0][0]).toEqual({ url: 'https://example.com/ok.png' });
	});

	it('neutralizes traversal segments, normalizes svg+xml MIME, and disarms executable extensions', async () => {
		const done = startBatch(['https://example.com/1', 'https://example.com/2', 'https://example.com/3'], {
			folder_name: '../../escaped_root',
			subfolders: ['../escaped_sub', 'clean_sub', '..'],
		});
		const [id1, id2, id3] = downloadIds.slice(-3);

		const suggest1 = mock();
		filenameListener()({ id: id1, filename: '../../payload.exe' }, suggest1);
		expect(suggest1.mock.calls).toEqual([
			[{ filename: 'escaped_root/escaped_sub/payload.bin', conflictAction: 'uniquify' }],
		]);

		const suggest2 = mock();
		filenameListener()({ id: id2, filename: '', mime: 'image/svg+xml' } as any, suggest2);
		expect(suggest2.mock.calls).toEqual([
			[{ filename: 'escaped_root/clean_sub/image.svg', conflictAction: 'uniquify' }],
		]);

		const suggest3 = mock();
		filenameListener()({ id: id3, filename: 'phish.html', mime: 'text/html' } as any, suggest3);
		expect(suggest3.mock.calls).toEqual([[{ filename: 'escaped_root/phish.bin', conflictAction: 'uniquify' }]]);

		await done;
	});

	it('prevents URL-encoded path traversal (%2F / %5C) in Firefox mode without onDeterminingFilename', async () => {
		chrome.downloads.onDeterminingFilename = undefined;

		await startBatch(['https://example.com/assets/..%2F..%2F..%5Cphoto.png'], {
			folder_name: 'safe_album',
		});

		expect(chrome.downloads.download.mock.calls.at(-1)[0]).toEqual({
			url: 'https://example.com/assets/..%2F..%2F..%5Cphoto.png',
			filename: 'safe_album/photo.png',
			conflictAction: 'uniquify',
		});
	});
});
