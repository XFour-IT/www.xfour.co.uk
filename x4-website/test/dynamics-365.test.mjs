/*
 * The Journey A landing page (XFO-64).
 *
 * Two kinds of check live here, and both exist because of a documented way the
 * design fails rather than because of a bug anyone has seen:
 *
 *   1. The page must keep saying the three things the task asks for -- who it
 *      is for, what XFour does, and what it costs to start. Copy gets trimmed
 *      by whoever is in a hurry, and "what it costs" is always the first thing
 *      a nervous edit removes.
 *   2. The page must keep Journey A's language and must not drift into Journey
 *      B's (plan section 1.1a, rules 2 and 6). This buyer is national; the
 *      managed IT buyer is local and monthly. The moment one page talks about
 *      response times, cover hours or a price per user, neither buyer
 *      recognises themself -- which is the single failure mode the two-journey
 *      design has.
 *
 * Like the other suites here these read ./dist, the HTML the visitor is
 * actually served, and `npm test` builds first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '../dist');
const PUBLIC = join(here, '../public');

/* The path is fixed, not a preference: the home page (XFO-63) sends its
   Dynamics door to /dynamics-365, so the built file has to be this one. */
const PAGE = 'dynamics-365.html';

if (!existsSync(DIST)) {
    throw new Error('dist/ is missing. Run `npm run build` first, or use `npm test`, which builds for you.');
}

const html = readFileSync(join(DIST, PAGE), 'utf8');

/* Everything inside <main>: the page's own words, without the shared nav and
   footer. The journey-language checks below have to read this and not the
   whole document, or they would be testing the footer. */
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

test('the page the home page links to exists', () => {
    assert.ok(readdirSync(DIST).includes(PAGE), `${PAGE} is missing, so the home page Dynamics door 404s`);
});

test('it says who the page is for', () => {
    assert.match(main, /outgrown spreadsheets/i, 'the spreadsheets buyer is not addressed');
    assert.match(main, /on Microsoft and it does not work/i, 'the existing-Microsoft buyer is not addressed');
});

test('it says what XFour does, in this journey’s four words', () => {
    for (const word of ['Licence', 'Migration', 'Automation', 'Reporting']) {
        assert.match(main, new RegExp(word, 'i'), `${word} is missing from what we do`);
    }
});

test('it says what it costs to start', () => {
    /* £1,950 + VAT, three days: the price Ben set on 10 October 2026. A page
       that names no price is the failure this check exists for. */
    assert.match(main, /£1,950\s*\+\s*VAT/, 'the readiness check price is missing');
    assert.match(main, /No charge/i, 'the free scoping call is not priced');
    assert.match(main, /exclude VAT/i, 'the VAT position is not stated');
});

test('the one call to action is the Microsoft Bookings link, and it still works for a stranger', () => {
    const hrefs = main.match(/href="https:\/\/bookings\.cloud\.microsoft[^"]*"/g) || [];
    assert.ok(hrefs.length >= 1, 'the booking link is gone from the page');
    for (const href of hrefs) {
        assert.match(href, /anonymous/, '?anonymous is missing, so a stranger would be asked to sign in to Microsoft');
    }
    /* data-booking-link is what analytics.js counts a booked call by. */
    assert.match(main, /data-booking-link/, 'the booking link is not tagged for measurement');
});

test('there is no enquiry form on this page', () => {
    /* Rule 3: Journey A takes a booking, Journey B takes a form. A form here
       means the two journeys have been merged by someone being helpful. */
    assert.doesNotMatch(main, /<form/i, 'Journey A takes a booking, not a form');
});

test('it does not borrow Journey B’s language', () => {
    for (const phrase of [/response times?/i, /cover hours/i, /per user,? per month/i]) {
        assert.doesNotMatch(main, phrase, `managed IT language on a Dynamics page: ${phrase}`);
    }
});

test('it is not sold locally', () => {
    /* Rule 6: this buyer is national. A town on this page is Journey B
       tactics spent on a Journey A page. */
    for (const place of [/Reading/, /Thames Valley/i, /Berkshire/i]) {
        assert.doesNotMatch(main, place, `a place name on a national page: ${place}`);
    }
});

test('it publishes only the proof that is cleared', () => {
    /* XFO-43. Allseas, VisiMedia and Selwood Housing are named with
       permission. The travel loyalty client is not cleared, so it stays
       anonymous, and the 91% booking-time figure is our own estimate rather
       than a client result, so it is not published as one. */
    for (const name of ['Allseas Shipping Co', 'VisiMedia', 'Selwood Housing']) {
        assert.match(main, new RegExp(name), `${name} should be named here`);
    }
    assert.match(main, /A UK travel loyalty business/i, 'the anonymised client is missing');
    assert.doesNotMatch(main, /IAG/, 'the anonymised client has been named');
    assert.doesNotMatch(main, /91\s*%/, 'the 91% figure is our estimate, not a client result');
});

test('the page is reachable from every page, and is in the sitemap', () => {
    const sitemap = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /dynamics-365/, 'a page we want found is not in the sitemap');
    assert.match(html, /href="\/dynamics-365"/, 'the nav link to this journey is missing');
});

test('analytics tags this page as its own journey', () => {
    /* Bookings are the conversion for Journey A. If this page falls back to
       the 'other' journey, no report can tell this page's bookings from any
       other page's. */
    const analytics = readFileSync(join(PUBLIC, 'assets/js/analytics.js'), 'utf8');
    assert.match(analytics, /page === 'dynamics-365'/, 'the journey tag for this page is missing');
});
