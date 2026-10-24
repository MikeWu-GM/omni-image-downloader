// @ts-check
import html, { Show, useComputed, useSignal } from '../html.js';
import { toggle } from '../utils.js';
import { AdvancedFilters } from './AdvancedFilters.js';
import { Bubble } from './Bubble.js';
import {
	applySizePreset,
	availableFormats,
	customLargeThreshold,
	customSmallThreshold,
	filterMaxHeightEnabled,
	filterMaxWidth,
	filterMaxWidthEnabled,
	filterMinHeightEnabled,
	filterMinWidth,
	filterMinWidthEnabled,
	filterSizePreset,
	filterUrl,
	filterUrlMode,
	getLockedTabId,
	hideErroredImages,
	hostname,
	limitedAccessHostnames,
	loadImagesFromActiveTab,
	loadImagesFromCurrentWindow,
	extractionScope,
	tabGroups,
	setAllTabGroupsCollapsed,
	onlyImagesFromLinks,
	onlyUniqueImages,
	openMode,
	scriptError,
	selectedFormats,
	showAdvancedFilters,
} from './data.js';
import { StatusToolbar } from './StatusToolbar.js';
import { UrlFilterMode } from './UrlFilterMode.js';

export function Header(/** @type {Object} */ props) {
	const showFormatMenu = useSignal(false);
	const showSizeMenu = useSignal(false);

	const isFormatSelected = (/** @type {string} */ fmt) => selectedFormats.value.includes(fmt);
	const toggleFormat = (/** @type {string} */ fmt) => {
		if (selectedFormats.value.includes(fmt)) {
			selectedFormats.value = selectedFormats.value.filter((f) => f !== fmt);
		} else {
			selectedFormats.value = [...selectedFormats.value, fmt];
		}
	};

	const getActiveSizeLabel = () => {
		if (filterSizePreset.value === 'large') return `Large ≥${customLargeThreshold.value}px`;
		if (filterSizePreset.value === 'medium')
			return `Medium (${customSmallThreshold.value}-${customLargeThreshold.value})`;
		if (filterSizePreset.value === 'small') return `Small <${customSmallThreshold.value}px`;
		if (filterSizePreset.value === 'custom') {
			if (filterMinWidthEnabled.value && filterMaxWidthEnabled.value) {
				return `${filterMinWidth.value}~${filterMaxWidth.value}px`;
			}
			if (filterMinWidthEnabled.value) return `≥${filterMinWidth.value}px`;
			if (filterMaxWidthEnabled.value) return `≤${filterMaxWidth.value}px`;
			return 'Custom size';
		}
		return 'Size: All';
	};

	const numberOfActiveAdvancedFilters = [
		filterMinWidthEnabled,
		filterMaxWidthEnabled,
		filterMinHeightEnabled,
		filterMaxHeightEnabled,
		onlyUniqueImages,
		onlyImagesFromLinks,
		hideErroredImages,
	].filter((s) => s.value).length;

	const hostnameIsLimited = useComputed(() => limitedAccessHostnames.test(hostname.value));

	const openModeButton = chrome.sidePanel
		? html`
				<button
					type="button"
					class="min-w-8"
					title=${openMode.value === 'sidebar' ? 'Switch to popup mode' : 'Switch to sidebar mode'}
					onClick=${async () => {
						if (openMode.value === 'sidebar') {
							openMode.value = 'popup';
							const tabId = getLockedTabId();
							if (tabId != null && chrome.sidePanel?.setOptions) {
								chrome.sidePanel.setOptions({ tabId, enabled: false })?.catch?.(() => {});
							}
							openPopup();
						} else {
							openMode.value = 'sidebar';
							openSidebar();
						}
					}}
				>
					<img class="inline w-5" src=${openMode.value === 'sidebar' ? '/images/window.svg' : '/images/sidebar.svg'} />
				</button>
			`
		: null;

	const closeButton = html`
		<button
			type="button"
			class="min-w-8"
			title="Close extension"
			onClick=${() => {
				const tabId = getLockedTabId();
				if (tabId != null && chrome.sidePanel?.setOptions) {
					chrome.sidePanel.setOptions({ tabId, enabled: false })?.catch?.(() => {});
				}
				window.close();
			}}
		>
			<img class="inline w-3" src="/images/times.svg" />
		</button>
	`;

	return html`
		<header ...${props}>
			<${Show} when=${hostnameIsLimited}>
				<div class="bg-sky-100 p-2 text-sky-800">
					<span class="text-shadow">🛡️</span> OmniImage Downloader has limited access to sensitive domains like
					<b> ${hostname}</b>
				</div>
			<//>

			<${Show} when=${scriptError}>
				<div class="bg-amber-100 p-2 text-amber-800">
					<span class="text-shadow">⚠️ </span> OmniImage Downloader cannot access the contents of this page - please
					close the extension and open it again
				</div>
			<//>

			<!-- Scope Switcher: Tab vs Window -->
			<div
				class="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-2.5 py-1 text-xs dark:border-slate-800 dark:bg-slate-900/70"
			>
				<div
					class="text-2xs flex items-center overflow-hidden rounded-md border border-slate-300 bg-slate-200/50 p-0.5 font-semibold dark:border-slate-700 dark:bg-slate-800/80"
				>
					<button
						type="button"
						class="${
							extractionScope.value === 'current_tab'
								? 'bg-white text-sky-700 shadow-xs dark:bg-slate-700 dark:text-sky-300'
								: 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
						} flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-colors"
						title="Extract images from currently active tab only"
						onClick=${() => {
							if (extractionScope.value !== 'current_tab') {
								extractionScope.value = 'current_tab';
								loadImagesFromActiveTab({ waitForIdleDOM: 1 });
							}
						}}
					>
						<span>📄 Current Tab</span>
					</button>

					<button
						type="button"
						class="${
							extractionScope.value === 'current_window'
								? 'bg-white text-sky-700 shadow-xs dark:bg-slate-700 dark:text-sky-300'
								: 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
						} flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-colors"
						title="Extract images from all tabs in current window"
						onClick=${() => {
							if (extractionScope.value !== 'current_window') {
								extractionScope.value = 'current_window';
								loadImagesFromCurrentWindow({ waitForIdleDOM: 1 });
							}
						}}
					>
						<span>🗂️ Current Window</span>
						${
							tabGroups.value.length > 0
								? html`<span
										class="text-3xs rounded-full bg-sky-100 px-1 text-sky-800 dark:bg-sky-900/80 dark:text-sky-200"
									>
										${tabGroups.value.length} Tabs
									</span>`
								: null
						}
					</button>
				</div>

				${
					extractionScope.value === 'current_window'
						? html`
								<div class="text-3xs flex items-center gap-1">
									<button
										type="button"
										class="cursor-pointer rounded border border-slate-300 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
										title="Collapse all tab groups"
										onClick=${() => setAllTabGroupsCollapsed(true)}
									>
										Collapse All
									</button>
									<button
										type="button"
										class="cursor-pointer rounded border border-slate-300 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
										title="Expand all tab groups"
										onClick=${() => setAllTabGroupsCollapsed(false)}
									>
										Expand All
									</button>
								</div>
							`
						: null
				}
			</div>

			<!-- Pro Compact Filter Dock -->
			<div class="flex flex-col gap-1 p-2">
				<div class="flex items-center gap-1 text-xs">
					<button
						type="button"
						class="flex size-7 min-w-7 cursor-pointer items-center justify-center rounded border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
						title=${
							extractionScope.value === 'current_window'
								? 'Reload images from all tabs in window'
								: 'Reload images from current tab'
						}
						onClick=${() => {
							if (extractionScope.value === 'current_window') {
								loadImagesFromCurrentWindow({ waitForIdleDOM: 1 });
							} else {
								loadImagesFromActiveTab({ waitForIdleDOM: 1 });
							}
						}}
					>
						<img class="w-3" src="/images/reload.svg" />
					</button>

					<input
						id="filter_by_url_input"
						type="text"
						placeholder="URL Filter"
						title="Filter by parts of the URL"
						value=${filterUrl}
						class="min-w-20 flex-1"
						onInput=${(/** @type {Event} */ e) =>
							(filterUrl.value = /** @type {HTMLInputElement} */ (e.currentTarget).value.trim())}
					/>

					<${UrlFilterMode}
						id="url_filter_mode_select"
						value=${filterUrlMode}
						onChange=${(/** @type {Event} */ e) =>
							(filterUrlMode.value = /** @type {HTMLInputElement} */ (e.currentTarget).value)}
					/>

					<!-- Compact Size Dropdown Trigger (Linked to Slider & Custom Thresholds) -->
					<div class="relative">
						<button
							type="button"
							class="text-2xs ${
								filterSizePreset.value !== 'all' || filterMinWidthEnabled.value || filterMaxWidthEnabled.value
									? 'border-sky-600 bg-sky-600 text-white'
									: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
							} flex items-center gap-1 rounded border px-2 py-1 font-medium transition-colors"
							title="Filter by image size (Presets & Sliders)"
							onClick=${toggle(showSizeMenu)}
						>
							<span>${getActiveSizeLabel()}</span>
							<span class="text-3xs">▾</span>
						</button>

						<${Show} when=${showSizeMenu}>
							<div
								class="text-2xs absolute top-full left-0 z-50 mt-1 flex min-w-56 flex-col rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
							>
								<div class="text-3xs mb-1 font-bold tracking-wider text-slate-400 uppercase">Size presets</div>

								<button
									type="button"
									class="${
										filterSizePreset.value === 'all' && !filterMinWidthEnabled.value && !filterMaxWidthEnabled.value
											? 'font-bold text-sky-600 dark:text-sky-400'
											: ''
									} flex items-center justify-between rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
									onClick=${() => {
										applySizePreset('all');
										showSizeMenu.value = false;
									}}
								>
									<span>All sizes (No limit)</span>
									${
										filterSizePreset.value === 'all' && !filterMinWidthEnabled.value && !filterMaxWidthEnabled.value
											? html`<span>✓</span>`
											: null
									}
								</button>

								<button
									type="button"
									class="${
										filterSizePreset.value === 'large' ? 'font-bold text-sky-600 dark:text-sky-400' : ''
									} flex items-center justify-between rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
									onClick=${() => {
										applySizePreset('large');
										showSizeMenu.value = false;
									}}
								>
									<span>Large (≥${customLargeThreshold.value}px)</span>
									${filterSizePreset.value === 'large' ? html`<span>✓</span>` : null}
								</button>

								<button
									type="button"
									class="${
										filterSizePreset.value === 'medium' ? 'font-bold text-sky-600 dark:text-sky-400' : ''
									} flex items-center justify-between rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
									onClick=${() => {
										applySizePreset('medium');
										showSizeMenu.value = false;
									}}
								>
									<span>Medium (${customSmallThreshold.value}-${customLargeThreshold.value}px)</span>
									${filterSizePreset.value === 'medium' ? html`<span>✓</span>` : null}
								</button>

								<button
									type="button"
									class="${
										filterSizePreset.value === 'small' ? 'font-bold text-sky-600 dark:text-sky-400' : ''
									} flex items-center justify-between rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
									onClick=${() => {
										applySizePreset('small');
										showSizeMenu.value = false;
									}}
								>
									<span>${`Small (<${customSmallThreshold.value}px)`}</span>
									${filterSizePreset.value === 'small' ? html`<span>✓</span>` : null}
								</button>

								<div class="my-1.5 border-t border-slate-200 dark:border-slate-700"></div>

								<!-- Custom Thresholds and Slider Linkage -->
								<div class="text-3xs mb-1 font-bold tracking-wider text-slate-400 uppercase">Custom thresholds</div>

								<div class="flex flex-col gap-1.5 rounded bg-slate-50 p-1.5 dark:bg-slate-900/60">
									<label class="text-2xs flex items-center justify-between">
										<span>Large ≥</span>
										<div class="flex items-center gap-1">
											<input
												type="number"
												min="100"
												step="100"
												class="w-16 rounded border border-slate-300 bg-white px-1 py-0.5 text-center dark:border-slate-600 dark:bg-slate-900"
												value=${customLargeThreshold.value}
												onInput=${(/** @type {Event} */ e) => {
													const val = Math.max(
														100,
														parseInt(/** @type {HTMLInputElement} */ (e.currentTarget).value, 10) || 1200
													);
													customLargeThreshold.value = val;
													if (filterSizePreset.value === 'large') {
														filterMinWidth.value = val;
													}
												}}
											/>
											<span>px</span>
										</div>
									</label>

									<label class="text-2xs flex items-center justify-between">
										<span>${'Small <'}</span>
										<div class="flex items-center gap-1">
											<input
												type="number"
												min="50"
												step="50"
												class="w-16 rounded border border-slate-300 bg-white px-1 py-0.5 text-center dark:border-slate-600 dark:bg-slate-900"
												value=${customSmallThreshold.value}
												onInput=${(/** @type {Event} */ e) => {
													const val = Math.max(
														10,
														parseInt(/** @type {HTMLInputElement} */ (e.currentTarget).value, 10) || 400
													);
													customSmallThreshold.value = val;
													if (filterSizePreset.value === 'small') {
														filterMaxWidth.value = val;
													}
												}}
											/>
											<span>px</span>
										</div>
									</label>

									<button
										type="button"
										class="mt-1 flex items-center justify-center gap-1 rounded bg-sky-100 py-1 font-semibold text-sky-800 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-300"
										onClick=${() => {
											showAdvancedFilters.value = true;
											filterSizePreset.value = 'custom';
											showSizeMenu.value = false;
										}}
									>
										<span>🎚️ Adjust with sliders</span>
									</button>
								</div>
							</div>
						<//>
					</div>

					<!-- Compact Formats Dropdown Trigger -->
					<div class="relative">
						<button
							type="button"
							class="text-2xs ${
								selectedFormats.value.length > 0
									? 'border-emerald-600 bg-emerald-600 text-white'
									: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
							} flex items-center gap-1 rounded border px-2 py-1 font-medium transition-colors"
							title=${
								selectedFormats.value.length > 0
									? `Selected formats: ${selectedFormats.value.join(', ').toUpperCase()}`
									: 'Filter by detected image format'
							}
							onClick=${toggle(showFormatMenu)}
						>
							<span>
								${
									selectedFormats.value.length === 0
										? 'Format: All'
										: selectedFormats.value.length === 1
											? `Format: ${selectedFormats.value[0].toUpperCase()}`
											: `Format: (${selectedFormats.value.length})`
								}
							</span>
							<span class="text-3xs">▾</span>
						</button>

						<${Show} when=${showFormatMenu}>
							<div
								class="text-2xs absolute top-full right-0 z-50 mt-1 flex min-w-36 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
							>
								<button
									type="button"
									class="flex items-center justify-between rounded px-2 py-1 font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
									onClick=${() => (selectedFormats.value = [])}
								>
									<span>All formats</span>
									${selectedFormats.value.length === 0 ? html`<span>✓</span>` : null}
								</button>

								<div class="my-0.5 border-t border-slate-200 dark:border-slate-700"></div>

								${(() => {
									const existingFormats = new Set(availableFormats.value.map((f) => f.format));
									const orphanedFormats = selectedFormats.value.filter((fmt) => !existingFormats.has(fmt));
									const allItems = [
										...availableFormats.value,
										...orphanedFormats.map((fmt) => ({ format: fmt, count: 0 })),
									];
									return allItems.map(
										({ format, count }) => html`
											<button
												key=${format}
												type="button"
												class="${
													isFormatSelected(format) ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''
												} flex items-center justify-between rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700"
												onClick=${() => toggleFormat(format)}
											>
												<span class="uppercase">${format}</span>
												<span class="text-3xs text-slate-400">(${count})</span>
											</button>
										`
									);
								})()}
							</div>
						<//>
					</div>

					<button
						type="button"
						class="relative flex size-7 min-w-7 items-center justify-center rounded border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
						title="Toggle advanced slider filters"
						onClick=${toggle(showAdvancedFilters)}
					>
						<img class="w-3" src="/images/chevron.svg" />
						<${Bubble} show=${!showAdvancedFilters.value && numberOfActiveAdvancedFilters > 0}>
							${numberOfActiveAdvancedFilters}
						<//>
					</button>

					${openModeButton} ${closeButton}
				</div>
			</div>

			<!-- Precise Sliders Drawer -->
			<${Show} when=${showAdvancedFilters}>
				<${AdvancedFilters} />
			<//>

			<!-- Standalone Sticky Status Toolbar (Matching, Filtered, Selected) -->
			<${StatusToolbar} />
		</header>
	`;
}

