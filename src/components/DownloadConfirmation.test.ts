import { beforeEach, describe, expect, it, mock } from 'bun:test';
import html, { render } from '../html.js';
import { mockDOM } from '../test-helpers';
import { DownloadConfirmation } from './DownloadConfirmation.js';

mockDOM();

describe('DownloadConfirmation', () => {
	let container: HTMLElement;
	let onCheckboxChange: ReturnType<typeof mock>;
	let onClose: ReturnType<typeof mock>;
	let onConfirm: ReturnType<typeof mock>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		onCheckboxChange = mock();
		onClose = mock();
		onConfirm = mock();
	});

	it('renders warning with the specified number of images', () => {
		render(
			html`<${DownloadConfirmation}
				numberOfImages=${42}
				onCheckboxChange=${onCheckboxChange}
				onClose=${onClose}
				onConfirm=${onConfirm}
			/>`,
			container
		);

		expect(container.innerHTML).toContain('42 popup windows');
		expect(container.innerHTML).toContain("Got it, don't show again");
	});

	it('triggers onCheckboxChange when checkbox is clicked', () => {
		render(
			html`<${DownloadConfirmation}
				numberOfImages=${10}
				onCheckboxChange=${onCheckboxChange}
				onClose=${onClose}
				onConfirm=${onConfirm}
			/>`,
			container
		);

		const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox).not.toBeNull();
		checkbox?.click();

		expect(onCheckboxChange).toHaveBeenCalled();
	});

	it('triggers onClose when Cancel button is clicked without calling onConfirm', () => {
		render(
			html`<${DownloadConfirmation}
				numberOfImages=${5}
				onCheckboxChange=${onCheckboxChange}
				onClose=${onClose}
				onConfirm=${onConfirm}
			/>`,
			container
		);

		const cancelButton = Array.from(container.querySelectorAll('button')).find(
			(btn) => btn.textContent?.trim() === 'Cancel'
		);
		expect(cancelButton).toBeDefined();

		cancelButton?.click();
		expect(onClose).toHaveBeenCalled();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it('triggers both onClose and onConfirm when Yes, download button is clicked', () => {
		render(
			html`<${DownloadConfirmation}
				numberOfImages=${5}
				onCheckboxChange=${onCheckboxChange}
				onClose=${onClose}
				onConfirm=${onConfirm}
			/>`,
			container
		);

		const confirmButton = Array.from(container.querySelectorAll('button')).find((btn) =>
			btn.textContent?.includes('Yes, download')
		);
		expect(confirmButton).toBeDefined();

		confirmButton?.click();
		expect(onClose).toHaveBeenCalled();
		expect(onConfirm).toHaveBeenCalled();
	});
});
