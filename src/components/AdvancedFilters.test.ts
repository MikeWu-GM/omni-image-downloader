import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import html, { render } from '../html.js';
import { mockChrome, mockDOM } from '../test-helpers.js';
import { AdvancedFilters } from './AdvancedFilters.js';
import {
	filterMaxHeight,
	filterMaxHeightEnabled,
	filterMaxWidth,
	filterMaxWidthEnabled,
	filterMinHeight,
	filterMinHeightEnabled,
	filterMinWidth,
	filterMinWidthEnabled,
	filterSizePreset,
} from './data.js';

mockDOM();

describe('AdvancedFilters slider performance and synchronization', () => {
	let container: HTMLElement;

	beforeEach(() => {
		(globalThis as any).chrome = mockChrome();
		container = document.createElement('div');
		document.body.appendChild(container);

		filterMinWidthEnabled.value = true;
		filterMaxWidthEnabled.value = true;
		filterMinHeightEnabled.value = false;
		filterMaxHeightEnabled.value = false;
		filterMinWidth.value = 0;
		filterMaxWidth.value = 3000;
		filterMinHeight.value = 0;
		filterMaxHeight.value = 3000;
		filterSizePreset.value = 'all';
	});

	afterEach(() => {
		filterMinWidthEnabled.value = false;
		filterMaxWidthEnabled.value = false;
		filterMinHeightEnabled.value = false;
		filterMaxHeightEnabled.value = false;
		filterMinWidth.value = 0;
		filterMaxWidth.value = 3000;
		filterMinHeight.value = 0;
		filterMaxHeight.value = 3000;
		filterSizePreset.value = 'all';
	});

	it('does not call noUiSlider.set() back onto the slider when update/slide fires with float precision noise', async () => {
		render(html`<${AdvancedFilters} />`, container);
		await new Promise((r) => setTimeout(r, 50));

		const sliderEl = Array.from(container.querySelectorAll('div')).find((el: any) => el.noUiSlider) as any;
		expect(sliderEl?.noUiSlider).toBeDefined();

		const sliderApi = sliderEl.noUiSlider;
		const setSpy = spyOn(sliderApi, 'set');

		// Simulate IEEE-754 float noise from noUiSlider.get(true) while user drags handle to 410
		spyOn(sliderApi, 'get').mockReturnValue([410.00000000000006, 3000]);

		filterMinWidth.value = 410;
		render(html`<${AdvancedFilters} />`, container);
		await new Promise((r) => setTimeout(r, 50));

		// Because Math.round(410.00000000000006) === 410, it must NOT fight the drag by calling .set()
		expect(setSpy).not.toHaveBeenCalled();
	});

	it('synchronizes slider position when filterMinWidth is changed externally (e.g. via presets)', async () => {
		render(html`<${AdvancedFilters} />`, container);
		await new Promise((r) => setTimeout(r, 50));

		const sliderEl = Array.from(container.querySelectorAll('div')).find((el: any) => el.noUiSlider) as any;
		const sliderApi = sliderEl.noUiSlider;
		const setSpy = spyOn(sliderApi, 'set');

		filterMinWidth.value = 1200;
		render(html`<${AdvancedFilters} />`, container);
		await new Promise((r) => setTimeout(r, 50));

		expect(setSpy).toHaveBeenCalledWith([1200, 3000]);
	});

	it('updates display label immediately on slide and commits filter signals via requestAnimationFrame', async () => {
		render(html`<${AdvancedFilters} />`, container);
		await new Promise((r) => setTimeout(r, 50));

		const sliderEl = Array.from(container.querySelectorAll('div')).find((el: any) => el.noUiSlider) as any;
		const sliderApi = sliderEl.noUiSlider;
		const destroySpy = spyOn(sliderApi, 'destroy');

		// Move handle 0 upward by 20% (from 0 to 600)
		sliderApi.__moveHandles(true, 20, [0]);
		await new Promise((r) => setTimeout(r, 50));

		expect(filterMinWidth.value).toBe(600);
		expect(filterSizePreset.value).toBe('custom');

		// Unmount cleans up slider instance
		render(html`<div />`, container);
		await new Promise((r) => setTimeout(r, 50));
		expect(destroySpy).toHaveBeenCalled();
	});
});
