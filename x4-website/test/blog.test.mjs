/*
 * The blog engine (XFO-93): the index, the post pages, the sitemap and the
 * RSS feed all have to agree on which posts are published.
 *
 * Like the other suites here, these read ./dist, the output of `astro
 * build`, and `npm test` builds first (see the pretest script).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '../dist');

if (!existsSync(DIST)) {
	throw new Error('dist/ is missing. Run `npm run build` first, or use `npm test`, which builds for you.');
}

// The nine pages that existed before the blog engine, plus /blog itself. Kept
// as a literal list, the same way the old hand-typed sitemap.xml was one, so
// this test does not just restate whatever the sitemap happens to contain.
const EXISTING_PAGES = [
	'/',
	'/about-us',
	'/dynamics-365',
	'/services',
	'/app-development',
	'/contact-us',
	'/legal/legal',
	'/legal/privacy',
	'/legal/cookies',
	'/blog',
];

// No real post has shipped yet -- the two sample posts were pulled before
// this PR could merge, because a merge would have put "Sample post: ..."
// pages live under Ben's byline where Google would index them. B1 (1
// November) is the first real post; add its path here once it ships so the
// order and per-post checks below start covering it.
const PUBLISHED_POSTS = [];

const blogIndex = readFileSync(join(DIST, 'blog.html'), 'utf8');

test('the index lists posts newest first', () => {
	const order = [...blogIndex.matchAll(/href="(\/blog\/[a-z0-9-]+)"/g)].map((m) => m[1]);
	assert.deepEqual(order, PUBLISHED_POSTS, 'no posts are published yet');
	assert.match(blogIndex, /No posts published yet\./);
});

test('the index excludes drafts', () => {
	assert.doesNotMatch(blogIndex, /draft-fixture/, 'the draft fixture post must not be listed');
});

test('the draft fixture gets no page at all', () => {
	assert.ok(!existsSync(join(DIST, 'blog/draft-fixture-not-yet-published.html')), 'a draft must not be built');
});

for (const path of PUBLISHED_POSTS) {
	test(`${path} has exactly one H1 and a canonical URL built from its own path`, () => {
		const html = readFileSync(join(DIST, `${path.slice(1)}.html`), 'utf8');

		const h1s = html.match(/<h1[\s>]/g) ?? [];
		assert.equal(h1s.length, 1, `expected exactly one H1, found ${h1s.length}`);

		const canonical = html.match(/<link rel="canonical" href="([^"]+)">/);
		assert.ok(canonical, 'no canonical link found');
		assert.equal(canonical[1], `https://www.xfour.co.uk${path}`);
	});
}

test('the sitemap contains every published post and all the existing pages', () => {
	const sitemapFiles = readdirSync(DIST).filter((name) => /^sitemap-\d+\.xml$/.test(name));
	assert.ok(sitemapFiles.length > 0, 'no sitemap-N.xml was generated');

	const locs = sitemapFiles
		.flatMap((name) => readFileSync(join(DIST, name), 'utf8').match(/<loc>([^<]+)<\/loc>/g) ?? [])
		.map((tag) => tag.replace(/<\/?loc>/g, '').replace('https://www.xfour.co.uk', '') || '/');

	for (const path of [...EXISTING_PAGES, ...PUBLISHED_POSTS]) {
		assert.ok(locs.includes(path), `${path} is missing from the sitemap`);
	}
	assert.ok(!locs.some((path) => path.includes('draft-fixture')), 'the draft fixture must not be in the sitemap');
	assert.ok(!locs.some((path) => path.includes('/blog/sample-')), 'no sample post must be in the sitemap');
});

test('the RSS feed parses and its item count matches the published post count', () => {
	const rss = readFileSync(join(DIST, 'blog/rss.xml'), 'utf8');

	assert.match(rss, /^<\?xml version="1.0" encoding="UTF-8"\?>/, 'not a well-formed XML document');
	assert.match(rss, /^<\?xml[\s\S]*<rss[^>]*>[\s\S]*<\/rss>\s*$/, 'the document is not one closed <rss> element');

	const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
	assert.equal(items.length, PUBLISHED_POSTS.length, `expected ${PUBLISHED_POSTS.length} items, found ${items.length}`);

	// Each item is itself well-formed: every required child tag opens once and
	// closes once, which `rss()` gets for free but a hand-edited feed would not.
	for (const item of items) {
		for (const tag of ['title', 'link', 'guid', 'description', 'pubDate']) {
			const opens = item.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? [];
			const closes = item.match(new RegExp(`</${tag}>`, 'g')) ?? [];
			assert.equal(opens.length, 1, `expected exactly one <${tag}> in the item, found ${opens.length}`);
			assert.equal(closes.length, 1, `expected exactly one </${tag}> in the item, found ${closes.length}`);
		}
	}

	assert.doesNotMatch(rss, /draft-fixture/, 'the draft fixture must not be in the feed');
	assert.doesNotMatch(rss, /\/blog\/sample-/, 'no sample post must be in the feed');
});
