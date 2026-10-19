// @ts-check
import html from '../html.js';

export function DownloadButton(
	/** @type {{ class?: string, disabled: boolean; loading: boolean; [key: string]: any }} */ {
		class: className = '',
		disabled,
		loading,
		...props
	}
) {
	const tooltip = disabled
		? 'Select some images to download first'
		: loading
			? 'If you want, you can close the extension popup\nwhile the images are downloading!'
			: 'Download selected images';

	return html`
		<button
			class="${
				loading ? 'animate-pulse' : ''
			} ${className} bg-sky-600 px-2 text-white hover:bg-sky-700 active:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
			type="button"
			disabled=${disabled || loading}
			title=${tooltip}
			...${props}
		>
			${loading ? '•••' : 'Download'}
		</button>
	`;
}
