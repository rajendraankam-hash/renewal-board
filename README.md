# RenewLoop — renewal & lead follow-up automation

An automation suite for loan and insurance distribution agencies: one board that shows
who to chase first, plus standalone agents that run on their own.

This repo contains four things:

1. **`examples/digest-agent.js` — an autonomous agent** (the code sample).
2. **`app/` + `sql/` — a deployed board** (Next.js + Supabase Postgres).
3. **`preflight/` — an autonomous artwork-QA agent** for print jobs.
4. **`design-agent/` — a brief-to-proof-to-delivery design agent.**

---

## 1. The agent: `examples/digest-agent.js`

A daily news digest that runs unattended on a schedule, with no human in the loop.

What it does, in order:
- Fetches Google News RSS for the relevant trade query.
- Parses and de-duplicates the stories (plain string parsing, no XML library).
- Asks an LLM to return **strict JSON** — one `{ what, means }` pair per story.
- Renders a self-contained HTML digest.
- Emails it through Composio's Gmail tool.

Design choices worth noting:
- **Zero dependencies.** Node built-ins only (`fetch`, `fs`, `path`), so it deploys anywhere Node runs.
- **Provider-agnostic.** Routes to OpenRouter when the key starts with `sk-or-`, otherwise DeepSeek. One line switches the model.
- **Degrades safely.** A missing key, a failed fetch, or a malformed model reply does not throw away the run — the digest is still written with a clear note saying what was missing. It never fabricates a summary.
- **Scheduled externally.** On Windows it is registered with Task Scheduler (`StartWhenAvailable` so a missed 8:00 run catches up), not by a sleep loop.

Run it:

```bash
node examples/digest-agent.js
```

Optional config, read from the same folder as the script:
- `key.txt` — a DeepSeek or OpenRouter API key (enables summaries).
- `composio-key.txt` — a Composio key (enables email).

Set `RECIPIENT_EMAIL` and `COMPOSIO_USER_ID` near the top of the file for your own setup.
This copy is a sanitized public sample; no keys or addresses are committed.

---

## 2. The board: `app/`, `lib/`, `sql/`

A single-screen board of policy renewals, loan files and cold leads, ranked
"who to chase first" (overdue first, then soonest date, then largest amount at risk),
with money at risk in integer paise, a handler/product filter, and call/visit logging.

Stack: Next.js (App Router) on Vercel, Supabase Postgres, row-level security enabled on the
`records` table.

- `app/board.js` — the board UI and ranking logic.
- `app/states.js` — explicit empty / missing-config / error states.
- `lib/supabase.js` — validates config before any network call.
- `sql/001_schema.sql` — table, constraints, indexes, RLS.
- `sql/002_seed.sql` — 30 rows of fictional demo data.

To run against your own database, create a Supabase project, run `sql/001_schema.sql`
then `sql/002_seed.sql` in the SQL editor, and set:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

---

## 3. Preflight — autonomous artwork QA for print (`preflight/`)

A print job arrives with an ordered product and size plus an uploaded artwork file.
Preflight inspects the file itself and decides, on its own, whether the job can skip the
human proof queue — and when it cannot, it tells the customer exactly what to fix.

Decisions it can reach:
- `AUTO_APPROVED` — every check passed; safe to remove from the human queue.
- `HUMAN_REVIEW` — a warning or an ambiguous result; a person decides.
- `NEEDS_FIX` — a hard blocker (for example resolution below the minimum); the customer
  gets a specific, plain-language fix, and nothing is approved.

It reads file headers only — PNG `IHDR`, JPEG `SOF`, PDF `MediaBox`, SVG `width`/`height` —
so it is fast, needs no image library and needs no API key.

- `preflight/preflight.js` — the agent and CLI.
- `preflight/preflight-specs.json` — every threshold and product rule, versioned. These are
  prototype defaults, not Sticker Mule's published requirements.
- `preflight/test-preflight.js` — 55 assertions, with fixtures it generates itself.

```bash
node preflight/test-preflight.js
node preflight/preflight.js --job preflight/jobs/example-job.json --out preflight/out
node preflight/preflight.js --dir <folder> --product die-cut-sticker --size 3x3 --out preflight/out
```

Each run writes `decisions.json`, an append-only `audit.log` (one line per job, with a
content hash), and a customer message for every `NEEDS_FIX`.

---

## 4. Design agent — brief to proof to delivered order (`design-agent/`)

A customer brief goes in; a proof comes out; nothing is ordered until the customer approves
one variant. After approval the agent runs the rest on its own:
`APPROVED -> ORDER_CREATED -> IN_PRODUCTION -> SHIPPED -> DELIVERED`, writing an artifact at
each step.

- `design-agent/design-agent.js` — the agent and CLI.
- `design-agent/design-specs.json` — palettes, layouts, product shapes, print DPI, turnaround,
  revision cap.
- `design-agent/test-design-agent.js` — 34 assertions over a temp folder.

```bash
node design-agent/test-design-agent.js
node design-agent/design-agent.js --brief design-agent/jobs/example-brief.json --out design-agent/out --render
node design-agent/design-agent.js --approve A --by "customer" --out design-agent/out
node design-agent/design-agent.js --revise "make the tagline bigger" --out design-agent/out
```

Guardrails, and the tests that prove them:
- **No order without approval**, and the approval is bound to the artwork hash — editing the
  file after approval invalidates it instead of shipping something the customer never saw.
- **The approved artwork is handed to the Preflight agent** before ordering; a blocked file
  stops the order at `ORDER_BLOCKED`.
- **Every state change is appended to `audit.log`**, so the history is reconstructable.
- The default concept provider is **local and deterministic**, so the output is reproducible.
  A model provider can be enabled with `--provider remote` plus an API key; without a key it
  records the reason and falls back to local.

---

## Status, honestly

- The board is deployed and renders live (verified: `GET` the production URL → `200`, with 30 records and totals).
- The agent runs on a daily schedule and produces a digest with emailed summaries.
- Preflight's suite is green (`55 passed, 0 failed`) and it runs offline with no key; its
  numeric thresholds are prototype defaults, marked as such in `preflight/preflight-specs.json`.
- The design agent's suite is green (`34 passed, 0 failed`). It was verified on artwork it
  generated itself; it has not been run on real customer files or a real factory.
- **Not yet enforced:** the RLS policies in `sql/001_schema.sql` are permissive (`using (true)`) for this demo. Per-person visibility ("each manager sees only their own list") is designed in but not implemented — a real deployment must replace those policies.
- **Not exercised:** writing an activity from the public deployment back to Supabase (deliberately left alone so the deployed demo data stays intact).

Related agents built on the same problem (not in this repo): a grounded FAQ chatbot
(n8n + DeepSeek, live) and a validating lead/renewal intake flow (n8n + Data Table) that
rejects bad records with a named failing field and stores nothing.
