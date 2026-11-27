/**
 * Guards wrangler.jsonc (XFO-1798).
 *
 * Two rules, and a build that breaks either one must fail:
 *   (a) only www.xfour.co.uk runs code that has the CRM key — so the
 *       production Worker has no workers.dev address and no preview URLs, and
 *       the preview Worker has no Dataverse config, no retry KV and no cron;
 *   (b) a preview cannot be indexed — so the preview Worker runs the Worker in
 *       front of every request, with the flag that makes it send noindex.
 *
 * Wrangler turns workers_dev and preview_urls ON when they are left out, so
 * "missing" is as wrong as "true".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Strips comments and trailing commas from JSONC. Leaves strings alone. */
function parseJsonc(text) {
	let out = '';
	let i = 0;
	while (i < text.length) {
		const two = text.slice(i, i + 2);
		if (text[i] === '"') {
			const start = i;
			i += 1;
			while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
			i += 1;
			out += text.slice(start, i);
		} else if (two === '//') {
			while (i < text.length && text[i] !== '\n') i += 1;
		} else if (two === '/*') {
			i = text.indexOf('*/', i) + 2;
		} else {
			out += text[i];
			i += 1;
		}
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const config = parseJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const preview = config.env && config.env.preview;

const PRODUCTION_ONLY_VARS = ['DATAVERSE_URL', 'ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID'];
const SECRET_NAMES = ['ENTRA_CLIENT_SECRET', 'TURNSTILE_SECRET_KEY', 'ALERT_WEBHOOK_URL'];

test('the production Worker has no workers.dev address and no preview URLs', () => {
	assert.equal(config.name, 'x4-website');
	assert.equal(config.workers_dev, false, 'workers_dev must be written out as false');
	assert.equal(config.preview_urls, false, 'preview_urls must be written out as false');
});

test('the production Worker is not marked as a preview', () => {
	assert.equal(config.vars.X4_PREVIEW, undefined);
	assert.notEqual(config.assets.run_worker_first, true);
});

test('previews are a separate Worker', () => {
	assert.ok(preview, 'expected env.preview in wrangler.jsonc');
	assert.equal(preview.name, 'x4-website-preview');
	assert.notEqual(preview.name, config.name);
});

test('the preview Worker has no Dataverse config, no secret, no KV and no cron', () => {
	for (const name of PRODUCTION_ONLY_VARS.concat(SECRET_NAMES)) {
		assert.equal(preview.vars[name], undefined, `${name} must not be set on the preview Worker`);
	}
	assert.deepEqual(preview.kv_namespaces, [], 'the preview must not bind ENQUIRY_RETRY_KV');
	// Wrangler carries `triggers` into an environment, so it has to be emptied here.
	assert.deepEqual(preview.triggers, { crons: [] });
	for (const kind of ['d1_databases', 'r2_buckets', 'services', 'durable_objects', 'queues']) {
		assert.equal(preview[kind], undefined, `the preview must not bind ${kind}`);
	}
});

test('the preview Worker sends noindex on every response', () => {
	assert.equal(preview.vars.X4_PREVIEW, '1');
	assert.equal(preview.assets.run_worker_first, true);
	assert.equal(preview.assets.binding, 'ASSETS');
});
