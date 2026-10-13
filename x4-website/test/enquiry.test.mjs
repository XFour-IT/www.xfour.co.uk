/**
 * Tests for the enquiry endpoint.
 *
 *   cd x4-website && npm test
 *
 * These run the real Worker handler and stub only the three outbound calls it
 * makes — Turnstile, the Entra token endpoint and the Dataverse Web API — so
 * the thing under test is the actual request handling, validation and Lead
 * payload, not a copy of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';

const CONFIGURED_ENV = {
	DATAVERSE_URL: 'https://example.crm11.dynamics.com',
	ENTRA_TENANT_ID: 'tenant-id',
	ENTRA_CLIENT_ID: 'client-id',
	ENTRA_CLIENT_SECRET: 'client-secret',
	TURNSTILE_SECRET_KEY: 'turnstile-secret',
	TURNSTILE_SITE_KEY: '0xSITEKEY',
	LEAD_SOURCE_DYNAMICS: '100000001',
	LEAD_SOURCE_MANAGED_IT: '100000002',
	ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
};

const VALID_DYNAMICS = {
	journey: 'dynamics',
	name: 'Ada Lovelace',
	company: 'Analytical Engines Ltd',
	email: 'ada@example.com',
	current_stack: 'Sales and a lot of spreadsheets',
	pain: 'Nobody trusts the forecast',
	consent: 'yes',
	'cf-turnstile-response': 'token',
};

const VALID_MANAGED_IT = {
	journey: 'managed-it',
	name: 'Grace Hopper',
	company: 'Harvard Computation',
	email: 'grace@example.com',
	users: '42',
	devices: '55',
	current_provider: 'Nobody yet',
	cover: '24/7',
	consent: 'yes',
	'cf-turnstile-response': 'token',
};

/**
 * Builds a fetch stub that answers the three outbound calls the Worker makes
 * — Turnstile, the Entra token endpoint and the Dataverse Web API — plus any
 * `ALERT_WEBHOOK_URL` post, and records every call made through it.
 * `turnstile` and `dataverse` choose the stubbed outcomes.
 */
function stubOutboundFetch({ turnstile = true, dataverse = { status: 204 } } = {}) {
	const calls = [];
	const fetchImpl = async (input, init = {}) => {
		const url = typeof input === 'string' ? input : input.url;
		calls.push({ url, init });

		if (url.includes('challenges.cloudflare.com')) {
			return Response.json({ success: turnstile, 'error-codes': turnstile ? [] : ['invalid-input-response'] });
		}
		if (url.includes('login.microsoftonline.com')) {
			return Response.json({ access_token: 'stub-token', expires_in: 3600 });
		}
		if (url.includes('crm11.dynamics.com')) {
			if (dataverse.status >= 400) {
				return new Response('dataverse said no', { status: dataverse.status });
			}
			// What Dataverse really sends for a create without return=representation.
			return new Response(null, {
				status: 204,
				headers: { 'OData-EntityId': `${url}(33333333-3333-3333-3333-333333333333)` },
			});
		}
		if (url === 'https://alerts.example/webhook') {
			return new Response(null, { status: 200 });
		}
		if (url === 'https://alerts.example/unreachable') {
			throw new Error('getaddrinfo ENOTFOUND alerts.example');
		}
		throw new Error(`unexpected outbound call to ${url}`);
	};
	return { calls, fetchImpl };
}

/** Runs `fn` with global fetch replaced by `fetchImpl`, then always restores it. */
async function withStubbedFetch(fetchImpl, fn) {
	const realFetch = globalThis.fetch;
	globalThis.fetch = fetchImpl;
	try {
		return await fn();
	} finally {
		globalThis.fetch = realFetch;
	}
}

/**
 * An in-memory stand-in for a Cloudflare KV namespace: `put`/`get`/`delete`/
 * `list` with the same shapes the real binding returns, enough for the
 * Worker's retry code to run against in a test.
 */
function createFakeKV() {
	const store = new Map();
	return {
		async put(key, value) {
			store.set(key, value);
		},
		async get(key) {
			return store.has(key) ? store.get(key) : null;
		},
		async delete(key) {
			store.delete(key);
		},
		async list({ prefix = '' } = {}) {
			const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name }));
			return { keys, list_complete: true, cursor: undefined };
		},
		size() {
			return store.size;
		},
		_itemsForTest() {
			return store.values();
		},
	};
}

