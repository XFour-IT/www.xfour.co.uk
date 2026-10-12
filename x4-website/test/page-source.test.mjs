/*
 * What a visitor sees in View Source, on every page of the site (XFO-96).
 *
 * Astro keeps frontmatter comments out of the build but ships HTML comments
 * exactly as they are written. Notes that explain a decision to the next
 * person who edits a file -- who set a price, when the business confirmed a
 * retention period, which ticket a change came from -- are useful in the
 * repository and are nobody's business on a public page, so they belong in
 * the frontmatter. Several of them went live in the page source before this
 * check covered the whole site: /dynamics-365, /app-development, /services
 * and the privacy policy all carried one.
 *
 * This reads ./dist, the output of `astro build`, so a note added through a
 * component or layout is caught too, not only one written in a page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '../dist');

if (!existsSync(DIST)) {
    throw new Error('dist/ is missing. Run `npm run build` first, or use `npm test`, which builds for you.');
}

function htmlFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(full);
        return entry.name.endsWith('.html') ? [full] : [];
    });
}

const pages = htmlFiles(DIST).map((path) => {
    const html = readFileSync(path, 'utf8');
    return {
        name: relative(DIST, path).split('\\').join('/'),
        comments: html.match(/<!--[\s\S]*?-->/g) ?? []
    };
});

/* The people who work here, as a comment would name them. A visitor should
   meet them on the About page, not in a note about why a number is what it
   is. */
const NAMES = /\b(Ben|Benji)\b/;

/* A date in a comment records when a decision was made inside the business.
   Dates a visitor is meant to read -- a policy's "last updated", for
   instance -- are page content, not comments. Short month names count:
   "7 Oct 2026" is how the /app-development note was written. */
const MONTH = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DATES = new RegExp(`\\b\\d{1,2}(st|nd|rd|th)? ${MONTH},? \\d{4}\\b|\\b${MONTH} \\d{1,2}(st|nd|rd|th)?,? \\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b`, 'i');

/* A ticket reference points at an internal decision, and tells a visitor
   which tracker we use and how far its numbers run. */
const TICKETS = /\bXFO-\d+\b/i;

test('every built page was found', () => {
    /* If the build moved its output, the loop below would pass on nothing. */
    for (const name of ['index.html', 'dynamics-365.html', 'app-development.html', 'services.html', 'legal/privacy.html']) {
        assert.ok(pages.some((page) => page.name === name), `${name} is not in dist/`);
    }
    assert.ok(pages.some((page) => page.comments.length > 0), 'no comments found at all, so this check proves nothing');
});

for (const page of pages) {
    test(`${page.name}: the page source carries no internal note`, () => {
        for (const comment of page.comments) {
            assert.doesNotMatch(comment, NAMES, `one of us is named in the page source of ${page.name}: ${comment}`);
            assert.doesNotMatch(comment, DATES, `an internal date is in the page source of ${page.name}: ${comment}`);
            assert.doesNotMatch(comment, TICKETS, `a ticket reference is in the page source of ${page.name}: ${comment}`);
        }
    });
}

/* Taking a note out of the HTML must not lose it. The frontmatter is where
   each one went, and frontmatter never reaches the browser. */
function frontmatter(page) {
    const source = readFileSync(join(here, '../src/pages', page), 'utf8');
    return source.slice(0, source.indexOf('---', 3));
}

test('the reason for the /dynamics-365 price is still written down, in the frontmatter', () => {
    const notes = frontmatter('dynamics-365.astro');
    assert.match(notes, /1,950/, 'the price is not explained anywhere in the frontmatter');
    assert.match(notes, NAMES, 'the frontmatter no longer records who set the price');
});

test('the /app-development mailbox condition is still written down, in the frontmatter', () => {
    const notes = frontmatter('app-development.astro');
    assert.match(notes, /hello@xfour\.co\.uk/, 'the mailbox the deploy condition is about is not named');
    assert.match(notes, /receiving mail before this page is deployed/, 'the deploy condition on the mailbox is lost');
    assert.match(notes, NAMES, 'the frontmatter no longer records who set the condition');
});

test('why the /services cards link where they do is still written down, in the frontmatter', () => {
    const notes = frontmatter('services.astro');
    assert.match(notes, /XFO-67/, 'the Managed IT card note is lost');
    assert.match(notes, /XFO-17/, 'the App & Prototype Development card note is lost');
});

test('the privacy policy retention decisions are still written down, in the frontmatter', () => {
    const notes = frontmatter('legal/privacy.astro');
    assert.match(notes, /11 October 2026 \(XFO-47\)/, 'the date the retention periods were confirmed is lost');
    assert.match(notes, /criterion rather than a number/, 'the reason website measurement has no fixed period is lost');
});