async function openPopup() {
	try {
		await chrome.action.setPopup({ popup: 'src/Popup/index.html' });
		await chrome.action.openPopup?.();
	} catch {
		// Ignore when browser does not allow programmatic openPopup after async transition
	} finally {
		window.close();
	}
}

async function openSidebar() {
	try {
		const lockedId = getLockedTabId();
		if (lockedId != null) {
			if (chrome.sidePanel?.setOptions) {
				chrome.sidePanel
					.setOptions({
						tabId: lockedId,
						path: `src/SidePanel/index.html?tabId=${lockedId}`,
						enabled: true,
					})
					?.catch?.(() => {});
			}
			// Call sidePanel.open synchronously before awaiting setPopup to preserve user gesture!
			const openPromise = chrome.sidePanel.open({ tabId: lockedId });
			await Promise.allSettled([chrome.action.setPopup({ popup: '' }), openPromise]);
			window.close();
			return;
		}

		await chrome.action.setPopup({ popup: '' });
		const activeTabs = await new Promise((resolve) =>
			chrome.tabs.query({ active: true, currentWindow: true }, resolve)
		);
		if (activeTabs && activeTabs.length > 0 && activeTabs[0].id != null) {
			const tabId = activeTabs[0].id;
			if (chrome.sidePanel?.setOptions) {
				await chrome.sidePanel.setOptions({
					tabId,
					path: `src/SidePanel/index.html?tabId=${tabId}`,
					enabled: true,
				});
			}
			await chrome.sidePanel.open({ tabId });
		} else {
			const currentWindow = await new Promise((resolve) => chrome.windows.getCurrent(resolve));
			await chrome.sidePanel.open({ windowId: currentWindow.id });
		}
		window.close();
	} catch {
		window.close();
	}
}
