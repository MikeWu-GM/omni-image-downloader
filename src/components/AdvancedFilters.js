// @ts-check
import html, { batch, useEffect, useRef, useSignal } from '../html.js';
import { setToCheckboxValue } from '../utils.js';

import noUiSlider from 'nouislider';
import { Checkbox } from './Checkbox.js';
import {
	defaults,
	filterMaxHeight,
	filterMaxHeightEnabled,
	filterMaxWidth,
	filterMaxWidthEnabled,
	filterMinHeight,
	filterMinHeightEnabled,
	filterMinWidth,
	filterMinWidthEnabled,
	filterSizePreset,
	hideErroredImages,
	onlyImagesFromLinks,
	onlyUniqueImages,
} from './data.js';

export function AdvancedFilters() {
	const widthSlider = useSlider('width');
	const heightSlider = useSlider('height');

	return html`
		<div class="p-2 pt-0">
			<table class="w-full tabular-nums">
				<colgroup>
					<col class="w-10" />
					<col class="w-22" />
					<col />
					<col class="w-18" />
				</colgroup>

				<tr>
					<td class="pb-0.5">Width:</td>

					<td>
						<label
							class="${
								filterMinWidthEnabled.value ? '' : 'text-slate-500 dark:text-slate-300'
							} flex items-center justify-end"
							title=${getSliderCheckboxTooltip(filterMinWidthEnabled.value)}
						>
							<small>${widthSlider.displayMin}px ≤</small>
							<input
								type="checkbox"
								checked=${filterMinWidthEnabled}
								onChange=${setToCheckboxValue(filterMinWidthEnabled)}
							/>
						</label>
					</td>

					<td class="px-4 py-1.5">
						<div ref=${widthSlider.sliderRef}></div>
					</td>

					<td>
						<label
							class="${
								filterMaxWidthEnabled.value ? '' : 'text-slate-500 dark:text-slate-300'
							} flex items-center justify-start text-nowrap"
							title=${getSliderCheckboxTooltip(filterMaxWidthEnabled.value)}
						>
							<input
								type="checkbox"
								checked=${filterMaxWidthEnabled}
								onChange=${setToCheckboxValue(filterMaxWidthEnabled)}
							/>
							<small>≤ ${widthSlider.displayMax}px</small>
						</label>
					</td>
				</tr>

				<tr>
					<td class="pb-0.5">Height:</td>

					<td>
						<label
							class="${
								filterMinHeightEnabled.value ? '' : 'text-slate-500 dark:text-slate-300'
							} flex items-center justify-end text-nowrap"
							title=${getSliderCheckboxTooltip(filterMinHeightEnabled.value)}
						>
							<small>${heightSlider.displayMin}px ≤</small>
							<input
								type="checkbox"
								checked=${filterMinHeightEnabled}
								onChange=${setToCheckboxValue(filterMinHeightEnabled)}
							/>
						</label>
					</td>

					<td class="px-4 py-1.5">
						<div ref=${heightSlider.sliderRef}></div>
					</td>

					<td>
						<label
							class="${
								filterMaxHeightEnabled.value ? '' : 'text-slate-500 dark:text-slate-300'
							} flex items-center justify-start text-nowrap"
							title=${getSliderCheckboxTooltip(filterMaxHeightEnabled.value)}
						>
							<input
								type="checkbox"
								checked=${filterMaxHeightEnabled}
								onChange=${setToCheckboxValue(filterMaxHeightEnabled)}
							/>
							<small>≤ ${heightSlider.displayMax}px</small>
						</label>
					</td>
				</tr>
			</table>

			<div class="flex gap-3">
				<${Checkbox}
					class="py-1"
					title="Attempt to deduplicate images by keeping only the highest resolution and best format"
					checked=${onlyUniqueImages.value}
					onChange=${setToCheckboxValue(onlyUniqueImages)}
				>
					Only unique
				<//>

				<${Checkbox}
					class="py-1"
					title="Only show images from direct links on the page; useful on some websites"
					checked=${onlyImagesFromLinks.value}
					onChange=${setToCheckboxValue(onlyImagesFromLinks)}
				>
					Only links
				<//>

				<${Checkbox}
					class="py-1"
					title="Hide images that failed to load"
					checked=${hideErroredImages.value}
					onChange=${setToCheckboxValue(hideErroredImages)}
				>
					Hide errors
				<//>
			</div>
		</div>
	`;
}