/**
 * Posts one enquiry. `turnstile` and `dataverse` choose the stubbed outcomes;
 * see `stubOutboundFetch`.
 */
async function post(fields, env = CONFIGURED_ENV, options = {}) {
	const { turnstile = true, dataverse = { status: 204 }, origin = 'https://www.xfour.co.uk' } = options;
	const { calls, fetchImpl } = stubOutboundFetch({ turnstile, dataverse });

	return withStubbedFetch(fetchImpl, async () => {
		const request = new Request('https://www.xfour.co.uk/api/enquiry', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Origin: origin,
				'CF-Connecting-IP': '203.0.113.7',
			},
			body: new URLSearchParams(fields),
		});
		const response = await worker.fetch(request, env, {});
		const body = await response.json();
		return { status: response.status, body, calls };
	});
}

function leadFrom(calls) {
	const call = calls.find((c) => c.url.includes('/api/data/v9.2/leads'));
	assert.ok(call, 'expected a Dataverse lead create');
	return JSON.parse(call.init.body);
}

test('Dynamics journey creates a lead with the right source and answers', async () => {
	const { status, body, calls } = await post(VALID_DYNAMICS);

	assert.equal(status, 200);
	assert.deepEqual(body, { ok: true, journey: 'dynamics' });

	const lead = leadFrom(calls);
	assert.equal(lead.subject, 'Dynamics 365 enquiry — Analytical Engines Ltd');
	assert.equal(lead.firstname, 'Ada');
	assert.equal(lead.lastname, 'Lovelace');
	assert.equal(lead.companyname, 'Analytical Engines Ltd');
	assert.equal(lead.emailaddress1, 'ada@example.com');
	assert.equal(lead.leadsourcecode, 100000001);
	assert.match(lead.description, /What they run today: Sales and a lot of spreadsheets/);
	assert.match(lead.description, /What is not working: Nobody trusts the forecast/);
	// Number of employees belongs to the Managed IT journey only.
	assert.equal(lead.numberofemployees, undefined);
});

test('the lead create never asks Dataverse to read the record back', async () => {
	// return=representation would need Read on the Lead after the flow has
	// handed it to Ben. The app user's role only has Read at user scope.
	const { status, calls } = await post(VALID_DYNAMICS);

	assert.equal(status, 200);
	const call = calls.find((c) => c.url.includes('/api/data/v9.2/leads'));
	assert.equal(call.init.headers.Prefer, undefined);
});

test('the lead create never names an owner', async () => {
	// Naming another owner makes Dataverse assign the new Lead, and the assign
	// checks Read on it across the business unit. That failed in production on
	// 12 Oct 2026. The flow gives the Lead to its owner instead.
	for (const form of [VALID_DYNAMICS, VALID_MANAGED_IT]) {
		const { status, calls } = await post(form);
		assert.equal(status, 200);
		const lead = leadFrom(calls);
		assert.deepEqual(
			Object.keys(lead).filter((key) => key.toLowerCase().startsWith('ownerid')),
			[],
		);
	}
});

test('Managed IT journey creates a lead with the other source and the user count', async () => {
	const { status, body, calls } = await post(VALID_MANAGED_IT);

	assert.equal(status, 200);
	assert.deepEqual(body, { ok: true, journey: 'managed-it' });

	const lead = leadFrom(calls);
	assert.equal(lead.subject, 'Managed IT quote — Harvard Computation');
	assert.equal(lead.leadsourcecode, 100000002);
	assert.equal(lead.numberofemployees, 42);
	assert.match(lead.description, /Number of users: 42/);
	assert.match(lead.description, /Number of devices: 55/);
	assert.match(lead.description, /Cover needed: 24\/7/);
});

test('the Turnstile token and the visitor IP are both sent for verification', async () => {
	const { calls } = await post(VALID_DYNAMICS);
	const call = calls.find((c) => c.url.includes('challenges.cloudflare.com'));
	assert.ok(call, 'expected a Turnstile verification');
	assert.equal(call.init.body.get('response'), 'token');
	assert.equal(call.init.body.get('remoteip'), '203.0.113.7');
});

