import { expect, it } from 'bun:test';
import { readBlobUrls } from './readBlobUrls.js';

it('turns readable blob URLs into data URLs and keeps unreadable ones', async () => {
	const readable = URL.createObjectURL(new Blob(['webp bytes'], { type: 'image/webp' }));
	const unreadable = 'blob:https://example.com/0f8c3a52-5d1e-4c0b-9a7e-2b6f1d9e4c11';

	expect(await readBlobUrls([readable, unreadable])).toEqual([
		`data:image/webp;base64,${btoa('webp bytes')}`,
		unreadable,
	]);
});

it('skips non-image blobs and oversized blobs exceeding the safety threshold', async () => {
	const videoBlobUrl = URL.createObjectURL(new Blob(['video bytes'], { type: 'video/mp4' }));
	const imageBlobUrl = URL.createObjectURL(new Blob(['png bytes'], { type: 'image/png' }));

	expect(await readBlobUrls([videoBlobUrl, imageBlobUrl], 4)).toEqual([videoBlobUrl, imageBlobUrl]);
	expect(await readBlobUrls([videoBlobUrl, imageBlobUrl], 1024)).toEqual([
		videoBlobUrl,
		`data:image/png;base64,${btoa('png bytes')}`,
	]);
});

it('limits concurrent blob fetches to 4 while preserving result order', async () => {
	const originalFetch = globalThis.fetch;
	let inFlight = 0;
	let maxInFlight = 0;
	const resolvers: (() => void)[] = [];

	globalThis.fetch = (async (url: string) => {
		inFlight += 1;
		maxInFlight = Math.max(maxInFlight, inFlight);
		await new Promise<void>((resolve) => resolvers.push(resolve));
		inFlight -= 1;
		return new Response(new Blob([url], { type: 'image/png' }));
	}) as any;

	try {
		const urls = ['blob:1', 'blob:2', 'blob:3', 'blob:4', 'blob:5', 'blob:6'];
		const promise = readBlobUrls(urls);

		await new Promise((r) => setTimeout(r, 10));
		expect(inFlight).toBe(4);
		expect(maxInFlight).toBe(4);

		while (resolvers.length > 0) {
			resolvers.shift()!();
			await new Promise((r) => setTimeout(r, 5));
		}

		const results = await promise;
		expect(maxInFlight).toBe(4);
		expect(results).toEqual(urls.map((u) => `data:image/png;base64,${btoa(u)}`));
	} finally {
		globalThis.fetch = originalFetch;
	}
});
