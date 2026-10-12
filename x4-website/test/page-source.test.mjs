/*
 * What a visitor sees in View Source, on every built page (XFO-64, XFO-96).
 *
 * Astro keeps frontmatter comments out of the build but ships HTML comments
 * exactly as they are written. The price block on /dynamics-365 carried a note
 * saying who set the £1,950 price and when, and that note went live in the
 * page source on 12 October 2026. /app-development, the privacy policy and
 * /services carried the same kind of note. Notes of that kind explain a
 * decision to the next person who edits the file, which is useful in the
 * repository and is nobody's business on a public page, so they belong in the
 * frontmatter.
 *
 * This reads every .html file in ./dist, so a new page is covered the moment
 * it is built. `npm test` builds first (see the pretest script).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '../dist');
const PAGES = join(here, '../src/pages');

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

/* A written-out date in a comment records when a decision was made inside the
   business. "7 Oct 2026" counts as much as "7 October 2026". Dates a visitor
   is meant to read -- a policy's "last updated", for instance -- are page
   content, not comments. */
const DATES = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{4}\b|\b\d{4}-\d{2}-\d{2}\b/;

/* A task reference points at the internal record of a decision. The record is
   ours; the page source is the visitor's. */
const TASKS = /\bXFO-\d+\b/;

function frontmatter(page) {
    const source = readFileSync(join(PAGES, page), 'utf8');
    return source.slice(0, source.indexOf('---', 3));
}

test('the check has pages and comments to read', () => {
    /* If the build moves or the pattern breaks, every page below passes with
       nothing checked. These keep that from looking like a clean result. */
    assert.ok(pages.length >= 10, `only ${pages.length} built pages found in dist/`);
    assert.ok(pages.some((page) => page.comments.length > 0), 'no comments found on any page, so this check proves nothing');
});

for (const page of pages) {
    test(`${page.name}: the page source carries no internal note`, () => {
        for (const comment of page.comments) {
            assert.doesNotMatch(comment, NAMES, `one of us is named in the page source: ${comment}`);
            assert.doesNotMatch(comment, DATES, `an internal date is in the page source: ${comment}`);
            assert.doesNotMatch(comment, TASKS, `an internal task reference is in the page source: ${comment}`);
        }
    });
}

/* Taking a note out of the HTML must not lose it. The frontmatter is where
   each one went, and frontmatter never reaches the browser. */

test('the reason for the /dynamics-365 price is still written down, in the frontmatter', () => {
    const notes = frontmatter('dynamics-365.astro');

    assert.match(notes, /1,950/, 'the price is not explained anywhere in the frontmatter');
    assert.match(notes, NAMES, 'the frontmatter no longer records who set the price');
});

test('the /app-development email condition is still written down, in the frontmatter', () => {
    const notes = frontmatter('app-development.astro');

    assert.match(notes, /hello@xfour\.co\.uk must/, 'the email condition is not in the frontmatter');
    assert.match(notes, NAMES, 'the frontmatter no longer records who set the condition');
});

test('the privacy policy retention decisions are still written down, in the frontmatter', () => {
    const notes = frontmatter('legal/privacy.astro');

    assert.match(notes, /XFO-47/, 'the frontmatter no longer records where the retention periods were confirmed');
    assert.match(notes, /24 months/, 'the non-customer retention period is not explained in the frontmatter');
    assert.match(notes, /PostHog/, 'the reason website measurement has no fixed period is not in the frontmatter');
});

test('the /services card decisions are still written down, in the frontmatter', () => {
    const notes = frontmatter('services.astro');

    assert.match(notes, /XFO-67/, 'the Managed IT card no longer explains why it links to /it-support');
    assert.match(notes, /XFO-17/, 'the App Development card no longer explains where its copy came from');
});
