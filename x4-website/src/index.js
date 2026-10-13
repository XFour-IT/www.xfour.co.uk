/**
 * XFour website Worker.
 *
 * The site is static HTML served from ./public. The only dynamic route is
 * POST /api/enquiry, which turns an enquiry form into a Lead in the XFour
 * Dynamics 365 tenant.
 *
 * Everything else is handed straight back to the static asset server, which
 * keeps the existing not_found_handling / html_handling behaviour.
 *
 * Configuration lives in wrangler.jsonc (vars) and in Worker secrets. See
 * docs/lead-forms.md for the runbook. If the Dataverse vars are not set the
 * endpoint returns 503 and refuses to pretend it worked.
 *
 * A validated submission is written to the ENQUIRY_RETRY_KV namespace before
 * the Dataverse call (XFO-72), so a failed create — Dynamics down, a refused
 * token, an expired client secret — does not lose the enquiry. The scheduled
 * handler below retries everything still in KV on the Cron Trigger in
 * wrangler.jsonc, and removes an entry the moment its Lead exists, so a
 * redelivered or repeated retry run never creates the same Lead twice.
 */

/** Journeys the form endpoint accepts, and the shape each one must have. */
const JOURNEYS = {
	dynamics: {
		label: 'Dynamics 365',
		leadSourceVar: 'LEAD_SOURCE_DYNAMICS',
		subject: (company) => `Dynamics 365 enquiry — ${company}`,
		fields: [
			{ name: 'current_stack', label: 'What they run today', required: true, max: 1000 },
			{ name: 'pain', label: 'What is not working', required: true, max: 2000 },
		],
	},
	'managed-it': {
		label: 'Managed IT',
		leadSourceVar: 'LEAD_SOURCE_MANAGED_IT',
		subject: (company) => `Managed IT quote — ${company}`,
		fields: [
			{ name: 'users', label: 'Number of users', required: true, integer: true, min: 1, max: 10000 },
			{ name: 'devices', label: 'Number of devices', required: true, integer: true, min: 1, max: 20000 },
			{ name: 'current_provider', label: 'Current provider', required: false, max: 100 },
			{ name: 'cover', label: 'Cover needed', required: true, max: 100 },
		],
	},
};

/** Fields every journey asks for. */
const COMMON_FIELDS = [
	{ name: 'name', label: 'Name', required: true, max: 100 },
	{ name: 'company', label: 'Company', required: true, max: 100 },
	{ name: 'email', label: 'Email', required: true, max: 120, email: true },
];

/** Origins allowed to post to the endpoint. Anything else is a cross-site post. */
const ALLOWED_ORIGIN_HOSTS = ['www.xfour.co.uk', 'xfour.co.uk', 'localhost', '127.0.0.1'];

/**
 * Every preview of this Worker is served from the account's own workers.dev
 * subdomain, which is `xfour`. Workers Builds uploads a version for each push
 * to a branch, and each version gets its own hostname there with a prefix that
 * changes every time, so the suffix is matched instead of listing hostnames.
 * Nobody else can create a host under it, because the subdomain is ours.
 */
const ALLOWED_ORIGIN_SUFFIX = '.xfour.workers.dev';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// The browser asks for the Turnstile site key here rather than having it
		// baked into the HTML, so all form configuration lives in one place.
		if (url.pathname === '/api/form-config') {
			if (request.method !== 'GET') {
				return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'GET' });
			}
			return json(
				{ turnstileSiteKey: str(env.TURNSTILE_SITE_KEY) },
				200,
				{ 'Cache-Control': 'public, max-age=300' },
			);
		}

		if (url.pathname === '/api/enquiry') {
			if (request.method !== 'POST') {
				return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });
			}
			try {
				return await handleEnquiry(request, env, ctx);
			} catch (err) {
				// Never leak internals to the browser. Observability is on, so the
				// detail is in the Worker logs.
				console.error('enquiry_unhandled_error', err && err.stack ? err.stack : String(err));
				return json({ ok: false, error: 'server_error' }, 500);
			}
		}

		return env.ASSETS.fetch(request);
	},

	// Cron Trigger (see wrangler.jsonc). Retries every enquiry still sitting in
	// ENQUIRY_RETRY_KV because its inline Dataverse create failed.
	async scheduled(event, env, ctx) {
		return await retryPendingEnquiries(env);
	},
};

