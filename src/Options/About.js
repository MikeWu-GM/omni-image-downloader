// @ts-check
import { ExternalLink } from '../components/ExternalLink.js';
import html from '../html.js';

export function About() {
	return html`
		<h1 class="mb-6 flex items-center justify-center gap-2 text-2xl font-bold">
			<img class="h-8 rounded-xl" src="/images/logo.svg" />
			OmniImage Downloader
			<small class="text-slate-400">v${chrome.runtime.getManifest().version}</small>
		</h1>

		<p class="mb-4">
			<b>OmniImage Downloader</b> is a fast, local-only browser extension for extracting, filtering, and
			bulk-downloading images across active tabs or entire browser windows.
		</p>

		<ul class="mb-4 ml-6 list-disc space-y-1">
			<li>100% local execution — no analytics, no tracking, and no external server requests</li>
			<li>Window-wide multi-tab extraction and tab-scoped Side Panel isolation</li>
			<li>Deep extraction across standard DOM, CSS background images, Shadow DOM, and Blob URLs</li>
			<li>Smart deduplication, dynamic format detection, and real-time natural dimension filtering</li>
			<li>Configurable concurrent download engine (up to 128 parallel tasks) with automatic source bookmarking</li>
		</ul>

		<hr class="my-4" />

		<p class="text-sm text-slate-600 dark:text-slate-400">
			Open-source software licensed under the GNU General Public License v3 (GPLv3). Independently maintained and
			enhanced by <b>MikeWu-GM</b> (<${ExternalLink} href="https://github.com/MikeWu-GM/omni-image-downloader" />).
			Originally forked from Image Downloader Copyright © 2012-2026 Vladimir Sabev (<${ExternalLink}
				href="https://github.com/PactInteractive/image-downloader"
			/>).
		</p>
	`;
}
