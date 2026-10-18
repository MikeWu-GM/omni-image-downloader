// @ts-check
import html, { useSignal } from '../html.js';

import { removeSpecialCharacters, setToCheckboxValue, setToInvertedCheckboxValue } from '../utils.js';
import * as actions from './actions.js';
import { Checkbox } from './Checkbox.js';
import {
	currentSelectedImages,
	folderName,
	isFolderCustomized,
	newFileName,
	saveSourceUrl,
	showDownloadConfirmation,
} from './data.js';
import { DownloadButton } from './DownloadButton.js';
import { DownloadConfirmation } from './DownloadConfirmation.js';
import { useRunAfterUpdate } from './useRunAfterUpdate.js';

export function Footer(/** @type {Object} */ props) {
	// Download
	const downloadIsInProgress = useSignal(false);
	const downloadConfirmationIsShown = useSignal(false);

	function maybeDownloadImages() {
		if (showDownloadConfirmation.value && currentSelectedImages.value.length > 1) {
			downloadConfirmationIsShown.value = true;
		} else {
			downloadImages();
		}
	}

	async function downloadImages() {
		downloadIsInProgress.value = true;
		await actions.downloadImages(currentSelectedImages.value);
		downloadIsInProgress.value = false;
	}

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
								onConfirm=${downloadImages}
							/>
						`
					: html`
							<div class="grid grid-cols-[1fr_1fr_auto] gap-2">
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

								<${DownloadButton}
									class="col-span-1"
									disabled=${currentSelectedImages.value.length === 0}
									loading=${downloadIsInProgress.value}
									onClick=${maybeDownloadImages}
								/>
							</div>

							<div class="mt-1 flex items-center text-xs text-slate-600 dark:text-slate-400">
								<${Checkbox}
									checked=${saveSourceUrl}
									onChange=${setToCheckboxValue(saveSourceUrl)}
									title="Save source webpage HTML shortcut into the download folder"
								>
									Save source URL (source.html)
								<//>
							</div>
						`
			}
		</footer>
	`;
}