test('a failed Turnstile check is rejected and never reaches Dataverse', async () => {
	const { status, body, calls } = await post(VALID_DYNAMICS, CONFIGURED_ENV, { turnstile: false });

	assert.equal(status, 403);
	assert.equal(body.error, 'captcha_failed');
	assert.equal(calls.filter((c) => c.url.includes('dynamics.com')).length, 0);
});

test('a missing Turnstile token is rejected', async () => {
	const fields = { ...VALID_DYNAMICS };
	delete fields['cf-turnstile-response'];
	const { status, body } = await post(fields);

	assert.equal(status, 400);
	assert.equal(body.error, 'captcha_missing');
});

test('a honeypot submission looks successful but writes nothing', async () => {
	const { status, body, calls } = await post({ ...VALID_DYNAMICS, website: 'http://spam.example' });

	assert.equal(status, 200);
	assert.deepEqual(body, { ok: true });
	assert.equal(calls.length, 0);
});

test('validation reports every bad field at once and stops before Turnstile', async () => {
	const { status, body, calls } = await post({
		journey: 'managed-it',
		name: 'Grace Hopper',
		email: 'not-an-email',
		users: '0',
		'cf-turnstile-response': 'token',
	});

	assert.equal(status, 422);
	assert.equal(body.error, 'validation_failed');
	assert.deepEqual(Object.keys(body.fields).sort(), [
		'company',
		'consent',
		'cover',
		'devices',
		'email',
		'users',
	]);
	assert.equal(calls.length, 0);
});

test('consent is required', async () => {
	const fields = { ...VALID_DYNAMICS };
	delete fields.consent;
	const { status, body } = await post(fields);

	assert.equal(status, 422);
	assert.ok(body.fields.consent);
});

test('an unknown journey is refused', async () => {
	const { status, body } = await post({ ...VALID_DYNAMICS, journey: 'something-else' });

	assert.equal(status, 400);
	assert.equal(body.error, 'unknown_journey');
});

test('a single-word name goes into lastname, which is the required field on Lead', async () => {
	const { calls } = await post({ ...VALID_DYNAMICS, name: 'Prince' });
	const lead = leadFrom(calls);

	assert.equal(lead.firstname, undefined);
	assert.equal(lead.lastname, 'Prince');
});

test('lead source is left off when the tenant value is not set yet', async () => {
	const env = {
		...CONFIGURED_ENV,
		LEAD_SOURCE_DYNAMICS: '',
	};
	const { status, calls } = await post(VALID_DYNAMICS, env);
	const lead = leadFrom(calls);

	assert.equal(status, 200);
	assert.equal(lead.leadsourcecode, undefined);
	// The journey is still recoverable from the subject and the description.
	assert.match(lead.subject, /^Dynamics 365 enquiry/);
	assert.match(lead.description, /Journey: Dynamics 365 \(dynamics\)/);
});

test('a trailing slash on DATAVERSE_URL does not produce a double slash', async () => {
	const env = { ...CONFIGURED_ENV, DATAVERSE_URL: 'https://example.crm11.dynamics.com/' };
	const { calls } = await post(VALID_DYNAMICS, env);
	const call = calls.find((c) => c.url.includes('/leads'));

	assert.equal(call.url, 'https://example.crm11.dynamics.com/api/data/v9.2/leads');
});

test('a Dataverse failure is reported as an error, not as a success', async () => {
	const { status, body } = await post(VALID_DYNAMICS, CONFIGURED_ENV, { dataverse: { status: 500 } });

	assert.equal(status, 502);
	assert.equal(body.error, 'crm_unavailable');
});

test('missing tenant configuration refuses the submission rather than dropping it', async () => {
	const env = { ...CONFIGURED_ENV, DATAVERSE_URL: '' };
	const { status, body } = await post(VALID_DYNAMICS, env);

	assert.equal(status, 503);
	assert.equal(body.error, 'not_configured');
});

