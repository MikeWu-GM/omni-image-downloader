// @ts-check
import html from '../html.js';
import { isIncludedIn, isNotIncludedIn, unique } from '../utils.js';
import { Checkbox } from './Checkbox.js';
import { DownloadButton } from './DownloadButton.js';
import { maybeDownloadImages } from './actions.js';
import {
	columns,
	currentSelectedImages,
	displayedImages,
	downloadIsInProgress,
	extractionScope,
	filteredOutImages,
	matchingImages,
	selectedFilteredOutImages,
	selectedImages,
	selectedMatchingImages,
	subfolderPerTab,
	tab,
	theme,
} from './data.js';

export function StatusToolbar() {
	const allImagesFromCurrentTabAreSelected =
		displayedImages.value.length > 0 && displayedImages.value.every(isIncludedIn(selectedImages.value));

	const themeTooltip = {
		system: 'Using your system theme',
		dark: 'Using dark theme',
		light: 'Using light theme',
	}[theme.value];

	const themeIcon = {
		system: '/images/system.svg',
		dark: '/images/moon.svg',
		light: '/images/sun.svg',
	}[theme.value];

	return html`
		<div
			class="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-200 bg-slate-50/90 px-2 py-1.5 text-xs tabular-nums backdrop-blur dark:border-slate-800 dark:bg-slate-900/90"
		>
			<!-- Left: Matching & Filtered Tabs -->
			<div class="flex items-center gap-1.5">
				<div class="flex items-center overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
					<button
						type="button"
						class="${
							tab.value === 'matching'
								? 'bg-sky-600 text-white dark:bg-sky-500'
								: 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
						} flex items-center gap-1 px-2 py-1 font-medium transition-colors"
						title="Images matching your filters"
						onClick=${() => (tab.value = 'matching')}
					>
						<span
							class="text-2xs ${
								tab.value === 'matching' ? 'bg-white text-sky-700' : 'bg-green-600 text-white'
							} inline-flex size-4 items-center justify-center rounded-full font-bold"
						>
							${selectedMatchingImages.value.length > 0 ? selectedMatchingImages.value.length : '✓'}
						</span>
						<span>${matchingImages.value.length} matching</span>
					</button>

					<button
						type="button"
						class="${
							tab.value === 'filtered_out'
								? 'bg-slate-700 text-white dark:bg-slate-600'
								: 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
						} flex items-center gap-1 border-l border-slate-300 px-2 py-1 font-medium transition-colors dark:border-slate-700"
						title="Images removed by your filters"
						onClick=${() => (tab.value = 'filtered_out')}
					>
						<span
							class="text-2xs ${
								tab.value === 'filtered_out' ? 'bg-white text-slate-800' : 'bg-slate-500 text-white'
							} inline-flex size-4 items-center justify-center rounded-full font-bold"
						>
							${selectedFilteredOutImages.value.length > 0 ? selectedFilteredOutImages.value.length : '−'}
						</span>
						<span>${filteredOutImages.value.length} filtered out</span>
					</button>
				</div>

				<!-- Selected Checkbox Pill -->
				<${Checkbox}
					class="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
					checked=${allImagesFromCurrentTabAreSelected}
					indeterminate=${currentSelectedImages.value.length > 0 && !allImagesFromCurrentTabAreSelected}
					disabled=${displayedImages.value.length === 0}
					title="Click to select or unselect all displayed images"
					onChange=${(/** @type {Event} */ e) => {
						const { checked } = /** @type {HTMLInputElement} */ (e.currentTarget);
						selectedImages.value = checked
							? unique([...selectedImages.value, ...displayedImages.value])
							: selectedImages.value.filter(isNotIncludedIn(displayedImages.value));
					}}
				>
					<span class="text-nowrap">${currentSelectedImages.value.length} selected</span>
				<//>

				<!-- Download Button beside selected -->
				<${DownloadButton}
					class="flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold shadow-xs"
					disabled=${currentSelectedImages.value.length === 0}
					loading=${downloadIsInProgress.value}
					onClick=${maybeDownloadImages}
				/>

				${
					extractionScope.value === 'current_window'
						? html`
								<${Checkbox}
									class="text-2xs flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
									checked=${subfolderPerTab.value}
									title="Organize downloaded images into subfolders named after each tab"
									onChange=${(/** @type {Event} */ e) => {
										subfolderPerTab.value = /** @type {HTMLInputElement} */ (e.currentTarget).checked;
									}}
								>
									<span class="text-nowrap">📁 Subfolders</span>
								<//>
							`
						: null
				}
			</div>

			<!-- Right: View Controls (Columns & Theme) -->
			<div class="ml-auto flex items-center gap-1.5">
				<div
					class="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
				>
					<button
						type="button"
						class="size-6 font-bold hover:bg-slate-100 dark:hover:bg-slate-700"
						aria-label="Fewer columns"
						title="Fewer columns"
						onClick=${() => (columns.value = Math.max(1, columns.value - 1))}
					>
						−
					</button>
					<span class="px-1 text-center font-semibold text-slate-600 dark:text-slate-300" title="Columns">
						${columns}
					</span>
					<button
						type="button"
						class="size-6 font-bold hover:bg-slate-100 dark:hover:bg-slate-700"
						aria-label="More columns"
						title="More columns"
						onClick=${() => (columns.value = Math.min(columns.value + 1, 6))}
					>
						+
					</button>
				</div>

				<button
					type="button"
					class="flex size-6 items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
					title=${`${themeTooltip} (click to cycle)`}
					onClick=${() => {
						theme.value = theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system';
					}}
				>
					<img class="w-3.5" src=${themeIcon} />
				</button>
			</div>
		</div>
	`;
}
