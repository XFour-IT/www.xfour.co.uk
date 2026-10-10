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
 */

/** Journeys the form endpoint accepts, and the shape each one must have. */
const JOURNEYS = {
	dynamics: {
		label: 'Dynamics 365',
		leadSourceVar: 'LEAD_SOURCE_DYNAMICS',
		ownerVar: 'LEAD_OWNER_DYNAMICS',
		subject: (company) => `Dynamics 365 enquiry — ${company}`,
		fields: [
			{ name: 'current_stack', label: 'What they run today', required: true, max: 1000 },
			{ name: 'pain', label: 'What is not working', required: true, max: 2000 },
		],
	},
	'managed-it': {
		label: 'Managed IT',
		leadSourceVar: 'LEAD_SOURCE_MANAGED_IT',
		ownerVar: 'LEAD_OWNER_MANAGED_IT',
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
const ALLOWED_ORIGIN_HOSTS = [
	'www.xfour.co.uk',
	'xfour.co.uk',
	'x4-website.workers.dev',
	'localhost',
	'127.0.0.1',
];

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
	const created = await createLead(config.value, lead, env);
	if (!created.ok) {
		console.error('enquiry_dataverse_failed', created.status, created.detail);
		return json({ ok: false, error: 'crm_unavailable' }, 502);
	}

	console.log('enquiry_lead_created', JSON.stringify({ journey: journeyKey, leadid: created.leadid }));
	return json({ ok: true, journey: journeyKey });
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
		return ALLOWED_ORIGIN_HOSTS.includes(new URL(origin).hostname);
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

	// Lead source and owner are tenant-specific. Both are optional here so the
	// endpoint still works before the option set values exist; the journey is
	// always in the subject and the description either way.
	const leadSource = Number(str(env[journey.leadSourceVar]));
	if (Number.isInteger(leadSource) && leadSource > 0) {
		lead.leadsourcecode = leadSource;
	}
	const owner = str(env[journey.ownerVar]);
	if (owner) {
		lead['ownerid@odata.bind'] = `/systemusers(${owner})`;
	}

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
			Prefer: 'return=representation',
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

	const created = await response.json().catch(() => ({}));
	return { ok: true, leadid: created.leadid };
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
