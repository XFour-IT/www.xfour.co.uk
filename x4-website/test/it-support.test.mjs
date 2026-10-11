/*
 * The managed IT landing page has three jobs, and one forbidden shortcut.
 *
 * XFO-67: this buyer is a small Thames Valley business with no IT person, and
 * they are part way through comparing providers. They came for what is
 * covered, how fast somebody answers, and the price per user per month. If any
 * one of the three is missing the page does not do its job -- and the way that
 * happens is not a bug anybody notices, it is a paragraph someone rewrites and
 * a figure someone pulls out "until it is confirmed".
 *
 * The forbidden shortcut is a booking link. /app-development converts on one,
 * so it is the obvious thing to paste in here, and it is wrong for this buyer:
 * a stranger comparing IT providers will not give up half an hour before they
 * know roughly what it costs (plan section 1.1a rule 3).
 *
 * Like the other suites here these read ./dist -- the HTML the visitor is
 * actually served -- and `npm test` builds first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '../dist/it-support.html'), 'utf8');

/* Everything outside <main> is the shared nav and footer. Only the page's own
   content is under test. */
const main = html.match(/<main[^>]*>([\s\S]*)<\/main>/)[1];
const text = main.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the page is served at /it-support', () => {
	/* The home page's managed IT door points at this exact path, so the slug is
	   fixed. Renaming the file moves the URL silently and 404s the door. */
	assert.match(html, /<link rel="canonical" href="https:\/\/www\.xfour\.co\.uk\/it-support">/);
});

test('the page says what is covered', () => {
	assert.match(text, /What is covered/i, 'the covered section is gone');
	/* The six groups the price covers. A page that keeps the heading but loses
	   the list is the failure this catches. */
	const groups = main.match(/class="covered-group[^"]*"/g) ?? [];
	assert.ok(groups.length >= 5, `expected the groups of covered work, found ${groups.length}`);
});

test('the page also says what is not covered', () => {
	/* Every provider this buyer is comparing has exclusions. Naming ours is the
	   cheapest trust we can buy, and the first thing cut by someone tidying. */
	assert.match(text, /What is not covered/i, 'the exclusions are gone');
	const list = main.match(/<ul class="not-covered"[^>]*>([\s\S]*?)<\/ul>/);
	assert.ok(list, 'the exclusions list is gone');
	const items = list[1].match(/<li[\s>]/g) ?? [];
	assert.ok(items.length >= 4, `expected the exclusions to be listed, found ${items.length}`);
});

test('the page commits to response times in figures', () => {
	assert.match(text, /How fast we answer/i, 'the response-time section is gone');
	/* A table of priorities with no times in it is a description of a process,
	   not a commitment. Require real figures. */
	const figures = main.match(/class="response-figure"/g) ?? [];
	assert.ok(figures.length >= 3, `expected a time against each priority, found ${figures.length}`);
	assert.match(text, /\d+ working (hour|day)/i, 'no response time is stated as a number');
	assert.match(text, /Cover hours:/i, 'the cover hours are not stated');
});

test('the page states a price per user per month', () => {
	/* The one figure this buyer came for. "Contact us for pricing" is the
	   failure mode, and it is always argued for by somebody reasonable. */
	assert.match(text, /£\d/, 'there is no price on the page');
	assert.match(text, /per user, per month/i, 'the price is not stated per user per month');
	assert.match(text, /\+ VAT/, 'the price does not say whether VAT is included');
});

test('the call to action is a quote, not a booking', () => {
	/* data-booking-link is how the Microsoft Bookings link is marked on the
	   pages that legitimately use it. It may not appear here. */
	assert.doesNotMatch(main, /data-booking-link/, 'a booking link has been added to Journey B');
	assert.doesNotMatch(main, /bookings\.cloud\.microsoft/, 'a Microsoft Bookings URL is on the page');
	assert.match(main, /id="quote"/, 'the quote section is gone');
	assert.match(text, /Get a price/i, 'nothing on the page offers a price');
});

test('the page says it is local', () => {
	/* Proximity is the whole argument for Journey B. A page that could have been
	   written by a national help desk has lost its only advantage. */
	assert.match(text, /Thames Valley/i, 'the region is not named');
	assert.match(text, /Reading/i, 'the town is not named');
});

test('the page is in the sitemap', () => {
	const sitemap = readFileSync(join(here, '../public/sitemap.xml'), 'utf8');
	assert.match(sitemap, /xfour\.co\.uk\/it-support</, 'a local landing page that search cannot find');
});
