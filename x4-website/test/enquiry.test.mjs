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
	LEAD_OWNER_DYNAMICS: '11111111-1111-1111-1111-111111111111',
	LEAD_OWNER_MANAGED_IT: '22222222-2222-2222-2222-222222222222',
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
 * Replaces global fetch for the duration of one call and records what the
 * Worker asked for. `turnstile` and `dataverse` choose the stubbed outcomes.
 */
async function post(fields, env = CONFIGURED_ENV, options = {}) {
	const { turnstile = true, dataverse = { status: 204 } } = options;
	const calls = [];
	const realFetch = globalThis.fetch;

	globalThis.fetch = async (input, init = {}) => {
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
			return Response.json({ leadid: 'lead-guid' });
		}
		throw new Error(`unexpected outbound call to ${url}`);
	};

	try {
		const request = new Request('https://www.xfour.co.uk/api/enquiry', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Origin: 'https://www.xfour.co.uk',
				'CF-Connecting-IP': '203.0.113.7',
			},
			body: new URLSearchParams(fields),
		});
		const response = await worker.fetch(request, env, {});
		const body = await response.json();
		return { status: response.status, body, calls };
	} finally {
		globalThis.fetch = realFetch;
	}
}

function leadFrom(calls) {
	const call = calls.find((c) => c.url.includes('/api/data/v9.2/leads'));
	assert.ok(call, 'expected a Dataverse lead create');
	return JSON.parse(call.init.body);
}

test('Dynamics journey creates a lead with the right source, owner and answers', async () => {
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
	assert.equal(lead['ownerid@odata.bind'], '/systemusers(11111111-1111-1111-1111-111111111111)');
	assert.match(lead.description, /What they run today: Sales and a lot of spreadsheets/);
	assert.match(lead.description, /What is not working: Nobody trusts the forecast/);
	// Number of employees belongs to the Managed IT journey only.
	assert.equal(lead.numberofemployees, undefined);
});

test('Managed IT journey creates a lead with the other source, owner and the user count', async () => {
	const { status, body, calls } = await post(VALID_MANAGED_IT);

	assert.equal(status, 200);
	assert.deepEqual(body, { ok: true, journey: 'managed-it' });

	const lead = leadFrom(calls);
	assert.equal(lead.subject, 'Managed IT quote — Harvard Computation');
	assert.equal(lead.leadsourcecode, 100000002);
	assert.equal(lead['ownerid@odata.bind'], '/systemusers(22222222-2222-2222-2222-222222222222)');
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

test('lead source and owner are left off when the tenant values are not set yet', async () => {
	const env = {
		...CONFIGURED_ENV,
		LEAD_SOURCE_DYNAMICS: '',
		LEAD_OWNER_DYNAMICS: '',
	};
	const { status, calls } = await post(VALID_DYNAMICS, env);
	const lead = leadFrom(calls);

	assert.equal(status, 200);
	assert.equal(lead.leadsourcecode, undefined);
	assert.equal(lead['ownerid@odata.bind'], undefined);
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
