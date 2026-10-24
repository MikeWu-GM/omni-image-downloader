// @ts-check
import html, { For, useEffect } from '../html.js';

import {
	allImages,
	detectedImageExtensions,
	imageErrored,
	imageLoaded,
	imagesCache,
	initialize,
	initialized,
	extractionScope,
	loadImagesFromActiveTab,
	loadImagesFromCurrentWindow,
	reloadImagesWhenPageLoads,
	updateDetectedExtension,
} from './data.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { Footer } from './Footer.js';
import { Header } from './Header.js';
import { Images } from './Images.js';
import { fetchImageExtension, getImageExtension } from './useImageStats.js';
import { useTheme } from './useTheme.js';

export function App() {
	return html`<${ErrorBoundary}><${AppWithoutErrorBoundary} /><//>`;
}

function AppWithoutErrorBoundary() {
	useTheme();

	useEffect(() => {
		const urlTabId = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tabId');
		chrome.tabs.onUpdated.addListener(reloadImagesWhenPageLoads);
		if (!urlTabId) {
			chrome.tabs.onActivated.addListener(({ tabId }) => reloadImagesWhenPageLoads(tabId, {}, null));
		}

		initialize().then(() => {
			if (extractionScope.value === 'current_window') {
				loadImagesFromCurrentWindow({ waitForIdleDOM: false });
			} else {
				loadImagesFromActiveTab({ waitForIdleDOM: false });
			}
		});
	}, []);

	if (!initialized.value) {
		return html`<div class="p-4">Initializing...</div>`;
	}

	return html`
		<${Header} class="sticky top-0 z-1 bg-white shadow-md dark:bg-slate-900" />

		<div id="images_cache" ref=${(/** @type {HTMLDivElement} */ element) => (imagesCache.value = element)} hidden>
			<${For} each=${allImages}>
				${(/** @type {string} */ url) => html`
					<img
						key=${url}
						src=${url}
						onLoad=${(/** @type {Event} */ e) => {
							const img = /** @type {HTMLImageElement} */ (e.currentTarget);
							imageLoaded(url, img.naturalWidth, img.naturalHeight);
							if (!getImageExtension(url) && !detectedImageExtensions.peek()[url]) {
								fetchImageExtension(url).then((ext) => {
									if (ext) updateDetectedExtension(url, ext);
								});
							}
						}}
						onError=${() => imageErrored(url)}
					/>
				`}
			<//>
		</div>

		<${Images} id="images_container" />

		<${Footer}
			class="sticky bottom-0 mt-auto bg-white p-2 dark:bg-slate-900"
			style=${{
				boxShadow:
					'0 -4px 6px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 2px 4px -2px var(--tw-shadow-color, rgb(0 0 0 / 0.1))',
			}}
		/>
	`;
}