async function handleEnquiry(request, env, ctx) {
	if (!originAllowed(request)) {
		return json({ ok: false, error: 'bad_origin' }, 403);
	}

	const form = await readBody(request);
	if (!form) {
		return json({ ok: false, error: 'bad_request' }, 400);
	}

	// Honeypot. A real person never sees this field, so anything in it is a bot.
	// Answer 200 so the bot has nothing to learn from the response.
	if (str(form.get('website'))) {
		console.log('enquiry_honeypot_tripped');
		return json({ ok: true });
	}

	const journeyKey = str(form.get('journey'));
	const journey = JOURNEYS[journeyKey];
	if (!journey) {
		return json({ ok: false, error: 'unknown_journey' }, 400);
	}

	const { values, errors } = validate(form, COMMON_FIELDS.concat(journey.fields));
	if (!str(form.get('consent'))) {
		errors.consent = 'Please confirm you are happy for us to reply.';
	}
	if (Object.keys(errors).length > 0) {
		return json({ ok: false, error: 'validation_failed', fields: errors }, 422);
	}

	const turnstile = await verifyTurnstile(request, env, str(form.get('cf-turnstile-response')));
	if (!turnstile.ok) {
		return json({ ok: false, error: turnstile.error }, turnstile.status);
	}

	const config = dataverseConfig(env);
	if (!config.ok) {
		console.error('enquiry_not_configured', config.missing.join(','));
		return json({ ok: false, error: 'not_configured' }, 503);
	}

	const lead = buildLead(journeyKey, journey, values, env);

	// Durable before the Dataverse call, not after, so a crash or a timeout
	// between the two can only mean a harmless unused retry record rather than
	// a lost lead.
	const submissionId = crypto.randomUUID();
	await putRetryRecord(env, submissionId, { journeyKey, lead, attempts: 0, createdAt: new Date().toISOString() });

	const created = await createLead(config.value, lead, env);
	if (!created.ok) {
		await reportDataverseFailure(env, created, journeyKey);
		// The record stays in ENQUIRY_RETRY_KV. The Cron Trigger retries it, so
		// the enquiry survives even though this request answers an error.
		return json({ ok: false, error: 'crm_unavailable' }, 502);
	}

	await deleteRetryRecord(env, submissionId);
	console.log('enquiry_lead_created', JSON.stringify({ journey: journeyKey, leadid: created.leadid }));
	return json({ ok: true, journey: journeyKey });
}

/* -------------------------------------------------------------------------- */
/* Retry (XFO-72)                                                             */
/* -------------------------------------------------------------------------- */

const RETRY_KEY_PREFIX = 'enquiry:';

function retryKey(submissionId) {
	return `${RETRY_KEY_PREFIX}${submissionId}`;
}

async function putRetryRecord(env, submissionId, record) {
	if (!env.ENQUIRY_RETRY_KV) return; // Not bound yet — see docs/lead-forms.md.
	await env.ENQUIRY_RETRY_KV.put(retryKey(submissionId), JSON.stringify(record));
}

async function deleteRetryRecord(env, submissionId) {
	if (!env.ENQUIRY_RETRY_KV) return;
	await env.ENQUIRY_RETRY_KV.delete(retryKey(submissionId));
}

/**
 * Retries every enquiry still waiting in ENQUIRY_RETRY_KV. An entry is
 * deleted the instant its Lead exists in Dataverse, so running this twice in
 * a row — a redelivered Cron tick, or a manual re-run — finds nothing left
 * for an entry already retried and creates no second Lead for it.
 */
async function retryPendingEnquiries(env) {
	if (!env.ENQUIRY_RETRY_KV) return { attempted: 0, created: 0 };

	const config = dataverseConfig(env);
	if (!config.ok) {
		// Same reason the endpoint itself 503s: do not spend retries against a
		// tenant that is not configured yet.
		return { attempted: 0, created: 0 };
	}

	let attempted = 0;
	let created = 0;
	let cursor;

	do {
		const page = await env.ENQUIRY_RETRY_KV.list({ prefix: RETRY_KEY_PREFIX, cursor });
		for (const { name } of page.keys) {
			const raw = await env.ENQUIRY_RETRY_KV.get(name);
			if (!raw) continue; // Already cleared by an earlier run in this same pass.
			attempted += 1;

			const record = JSON.parse(raw);
			const result = await createLead(config.value, record.lead, env);

			if (result.ok) {
				await env.ENQUIRY_RETRY_KV.delete(name);
				created += 1;
				console.log(
					'enquiry_lead_created_on_retry',
					JSON.stringify({ journey: record.journeyKey, leadid: result.leadid, attempts: record.attempts + 1 }),
				);
				continue;
			}

			record.attempts += 1;
			record.lastFailedAt = new Date().toISOString();
			await env.ENQUIRY_RETRY_KV.put(name, JSON.stringify(record));
			await reportDataverseFailure(env, result, record.journeyKey);
		}
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);

	return { attempted, created };
}

/* -------------------------------------------------------------------------- */
/* Alerting                                                                   */
/* -------------------------------------------------------------------------- */