test('a cross-site post is refused', async () => {
	const realFetch = globalThis.fetch;
	globalThis.fetch = async () => {
		throw new Error('no outbound call expected');
	};
	try {
		const request = new Request('https://www.xfour.co.uk/api/enquiry', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' },
			body: new URLSearchParams(VALID_DYNAMICS),
		});
		const response = await worker.fetch(request, CONFIGURED_ENV, {});
		assert.equal(response.status, 403);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('a post from a Worker preview URL is accepted', async () => {
	// Workers Builds uploads a version per branch push, each on its own
	// <prefix>-x4-website.xfour.workers.dev host. The prefix changes every time,
	// so the suffix has to be allowed or no preview can ever be tested.
	const { status, calls } = await post(VALID_DYNAMICS, CONFIGURED_ENV, {
		origin: 'https://f0c50bb8-x4-website.xfour.workers.dev',
	});
	assert.equal(status, 200);
	assert.ok(
		calls.some((c) => c.url.includes('/api/data/v9.2/leads')),
		'expected the preview post to reach Dataverse',
	);
});

test('a host that only looks like our preview subdomain is refused', async () => {
	const realFetch = globalThis.fetch;
	globalThis.fetch = async () => {
		throw new Error('no outbound call expected');
	};
	try {
		const request = new Request('https://www.xfour.co.uk/api/enquiry', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Origin: 'https://notxfour.workers.dev',
			},
			body: new URLSearchParams(VALID_DYNAMICS),
		});
		const response = await worker.fetch(request, CONFIGURED_ENV, {});
		assert.equal(response.status, 403);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('every other path is handed back to the static asset server', async () => {
	let asked = null;
	const env = {
		...CONFIGURED_ENV,
		ASSETS: {
			fetch: async (request) => {
				asked = request.url;
				return new Response('the page', { status: 200 });
			},
		},
	};

	const response = await worker.fetch(new Request('https://www.xfour.co.uk/contact-us'), env, {});

	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'the page');
	assert.equal(asked, 'https://www.xfour.co.uk/contact-us');
});

test('the browser can read the Turnstile site key from the config route', async () => {
	const response = await worker.fetch(
		new Request('https://www.xfour.co.uk/api/form-config'),
		CONFIGURED_ENV,
		{},
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { turnstileSiteKey: '0xSITEKEY' });
});

/* -------------------------------------------------------------------------- */
/* Retry (XFO-72)                                                             */
/* -------------------------------------------------------------------------- */

test('a successful inline create never touches the retry KV', async () => {
	const kv = createFakeKV();
	const env = { ...CONFIGURED_ENV, ENQUIRY_RETRY_KV: kv };

	const { status } = await post(VALID_DYNAMICS, env);

	assert.equal(status, 200);
	assert.equal(kv.size(), 0);
});

test('a Dataverse failure keeps the submission in the retry KV instead of losing it', async () => {
	const kv = createFakeKV();
	const env = { ...CONFIGURED_ENV, ENQUIRY_RETRY_KV: kv };

	const { status, body } = await post(VALID_DYNAMICS, env, { dataverse: { status: 500 } });

	// The visitor still sees today's error — this is about not losing the
	// enquiry behind the scenes, not about changing what they are told.
	assert.equal(status, 502);
	assert.equal(body.error, 'crm_unavailable');
	assert.equal(kv.size(), 1);

	const [raw] = [...kv._itemsForTest()];
	const record = JSON.parse(raw);
	assert.equal(record.journeyKey, 'dynamics');
	assert.equal(record.lead.companyname, 'Analytical Engines Ltd');
	assert.equal(record.attempts, 0);
});

test('the scheduled retry creates the Lead that the inline attempt lost, and exactly one', async () => {
	const kv = createFakeKV();
	const env = { ...CONFIGURED_ENV, ENQUIRY_RETRY_KV: kv };

	// The inline attempt fails — Dataverse is down — and the submission is
	// held rather than lost.
	const { status: firstStatus } = await post(VALID_DYNAMICS, env, { dataverse: { status: 500 } });
	assert.equal(firstStatus, 502);
	assert.equal(kv.size(), 1);

	// Dataverse recovers. The Cron Trigger fires and retries what is in KV.
	const { calls, fetchImpl } = stubOutboundFetch({ dataverse: { status: 204 } });
	await withStubbedFetch(fetchImpl, () => worker.scheduled({}, env, {}));

	assert.equal(calls.filter((c) => c.url.includes('/api/data/v9.2/leads')).length, 1, 'expected exactly one Lead create');
	assert.equal(kv.size(), 0, 'the retried entry is cleared once its Lead exists');

	// A second retry pass — a redelivered Cron tick, or a re-run before the
	// next schedule — must create nothing a second time: there is nothing
	// left in KV to retry.
	const { calls: secondCalls, fetchImpl: secondFetchImpl } = stubOutboundFetch({ dataverse: { status: 204 } });
	await withStubbedFetch(secondFetchImpl, () => worker.scheduled({}, env, {}));

	assert.equal(secondCalls.filter((c) => c.url.includes('/api/data/v9.2/leads')).length, 0, 'expected no second Lead create');
});

test('a retry that still fails keeps the entry in KV and counts the attempt', async () => {
	const kv = createFakeKV();
	const env = { ...CONFIGURED_ENV, ENQUIRY_RETRY_KV: kv };

	await post(VALID_DYNAMICS, env, { dataverse: { status: 500 } });
	assert.equal(kv.size(), 1);

	const { fetchImpl } = stubOutboundFetch({ dataverse: { status: 500 } });
	await withStubbedFetch(fetchImpl, () => worker.scheduled({}, env, {}));

	assert.equal(kv.size(), 1, 'a still-failing retry must not drop the enquiry');
	const [raw] = [...kv._itemsForTest()];
	assert.equal(JSON.parse(raw).attempts, 1);
});

test('a retry run with nothing configured yet leaves the retry KV alone', async () => {
	const kv = createFakeKV();
	const env = { ...CONFIGURED_ENV, ENQUIRY_RETRY_KV: kv };

	await post(VALID_DYNAMICS, env, { dataverse: { status: 500 } });
	assert.equal(kv.size(), 1);

	const unconfiguredEnv = { ...env, DATAVERSE_URL: '' };
	const result = await worker.scheduled({}, unconfiguredEnv, {});

	assert.deepEqual(result, { attempted: 0, created: 0 });
	assert.equal(kv.size(), 1, 'the enquiry must still be waiting once the tenant is configured');
});

test('without an ENQUIRY_RETRY_KV binding, the enquiry endpoint still works as before', async () => {
	// No ENQUIRY_RETRY_KV on this env at all — the binding has to be added to
	// wrangler.jsonc and deployed before it exists.
	const { status, body } = await post(VALID_DYNAMICS, CONFIGURED_ENV);
	assert.equal(status, 200);
	assert.deepEqual(body, { ok: true, journey: 'dynamics' });
});

/* -------------------------------------------------------------------------- */
/* Alerting (XFO-72)                                                         */
/* -------------------------------------------------------------------------- */

test('a Dataverse failure posts to the alert webhook when one is configured', async () => {
	const env = { ...CONFIGURED_ENV, ALERT_WEBHOOK_URL: 'https://alerts.example/webhook' };

	const { calls } = await post(VALID_DYNAMICS, env, { dataverse: { status: 500 } });

	const alert = calls.find((c) => c.url === 'https://alerts.example/webhook');
	assert.ok(alert, 'expected a webhook post');
	const payload = JSON.parse(alert.init.body);
	assert.match(payload.text, /enquiry_dataverse_failed/);
	assert.match(payload.text, /journey=dynamics/);
});

test('no ALERT_WEBHOOK_URL means no webhook call, same as today', async () => {
	const { calls } = await post(VALID_DYNAMICS, CONFIGURED_ENV, { dataverse: { status: 500 } });
	assert.equal(calls.filter((c) => c.url.startsWith('https://alerts.example')).length, 0);
});

test('a webhook that cannot be reached does not turn a reported failure into a 500', async () => {
	const env = { ...CONFIGURED_ENV, ALERT_WEBHOOK_URL: 'https://alerts.example/unreachable' };

	const { status, body } = await post(VALID_DYNAMICS, env, { dataverse: { status: 500 } });

	assert.equal(status, 502);
	assert.equal(body.error, 'crm_unavailable');
});
