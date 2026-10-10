# Enquiry forms → Dynamics 365 Leads

Runbook for the two enquiry forms on `/contact-us` (XFO-46, from Phase 0 / XFO-3).

The code is finished and merged behind configuration. **The endpoint answers
`503 not_configured` until the steps in "Tenant configuration" are done**, which
is deliberate: a form that silently drops a lead is worse than no form.

---

## What was built

| | Journey A — Dynamics 365 | Journey B — Managed IT |
|---|---|---|
| Anchor | `/contact-us#dynamics-365` | `/contact-us#managed-it` |
| Primary action | The live Microsoft Bookings link | The quote form itself |
| `journey` value posted | `dynamics` | `managed-it` |
| Lead subject | `Dynamics 365 enquiry — {company}` | `Managed IT quote — {company}` |
| Lead source | `LEAD_SOURCE_DYNAMICS` | `LEAD_SOURCE_MANAGED_IT` |
| Lead owner | `LEAD_OWNER_DYNAMICS` | `LEAD_OWNER_MANAGED_IT` |

Files:

- `x4-website/src/index.js` — the Worker. `POST /api/enquiry` and `GET /api/form-config`.
- `x4-website/public/assets/js/enquiry-form.js` — client side.
- `x4-website/public/contact-us.html` — both forms.
- `x4-website/wrangler.jsonc` — the non-secret configuration.

Spam defence is a honeypot field plus Cloudflare Turnstile, with validation
repeated server side. Nothing the browser sends is trusted.

## Why a Worker and not a Dynamics form embed

The plan asked us to check the native Dynamics 365 Marketing / Customer Insights
– Journeys form embed first. The live chat widget proves the tenant has Sales /
Customer Service with Omnichannel; it does **not** prove Customer Insights –
Journeys, which is a separate licence. A Marketing embed would also drop
Microsoft's own markup into the page, which will not match the rest of the site.

So: a small Worker endpoint posting to the Dataverse Web API. No new vendor, no
new data processor in the privacy policy, and full control of the markup.

**If the tenant does already have a Customer Insights – Journeys licence, say so
and we will revisit** — the native route needs no code to maintain.

---

## Tenant configuration

Five jobs. All of them need somebody with tenant admin and a Dynamics system
administrator role, which is why they were not in PR #23.

### 1. Register the application in Entra ID

1. Entra admin centre → App registrations → New registration.
   - Name: `XFour website enquiry forms`
   - Single tenant. No redirect URI — this is a daemon, not a sign-in.
2. Note the **Application (client) ID** and the **Directory (tenant) ID**.
3. Certificates & secrets → New client secret. Copy the value once; it is never
   shown again. Put a diary note in for the expiry date.

No API permissions are needed here. Dataverse access comes from the application
user in step 2, not from a delegated or application permission grant.

### 2. Create the application user in Dynamics

1. Power Platform admin centre → Environments → the XFour production
   environment → Settings → Users + permissions → Application users → New.
2. Pick the app registration from step 1.
3. Give it a security role that can **create Lead only**. Do not give it System
   Administrator. Either:
   - copy `Salesperson` and strip everything except Create + Append on Lead, or
   - create a role named `Website enquiry form` with Create and Append To on the
     Lead entity at organisation scope and nothing else.

The point of the narrow role: if the client secret ever leaked, the worst an
attacker could do is create junk leads.

### 3. Add the two Lead Source option set values

Lead Source (`leadsourcecode`) has no web values out of the box.

1. Power Apps → Tables → Lead → Columns → `Lead Source` → Edit → add:
   - `Web — Dynamics 365`
   - `Web — Managed IT`
2. Note the **integer value** of each new choice. They go in `wrangler.jsonc`.

These are optional to the code — if they are left blank the lead still arrives
and the journey is still in the subject line and the description. But without
them the two pipelines cannot be reported separately, which was the whole point
of building two forms.

### 4. Decide the two owners

The plan is deliberate that the journeys have separate owners so the pipelines
report separately. Get the **systemuser GUID** for each owner (open the user
record in Dynamics and read `id=` out of the URL) and put them in
`wrangler.jsonc`.

### 5. Create the Turnstile widget

