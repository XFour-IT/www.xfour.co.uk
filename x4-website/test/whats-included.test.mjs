/*
 * /it-support/whats-included: every item in the managed IT price, with its
 * limit next to it.
 *
 * XFO-68: "Give a plain list. State the limits also. Do not hide the limits."
 * The way this page fails is not a broken build. It is somebody deciding the
 * limits read as negative and moving them into a footnote, or into an
 * accordion nobody opens, or off the page "until legal has looked at it".
 * These checks make that a red build instead of a quiet edit.
 *
 * Like the other suites here these read ./dist -- the HTML the visitor is
 * actually served -- and `npm test` builds first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '../dist');
const html = readFileSync(join(DIST, 'it-support/whats-included.html'), 'utf8');
const landing = readFileSync(join(DIST, 'it-support.html'), 'utf8');

// The sitemap is generated at build time (XFO-93), not a file in public/ any
// more, and @astrojs/sitemap can split it across more than one sitemap-N.xml.
function readSitemap() {
	return readdirSync(DIST)
		.filter((name) => /^sitemap-\d+\.xml$/.test(name))
		.map((name) => readFileSync(join(DIST, name), 'utf8'))
		.join('\n');
}

const mainOf = (page) => page.match(/<main[^>]*>([\s\S]*)<\/main>/)[1];
const main = mainOf(html);
const text = main.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* Each included item, as served: the item line and its limit line. */
const items = [...main.matchAll(/<li[^>]*>\s*<span class="included-item"[^>]*>([\s\S]*?)<\/span>\s*<span class="included-limit"[^>]*>([\s\S]*?)<\/span>/g)]
	.map(([, item, limit]) => ({
		item: item.replace(/<[^>]+>/g, '').trim(),
		limit: limit.replace(/<[^>]+>/g, '').replace(/^\s*Where it stops:\s*/, '').trim(),
	}));

test('the page is served at /it-support/whats-included', () => {
	assert.match(html, /<link rel="canonical" href="https:\/\/www\.xfour\.co\.uk\/it-support\/whats-included">/);
});

test('every included item states its limit, next to it', () => {
	/* The page's whole reason to exist. An item with an empty limit is the
	   first step towards a list with none. */
	assert.ok(items.length >= 15, `expected the full list of included items, found ${items.length}`);
	for (const { item, limit } of items) {
		assert.ok(limit.length > 10, `"${item}" has no limit stated`);
	}
	const itemLines = main.match(/class="included-item"/g)?.length ?? 0;
	assert.equal(itemLines, items.length, 'an included item has lost the limit that sat next to it');
});

test('the limits are not hidden', () => {
	/* "Do not hide the limits." No collapsed sections, no hidden text, no
	   small-print class on the limit. */
	assert.doesNotMatch(main, /<details[\s>]/, 'part of the list is collapsed');
	assert.doesNotMatch(main, /class="[^"]*\b(collapse|visually-hidden|d-none)\b/, 'part of the list is hidden');
	assert.doesNotMatch(main, /class="included-limit[^"]*\bsmall/, 'the limits have been turned into small print');
});

test('the page says what is not included', () => {
	assert.match(text, /Not included/);
	const list = main.match(/<ul class="not-covered"[^>]*>([\s\S]*?)<\/ul>/);
	assert.ok(list, 'the exclusions list is gone');
	const excluded = list[1].match(/<li[\s>]/g) ?? [];
	assert.ok(excluded.length >= 5, `expected the exclusions to be listed, found ${excluded.length}`);
});

test('the page states the contract terms and the price', () => {
	assert.match(text, /£\d+ per user, per month, \+ VAT/, 'the per-user price is gone');
	assert.match(text, /£\d+ per office, per month, \+ VAT/, 'the per-office fee is gone');
	assert.match(text, /Minimum \d+ users/, 'the minimum user count is gone');
	assert.match(text, /12 months/, 'the minimum term is gone');
	assert.match(text, /notice/, 'the notice period is gone');
	assert.match(text, /excluding bank holidays/, 'the cover hours do not say what they exclude');
});

test('it lists exactly what the landing page lists', () => {
	/* Both pages read src/data/managed-it.ts. This catches the day someone
	   "just quickly" types an item straight into one page and not the other. */
	const landingItems = [...mainOf(landing).matchAll(/<div class="covered-group[^"]*"[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/g)]
		.flatMap(([, list]) => [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(([, li]) => li.replace(/<[^>]+>/g, '').trim()));
	assert.deepEqual(items.map((i) => i.item), landingItems);
});

test('the call to action is a quote, not a booking', () => {
	assert.doesNotMatch(main, /data-booking-link/, 'a booking link has been added to Journey B');
	assert.doesNotMatch(main, /bookings\.cloud\.microsoft/, 'a Microsoft Bookings URL is on the page');
	assert.match(main, /id="quote"/, 'the quote section is gone');
});

test('the landing page links here', () => {
	assert.match(mainOf(landing), /href="\/it-support\/whats-included"/, '/it-support no longer links to the full list');
});

test('the page is in the sitemap', () => {
	const sitemap = readSitemap();
	assert.match(sitemap, /xfour\.co\.uk\/it-support\/whats-included</);
});
