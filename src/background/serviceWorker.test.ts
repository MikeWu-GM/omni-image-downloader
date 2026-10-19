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

function startBatch(images: string[], options: any = {}) {
	const startDownload = chrome.runtime.onMessage.addListener.mock.calls[0][0];
	return new Promise<void>((resolve) => {
		startDownload({ type: 'downloadImages', imagesToDownload: images, options }, {}, resolve);
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
});

describe('serviceWorker open_mode dynamic updates and installation', () => {
	it('opens the Options page when extension is newly installed', async () => {
		const installedListener = [...chrome.runtime.onInstalled.listeners][0] as (details: {
			reason: string;
		}) => Promise<void>;
		expect(installedListener).toBeDefined();

		await installedListener({ reason: 'install' });
		expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'src/Options/index.html' });
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