async function reportDataverseFailure(env, created, journeyKey) {
	console.error('enquiry_dataverse_failed', created.status, created.detail);
	await sendAlert(
		env,
		`enquiry_dataverse_failed: journey=${journeyKey} status=${created.status} detail=${String(created.detail).slice(0, 300)}`,
	);
}

/**
 * Posts a short JSON message to ALERT_WEBHOOK_URL (a Slack/Teams incoming
 * webhook or any endpoint that accepts `{ text }`), so a Dataverse outage is
 * noticed from somewhere other than a customer calling in. Not configured is
 * not an error — the line is still in the Worker log either way — and a
 * failure sending the alert itself must never fail the enquiry. See
 * docs/lead-forms.md for how to point this at a webhook.
 */
async function sendAlert(env, message) {
	const url = str(env.ALERT_WEBHOOK_URL);
	if (!url) return;
	try {
		await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: message }),
		});
	} catch (err) {
		console.error('enquiry_alert_failed', String(err && err.message ? err.message : err));
	}
}

/* -------------------------------------------------------------------------- */
/* Request helpers                                                            */
/* -------------------------------------------------------------------------- */

function originAllowed(request) {
	const origin = request.headers.get('Origin');
	// A same-origin form post without JS sends no Origin on some older browsers.
	// Turnstile already requires JS, so treat a missing Origin as acceptable
	// rather than blocking a legitimate submission.
	if (!origin) return true;
	try {
		const host = new URL(origin).hostname;
		return ALLOWED_ORIGIN_HOSTS.includes(host) || host.endsWith(ALLOWED_ORIGIN_SUFFIX);
	} catch {
		return false;
	}
}

/** Accepts a urlencoded form post or a JSON body. Returns a FormData-like map. */
async function readBody(request) {
	const type = (request.headers.get('Content-Type') || '').toLowerCase();
	try {
		if (type.includes('application/json')) {
			const body = await request.json();
			if (!body || typeof body !== 'object') return null;
			const map = new Map();
			for (const [key, value] of Object.entries(body)) {
				map.set(key, value == null ? '' : String(value));
			}
			return map;
		}
		if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
			return await request.formData();
		}
	} catch {
		return null;
	}
	return null;
}

function str(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function validate(form, fields) {
	const values = {};
	const errors = {};

	for (const field of fields) {
		const raw = str(form.get(field.name));

		if (!raw) {
			if (field.required) errors[field.name] = 'This one is needed.';
			continue;
		}
		if (field.max && raw.length > field.max) {
			errors[field.name] = `Please keep this under ${field.max} characters.`;
			continue;
		}
		if (field.email && !looksLikeEmail(raw)) {
			errors[field.name] = 'That does not look like an email address.';
			continue;
		}
		if (field.integer) {
			const n = Number(raw);
			if (!Number.isInteger(n) || n < field.min || n > field.max) {
				errors[field.name] = `Please give a whole number between ${field.min} and ${field.max}.`;
				continue;
			}
			values[field.name] = n;
			continue;
		}
		values[field.name] = raw;
	}

	return { values, errors };
}

function looksLikeEmail(value) {
	// Deliberately loose. The acknowledgement email is the real check.
	return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

/* -------------------------------------------------------------------------- */
/* Turnstile                                                                  */
/* -------------------------------------------------------------------------- */

async function verifyTurnstile(request, env, token) {
	if (!env.TURNSTILE_SECRET_KEY) {
		// Refuse rather than accept unprotected posts. A missing secret is a
		// deploy mistake, not a reason to open the endpoint to bots.
		console.error('enquiry_turnstile_secret_missing');
		return { ok: false, error: 'not_configured', status: 503 };
	}
	if (!token) {
		return { ok: false, error: 'captcha_missing', status: 400 };
	}

	const body = new FormData();
	body.append('secret', env.TURNSTILE_SECRET_KEY);
	body.append('response', token);
	const ip = request.headers.get('CF-Connecting-IP');
	if (ip) body.append('remoteip', ip);

	const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
		method: 'POST',
		body,
	});
	const result = await response.json().catch(() => null);

	if (!result || result.success !== true) {
		console.log('enquiry_turnstile_rejected', JSON.stringify(result && result['error-codes']));
		return { ok: false, error: 'captcha_failed', status: 403 };
	}
	return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Dataverse                                                                  */
/* -------------------------------------------------------------------------- */

function dataverseConfig(env) {
	const required = ['DATAVERSE_URL', 'ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET'];
	const missing = required.filter((key) => !str(env[key]));
	if (missing.length > 0) return { ok: false, missing };

	return {
		ok: true,
		value: {
			// Trailing slashes break the token scope and the API path.
			resource: str(env.DATAVERSE_URL).replace(/\/+$/, ''),
			tenantId: str(env.ENTRA_TENANT_ID),
			clientId: str(env.ENTRA_CLIENT_ID),
			clientSecret: str(env.ENTRA_CLIENT_SECRET),
		},
	};
}

/**
 * Access tokens last about an hour. Cache per isolate so a burst of
 * submissions does not mean a token request each time.
 */
let tokenCache = null;

async function getAccessToken(config) {
	const now = Date.now();
	if (tokenCache && tokenCache.resource === config.resource && tokenCache.expiresAt > now) {
		return tokenCache.token;
	}

	const body = new URLSearchParams({
		grant_type: 'client_credentials',
		client_id: config.clientId,
		client_secret: config.clientSecret,
		scope: `${config.resource}/.default`,
	});

	const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		throw new Error(`token request failed: ${response.status} ${detail.slice(0, 500)}`);
	}

	const payload = await response.json();
	tokenCache = {
		resource: config.resource,
		token: payload.access_token,
		// Expire a minute early so an in-flight request cannot use a dead token.
		expiresAt: now + Math.max(0, (Number(payload.expires_in) || 3600) - 60) * 1000,
	};
	return tokenCache.token;
}