1. Cloudflare dashboard → Turnstile → Add widget.
   - Name: `xfour.co.uk enquiry forms`
   - Hostnames: `www.xfour.co.uk` and `xfour.co.uk`
   - Widget mode: Managed
2. Copy the **site key** into `wrangler.jsonc` and keep the **secret key** for
   the next section.

---

## Setting the configuration

Non-secret values go in `x4-website/wrangler.jsonc` under `vars` and are
committed:

```jsonc
"vars": {
  "DATAVERSE_URL": "https://<org>.crm11.dynamics.com",
  "ENTRA_TENANT_ID": "...",
  "ENTRA_CLIENT_ID": "...",
  "TURNSTILE_SITE_KEY": "0x...",
  "LEAD_SOURCE_DYNAMICS": "...",
  "LEAD_SOURCE_MANAGED_IT": "...",
  "LEAD_OWNER_DYNAMICS": "...",
  "LEAD_OWNER_MANAGED_IT": "..."
}
```

`DATAVERSE_URL` must have no trailing slash. It is the environment URL from the
Power Platform admin centre, not the `omnichannelengagementhub.com` URL used by
the chat widget.

The two secrets are set with Wrangler and **must never be written into the
repo**:

```bash
cd x4-website
npx wrangler secret put ENTRA_CLIENT_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

For local development, put the same two in `x4-website/.dev.vars`, which is
git-ignored.

---

## Acknowledgement email and the follow-up task

These are deliberately **not** in the Worker. Both are done in one Power Automate
flow, triggered on Lead create, filtered to the two web lead sources:

1. **Send the acknowledgement.** Send an email from `hello@xfour.co.uk` to the
   lead's email address. The Dynamics `Send an email` action keeps a copy against
   the lead record, so the thread stays in one place.
2. **Create the follow-up task.** A Task regarding the lead, owned by the lead's
   owner, due **one working day** after creation. That is the SLA the success
   message on the form promises, so if the SLA changes, change both.

Why not in the Worker: sending from a real mailbox through the Worker would need
`Mail.Send` application permission on the app registration, which by default lets
it send as anybody in the tenant. Power Automate avoids that, keeps the email
template editable by somebody who is not a developer, and keeps the activity
history on the lead.

---

## Analytics

`enquiry-form.js` fires one event per successful submit:

- `posthog.capture('enquiry_submitted', { journey })`
- and a `dataLayer.push({ event: 'enquiry_submitted', journey })`

Both calls are guarded, so they are harmless before the analytics work (XFO-44)
lands and start working the moment it does. No new tag manager is needed.

---

## Testing it

Locally:

```bash
cd x4-website
npm install
npx wrangler dev
```

Then `http://localhost:8787/contact-us`. With no Turnstile site key set, both
forms show the "not available right now" fallback — that is the configured-off
behaviour working.

Once configured, the acceptance test from the plan is:

1. Submit the Dynamics form. A Lead appears with source `Web — Dynamics 365`,
   the right owner, and the answers in the description.
2. Submit the Managed IT form. Same, with source `Web — Managed IT`, the other
   owner, and the user count in `Number of Employees`.
3. The acknowledgement email arrives at the address used.
4. The follow-up task exists against each lead with the right due date.
5. The analytics event fires once per submit with the right `journey`.

Worker logs are in the Cloudflare dashboard (observability is on). Useful lines:
`enquiry_lead_created`, `enquiry_dataverse_failed`, `enquiry_turnstile_rejected`,
`enquiry_honeypot_tripped`, `enquiry_not_configured`.

---

## Known limits, worth a follow-up

- **A failed Dataverse write loses the enquiry.** The visitor is told to call or
  email, and the failure is logged, but nothing holds the submission for a retry.
  A Queue or a KV write before the Dataverse call would fix this. Not Phase 0.
- **`run_worker_first` is `true`,** so the Worker runs on every request and hands
  non-API paths back to the asset server. Wrangler 4.20+ accepts
  `run_worker_first: ["/api/*"]`, which is tighter. Worth doing next time
  Wrangler is bumped.
- **No rate limit beyond Turnstile.** If junk ever gets through, add a Cloudflare
  rate limiting rule on `/api/enquiry` rather than writing counting code.
- **The Bookings link is shared** with `/app-development`, so a Dynamics scoping
  call and an app build review land in the same calendar.