function useSlider(/** @type {'width' | 'height'} */ dimension) {
	const sliderRef = useRef(/** @type {HTMLElement | null} */ (null));
	const minDefault = dimension === 'width' ? defaults.filter_min_width : defaults.filter_min_height;
	const maxDefault = dimension === 'width' ? defaults.filter_max_width : defaults.filter_max_height;
	const minSignal = dimension === 'width' ? filterMinWidth : filterMinHeight;
	const maxSignal = dimension === 'width' ? filterMaxWidth : filterMaxHeight;
	const displayMin = useSignal(minSignal.peek());
	const displayMax = useSignal(maxSignal.peek());

	useEffect(() => {
		const slider = /** @type {import('nouislider').target | null} */ (sliderRef.current);
		if (!slider) return;

		/** @type {ReturnType<typeof setTimeout> | number | null} */
		let frameTimer = null;
		/** @type {(string | number)[] | null} */
		let pendingValues = null;
		const scheduleFrame =
			typeof window !== 'undefined' && window.requestAnimationFrame
				? window.requestAnimationFrame.bind(window)
				: (/** @type {() => void} */ cb) => setTimeout(cb, 16);
		const cancelFrame =
			typeof window !== 'undefined' && window.cancelAnimationFrame
				? window.cancelAnimationFrame.bind(window)
				: clearTimeout;

		const commitFilterSignals = (/** @type {(string | number)[]} */ [min, max]) => {
			if (frameTimer != null) {
				cancelFrame(/** @type {any} */ (frameTimer));
				frameTimer = null;
			}
			pendingValues = null;
			const nextMin = Number(min);
			const nextMax = Number(max);
			batch(() => {
				displayMin.value = nextMin;
				displayMax.value = nextMax;
				if (minSignal.peek() !== nextMin) minSignal.value = nextMin;
				if (maxSignal.peek() !== nextMax) maxSignal.value = nextMax;
				if (filterSizePreset.peek() !== 'custom') filterSizePreset.value = 'custom';
			});
		};

		noUiSlider.create(slider, {
			behaviour: 'extend-tap',
			connect: true,
			format: {
				from: (/** @type {string} */ value) => parseInt(value, 10),
				to: (/** @type {number} */ value) => Math.trunc(value),
			},
			range: {
				min: minDefault,
				max: maxDefault,
			},
			step: 10,
			start: [minSignal.peek(), maxSignal.peek()],
		});

		slider.noUiSlider?.on('update', (/** @type {(string | number)[]} */ [min, max]) => {
			const nextMin = Number(min);
			const nextMax = Number(max);
			batch(() => {
				displayMin.value = nextMin;
				displayMax.value = nextMax;
			});
		});

		slider.noUiSlider?.on('slide', (/** @type {(string | number)[]} */ values) => {
			pendingValues = values;
			if (frameTimer != null) return;
			frameTimer = scheduleFrame(() => {
				frameTimer = null;
				if (pendingValues) {
					commitFilterSignals(pendingValues);
				}
			});
		});

		slider.noUiSlider?.on('change', commitFilterSignals);

		return () => {
			if (frameTimer != null) cancelFrame(/** @type {any} */ (frameTimer));
			if (slider.noUiSlider) {
				slider.noUiSlider.destroy();
			}
		};
	}, [dimension]);

	useEffect(() => {
		const nextMin = minSignal.value;
		const nextMax = maxSignal.value;
		batch(() => {
			displayMin.value = nextMin;
			displayMax.value = nextMax;
		});

		const slider = /** @type {import('nouislider').target | null} */ (sliderRef.current);
		if (!slider?.noUiSlider) return;
		if (slider.classList.contains('noUi-state-drag')) return;

		const current = slider.noUiSlider.get(true);
		if (Array.isArray(current)) {
			const curMin = Math.round(Number(current[0]));
			const curMax = Math.round(Number(current[1]));
			if (curMin !== Math.round(nextMin) || curMax !== Math.round(nextMax)) {
				slider.noUiSlider.set([nextMin, nextMax]);
			}
		}
	}, [minSignal.value, maxSignal.value]);

	useEffect(() => {
		const slider = sliderRef.current;
		if (!slider) return;

		const minEnabled = dimension === 'width' ? filterMinWidthEnabled.value : filterMinHeightEnabled.value;
		const maxEnabled = dimension === 'width' ? filterMaxWidthEnabled.value : filterMaxHeightEnabled.value;

		if (minEnabled || maxEnabled) {
			slider.removeAttribute('disabled');
		} else {
			slider.setAttribute('disabled', 'true');
		}
	}, [
		dimension,
		filterMinWidthEnabled.value,
		filterMaxWidthEnabled.value,
		filterMinHeightEnabled.value,
		filterMaxHeightEnabled.value,
	]);

	useDisableSliderHandle(
		() => sliderRef.current?.querySelectorAll('.noUi-origin')[0],
		dimension === 'width' ? filterMinWidthEnabled.value : filterMinHeightEnabled.value
	);

	useDisableSliderHandle(
		() => sliderRef.current?.querySelectorAll('.noUi-origin')[1],
		dimension === 'width' ? filterMaxWidthEnabled.value : filterMaxHeightEnabled.value
	);

	return { sliderRef, displayMin, displayMax };
}

function useDisableSliderHandle(
	/** @type {() => Element | undefined} */ getHandle,
	/** @type {boolean | undefined} */ enabled,
	tooltip = 'Click the checkbox next to this slider to enable it'
) {
	useEffect(() => {
		const handle = getHandle();
		if (!handle) return;

		if (enabled) {
			handle.removeAttribute('disabled');
			handle.removeAttribute('title');
		} else {
			handle.setAttribute('disabled', 'true');
			handle.setAttribute('title', tooltip);
		}
	}, [enabled]);
}

const getSliderCheckboxTooltip = (/** @type {boolean | undefined} */ enabled) =>
	`Click this checkbox to ${enabled ? 'disable' : 'enable'} filtering by this value`;
