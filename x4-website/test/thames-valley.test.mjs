/*
 * /it-support/thames-valley: the local page for Journey B.
 *
 * XFO-68, and plan section 1.1a rule 6: Journey B is local ("IT support
 * Reading"), Journey A is national. Local search terms help Journey B only.
 * So this suite checks two things: that the local page really is local, and
 * that none of it leaks onto the Journey A pages.
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
const read = (file) => readFileSync(join(DIST, file), 'utf8');
const mainOf = (page) => page.match(/<main[^>]*>([\s\S]*)<\/main>/)[1];

// The sitemap is generated at build time (XFO-93), not a file in public/ any
// more, and @astrojs/sitemap can split it across more than one sitemap-N.xml.
function readSitemap() {
	return readdirSync(DIST)
		.filter((name) => /^sitemap-\d+\.xml$/.test(name))
		.map((name) => readFileSync(join(DIST, name), 'utf8'))
		.join('\n');
}

const html = read('it-support/thames-valley.html');
const main = mainOf(html);
const text = main.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* The Journey A pages. Rule 8 puts /app-development inside Journey A. */
const JOURNEY_A = ['dynamics-365.html', 'app-development.html'];

test('the page is served at /it-support/thames-valley', () => {
	assert.match(html, /<link rel="canonical" href="https:\/\/www\.xfour\.co\.uk\/it-support\/thames-valley">/);
});

test('the title and heading carry the local search terms', () => {
	const title = html.match(/<title>([^<]*)<\/title>/)[1];
	assert.match(title, /IT Support in Reading/i, 'the title has lost "IT support Reading"');
	assert.match(title, /Thames Valley/i);
	const h1 = main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
	assert.match(h1, /IT support in Reading/i, 'the heading has lost "IT support in Reading"');
});

test('the page names the towns it covers', () => {
	for (const town of ['Reading', 'Wokingham', 'Bracknell', 'Newbury', 'Maidenhead', 'Slough']) {
		assert.match(text, new RegExp(`IT support in ${town}`), `${town} is not on the local page`);
	}
});

test('the page carries LocalBusiness structured data', () => {
	const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
	assert.ok(block, 'the structured data is gone');
	const data = JSON.parse(block[1]);
	assert.equal(data['@type'], 'ProfessionalService');
	assert.equal(data.address.addressLocality, 'Reading');
	assert.ok(data.areaServed.length >= 6, 'the area served is not listed');
	assert.equal(data.telephone, '+44 118 370 2920');
});

test('the page states the price and the travel terms', () => {
	assert.match(text, /£\d+ per user/, 'the price is gone');
	assert.match(text, /no call-out charge/i, 'the travel terms are gone');
});

test('the call to action is a quote, not a booking', () => {
	assert.doesNotMatch(main, /data-booking-link/, 'a booking link has been added to Journey B');
	assert.doesNotMatch(main, /bookings\.cloud\.microsoft/, 'a Microsoft Bookings URL is on the page');
	assert.match(main, /id="quote"/, 'the quote section is gone');
});

test('the landing page links here', () => {
	assert.match(mainOf(read('it-support.html')), /href="\/it-support\/thames-valley"/);
});

test('no Journey A page uses the local page or its search terms', () => {
	/* Rule 6. The pull to "add a line about being in Reading" to the Dynamics
	   page is strong and always well meant. It mixes the two buyers and
	   spends a local tactic on a national search. */
	for (const file of JOURNEY_A) {
		const page = mainOf(read(file));
		assert.doesNotMatch(page, /href="\/it-support\/thames-valley"/, `${file} links to the local page`);
		assert.doesNotMatch(page, /IT support (in )?Reading/i, `${file} uses the local search term`);
		assert.doesNotMatch(page, /Thames Valley/i, `${file} names the Thames Valley`);
		assert.doesNotMatch(read(file), /application\/ld\+json[\s\S]*?(LocalBusiness|ProfessionalService)/, `${file} carries local structured data`);
	}
});

test('the page is in the sitemap', () => {
	const sitemap = readSitemap();
	assert.match(sitemap, /xfour\.co\.uk\/it-support\/thames-valley</);
});
