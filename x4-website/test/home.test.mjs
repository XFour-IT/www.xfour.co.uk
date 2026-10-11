/*
 * The home page has one job: send the visitor into one of the two journeys.
 *
 * These checks exist because the design fails in one specific, documented way
 * (plan section 1.1a rule 1): the two offers blend back into a list of service
 * cards, and then neither buyer recognises themself. That failure does not
 * look like a bug to whoever makes it, so it needs a test and not a note.
 *
 * Like the other suite here, these read ./dist -- the HTML the visitor is
 * actually served -- and `npm test` builds first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '../dist/index.html'), 'utf8');

/* Everything outside <main> is the shared nav and footer, which carry their own
   links to every page. Only the page's own content is under test. */
const main = html.match(/<main[^>]*>([\s\S]*)<\/main>/)[1];

const JOURNEYS = ['/dynamics-365', '/it-support'];

test('the home page offers exactly two doors', () => {
	/* `door` as a whole class, so door-kicker and door-points are not counted. */
	const cards = main.match(/class="[^"]*\bdoor["\s]/g) ?? [];
	assert.equal(cards.length, 2, `expected two doors, found ${cards.length}`);
});

test('one door leads to each journey', () => {
	for (const journey of JOURNEYS) {
		const links = main.match(new RegExp(`href="${journey}"`, 'g')) ?? [];
		assert.equal(links.length, 1, `expected one link to ${journey}, found ${links.length}`);
	}
});

test('the two doors have equal weight', () => {
	/* A primary button next to an outline button is how the page quietly picks a
	   favourite journey. Both calls to action must be the same control. */
	const buttons = main.match(/<a class="(btn[^"]*)"/g) ?? [];
	assert.equal(buttons.length, 2, `expected two calls to action, found ${buttons.length}`);
	assert.equal(buttons[0], buttons[1], 'the two doors are styled differently');
});

test('the home page is not a list of services', () => {
	/* Rule 1, and rule 8: /app-development is Journey A project work, so it may
	   be named as proof but it may not be a third door. The flat services list
	   is not a door either. */
	const doorTargets = (main.match(/<a class="btn[^"]*" href="([^"]*)"/g) ?? [])
		.map((tag) => tag.match(/href="([^"]*)"/)[1]);
	assert.deepEqual(doorTargets.sort(), [...JOURNEYS].sort(), 'something other than a journey is a door');
});

test('the home page has one heading and one band of proof', () => {
	const h1s = main.match(/<h1[\s>]/g) ?? [];
	assert.equal(h1s.length, 1, `expected one h1, found ${h1s.length}`);

	const proofBands = main.match(/class="[^"]*\bproof-band\b[^"]*"/g) ?? [];
	assert.equal(proofBands.length, 1, `expected one band of proof, found ${proofBands.length}`);
});

test('the home page asks for no images', () => {
	/* The routing page is the first paint most visitors get, so it carries a
	   text hero and no photograph. The 2.0s mobile LCP target in plan 1.4 does
	   not survive a 257 KB stock image above the fold. */
	assert.equal(main.match(/<img/g), null, 'the home page content has an image again');
	assert.equal(main.match(/background(-image)?:\s*url/g), null, 'the home page content loads a background image');
});