function buildLead(journeyKey, journey, values, env) {
	const { firstname, lastname } = splitName(values.name);

	const lines = [`Journey: ${journey.label} (${journeyKey})`, ''];
	for (const field of journey.fields) {
		if (values[field.name] === undefined) continue;
		lines.push(`${field.label}: ${values[field.name]}`);
	}
	lines.push('', 'Submitted from the enquiry form on xfour.co.uk.');
	lines.push('The sender confirmed they are happy for XFour to reply.');

	const lead = {
		subject: journey.subject(values.company),
		firstname,
		lastname,
		companyname: values.company,
		emailaddress1: values.email,
		description: lines.join('\n'),
	};

	// Number of users maps cleanly onto the out-of-box field, which makes the
	// Managed IT pipeline sortable without a custom column.
	if (typeof values.users === 'number') {
		lead.numberofemployees = values.users;
	}

	// Lead source is tenant-specific. It is optional here so the endpoint still
	// works before the option set values exist; the journey is always in the
	// subject and the description either way.
	const leadSource = Number(str(env[journey.leadSourceVar]));
	if (Number.isInteger(leadSource) && leadSource > 0) {
		lead.leadsourcecode = leadSource;
	}

	// No ownerid on purpose. A create that names another owner makes Dataverse
	// assign the new record, and the assign checks Read on it at the new owner's
	// scope, so the app user would need Read on Lead across the business unit
	// (seen in production on 12 Oct 2026). With that, a leaked secret could read
	// every Lead in the CRM. Instead the Lead is created owned by the app user,
	// and the Power Automate flow gives it to the journey's owner straight after.
	// See docs/lead-forms.md and dynamics/website-enquiries.

	return lead;
}

function splitName(fullName) {
	const parts = fullName.split(/\s+/).filter(Boolean);
	if (parts.length === 1) {
		// lastname is the required field on Lead, so a single word goes there.
		return { firstname: undefined, lastname: parts[0].slice(0, 50) };
	}
	return {
		firstname: parts.slice(0, -1).join(' ').slice(0, 50),
		lastname: parts[parts.length - 1].slice(0, 50),
	};
}

async function createLead(config, lead, env) {
	let token;
	try {
		token = await getAccessToken(config);
	} catch (err) {
		return { ok: false, status: 0, detail: String(err && err.message ? err.message : err) };
	}

	const response = await fetch(`${config.resource}/api/data/v9.2/leads`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json; charset=utf-8',
			Accept: 'application/json',
			'OData-MaxVersion': '4.0',
			'OData-Version': '4.0',
			// No `Prefer: return=representation`: the new id comes back in the
			// OData-EntityId header of the 204, so nothing here reads the record.
		},
		body: JSON.stringify(lead),
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		// A stale cached token would surface as a 401. Drop it so the next
		// submission fetches a fresh one.
		if (response.status === 401) tokenCache = null;
		return { ok: false, status: response.status, detail: detail.slice(0, 1000) };
	}

	// e.g. https://xfour.crm11.dynamics.com/api/data/v9.2/leads(00000000-0000-0000-0000-000000000000)
	const entityId = response.headers.get('OData-EntityId') || '';
	const match = entityId.match(/\(([0-9a-f-]{36})\)\s*$/i);
	return { ok: true, leadid: match ? match[1] : undefined };
}

/* -------------------------------------------------------------------------- */

function json(body, status = 200, headers = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			...headers,
		},
	});
}
