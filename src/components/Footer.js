// @ts-check
import html from '../html.js';

import { removeSpecialCharacters, setToCheckboxValue, setToInvertedCheckboxValue } from '../utils.js';
import { triggerDownload } from './actions.js';
import { Checkbox } from './Checkbox.js';
import {
	currentSelectedImages,
	downloadConfirmationIsShown,
	folderName,
	isFolderCustomized,
	maxConcurrentDownloads,
	newFileName,
	saveSourceUrl,
	showDownloadConfirmation,
} from './data.js';
import { DownloadConfirmation } from './DownloadConfirmation.js';
import { useRunAfterUpdate } from './useRunAfterUpdate.js';

export function Footer(/** @type {Object} */ props) {
	const runAfterUpdate = useRunAfterUpdate();

	return html`
		<footer ...${props}>
			${
				downloadConfirmationIsShown.value
					? html`
							<${DownloadConfirmation}
								numberOfImages=${currentSelectedImages.value.length}
								onCheckboxChange=${setToInvertedCheckboxValue(showDownloadConfirmation)}
								onClose=${() => (downloadConfirmationIsShown.value = false)}
								onConfirm=${triggerDownload}
							/>
						`
					: html`
							<div class="grid grid-cols-2 gap-2">
								<input
									id="subfolder_name_input"
									class="flex-1"
									type="text"
									placeholder="Save to subfolder"
									title="Set the name of the subfolder you want to download the images to."
									value=${folderName}
									onChange=${(/** @type {Event} */ e) => {
										const input = /** @type HTMLInputElement */ (e.currentTarget);
										const savedSelectionStart = removeSpecialCharacters(
											input.value.slice(0, input.selectionStart || 0)
										).length;

										runAfterUpdate(() => {
											input.selectionStart = input.selectionEnd = savedSelectionStart;
										});

										isFolderCustomized.value = true;
										folderName.value = removeSpecialCharacters(input.value);
									}}
								/>

								<input
									id="rename_pattern_input"
									class="flex-1"
									type="text"
									placeholder="Rename files"
									title="Set a new file name for the images you want to download."
									value=${newFileName}
									onChange=${(/** @type {Event} */ e) => {
										const input = /** @type HTMLInputElement */ (e.currentTarget);
										const savedSelectionStart = removeSpecialCharacters(
											input.value.slice(0, input.selectionStart || 0)
										).length;

										runAfterUpdate(() => {
											input.selectionStart = input.selectionEnd = savedSelectionStart;
										});

										newFileName.value = removeSpecialCharacters(input.value);
									}}
								/>
							</div>

							<div class="mt-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
								<${Checkbox}
									checked=${saveSourceUrl}
									onChange=${setToCheckboxValue(saveSourceUrl)}
									title="Save source webpage HTML shortcut into the download folder"
								>
									Save source URL (source.html)
								<//>

								<label class="flex items-center gap-1" title="Maximum number of simultaneous downloads (1–20)">
									<span>Max concurrent:</span>
									<input
										id="max_concurrent_downloads_input"
										type="number"
										min="1"
										max="20"
										step="1"
										class="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-center dark:border-slate-600 dark:bg-slate-900"
										value=${maxConcurrentDownloads}
										onChange=${(/** @type {Event} */ e) => {
											const input = /** @type {HTMLInputElement} */ (e.currentTarget);
											const raw = parseInt(input.value, 10);
											const clamped = isNaN(raw) ? 4 : Math.min(20, Math.max(1, raw));
											maxConcurrentDownloads.value = clamped;
											input.value = String(clamped);
										}}
									/>
								</label>
							</div>
						`
			}
		</footer>
	`;
}
