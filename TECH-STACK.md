# TECH-STACK - Renewal and Lead Follow-Up Board

**STATUS: DRAFT.** Answers one question: **what do we build it with, and why that?**
**Inputs:** `PRD.md` (requirements) and the stated scale: **100 users.**
**Pricing checked 2026-09-13** from `https://supabase.com/pricing` and `https://vercel.com/pricing`.

Rule applied throughout: every choice is paired with the constraint that forced it. A choice without a constraint is a preference. Each layer also names what was rejected.

---

## Scale, stated plainly

- 100 users total. Use is peaked: most of them open the board once, in the morning.
- Rough concurrency at that peak: ~15-25 sessions.
- Records: three types (policy renewal, loan file, cold lead). Estimated ceiling ~50,000 active records.
- Activity writes: ~15 per user per working day, so ~33,000 rows/month at full adoption.
- Request volume: ~13,000 board loads/month, tens of requests each.

**ASSUMPTION S1 (verify with the client):** the 100 users are one agency's staff, not 100 separate agencies. If it is many agencies, the app is multi-tenant and needs an agency scope on every record (see the final section - this changes the schema, not just a setting).

**ASSUMPTION S2:** records and activity fit comfortably in a single small relational database. At the volumes above they do.

---

## The constraints that decide everything

- **K1 - 100 users, not web scale.** No load balancers, no read replicas, no queues, no caches.
- **K2 - Cheapest first.** Start on free tiers. Know exactly what pushes us off.
- **K3 - No operations staff.** Managed everything; no servers to patch.
- **K4 - Relational data with money totals.** Three record types, filters by handler and product, and summed amounts at risk.
- **K5 - Per-person visibility is a listed feature, not an afterthought.** "Each person sees only their own list."
- **K6 - Immediate totals after logging an activity.** PRD C3/C6 decide whether it is truly instant or next-morning.
- **K7 - Completeness.** "Every" record means data must be imported and kept accurate.
- **K8 - The PRD's contradictions (C1-C7) are unresolved.** Decisions must land as config or data changes, not rewrites.
- **K9 - Nothing to notify, export or store as files.** The PRD's "not building" list keeps scope small.
- **K10 - Money must be exact; dates are Indian.** Rupees and the Asia/Kolkata day boundary.

---

## Stack at a glance

| Layer | MVP (free tier) | Production (100 users) | Forced by | Rejected |
|---|---|---|---|---|
| Database | Managed PostgreSQL (Supabase Free) | Same, Supabase Pro | K4, K2, K3 | MongoDB, Airtable, Sheets, SQLite, RDS/Aurora |
| Auth | Supabase Auth (email + password, admin-created) | Same, on Pro | K5, K2, K3 | Clerk, Auth0, NextAuth self-managed, custom JWT, phone OTP |
| Access control | Postgres row-level security | Same | K5 | App-layer-only filtering, per-user databases |
| Frontend | Next.js (App Router) + TypeScript | Same | K4, K6, K2 | Plain SPA + separate API, Remix, SvelteKit, Angular, HTMX-only |
| Hosting | Vercel Hobby (pilot) | Vercel Pro | K2, K3 | AWS/ECS/K8s, VPS, Render, Netlify, Cloudflare |
| Server functions | Next.js Route Handlers / Server Actions | Same | K6, K1 | Always-on API server, Supabase Edge Functions, GraphQL |
| Instant totals | Write returns recomputed totals in one request | Same, optionally add Realtime | K6, K1 | WebSockets/Pusher from day one, Redis cache |

---

## 1. Database

**Choice: managed PostgreSQL (Supabase Free, then Pro).**

**Constraint that forced it (K4, K2, K3).** The PRD needs three record types joined to handlers and products, plus summed money by filter. That is a relational query. It needs to run for 100 users with zero operations. A managed Postgres gives exact aggregates, transactions for "log activity and recompute totals", and indexing on handler/due date/product - all on a free tier at this size.

**Rejected, and why:**
- **MongoDB / document store** - totals by product and handler become application code, and there is no row-level security to enforce "own list". Relational integrity of handler and product lists is weaker.
- **Airtable or a sheet as the datastore** - this is exactly what the client is trying to leave; row caps and weak integrity make the "every record" promise fragile.
- **SQLite / a file database** - fine for reads, awkward for many concurrent writers and for row-level access rules; hosting a file database behind serverless functions adds problems for no gain.
- **A separate managed Postgres like Neon/RDS/Aurora/Cloud SQL** - all viable, all rejected for now: Neon does not bundle auth/access rules (another vendor, K3), and RDS/Aurora are enterprise-priced and operationally heavier than 100 users justify (K1, K2).

**MVP vs production:** Free at first. Production = Supabase Pro at **$25/month** (8 GB database, 250 GB egress, daily backups, no pausing). This is a plan change and, at worst, a project migration for a bigger compute size - not a rewrite.

**Schema notes forced by the PRD:** amounts stored as integer minor units (paise), never floating point (K10); dates stored as dates with Asia/Kolkata as the working timezone; an append-only activity table (actor, type, note, timestamp); small lookup tables for products and handlers. Index on (handler, due date) and (product, due date) to keep the morning view fast.

---

## 2. Authentication

**Choice: Supabase Auth, email + password, accounts created by an admin (no public sign-up).**

**Constraint that forced it (K5, K2, K3).** Visibility is per person, so the app needs a trustworthy identity for every viewer, and that identity has to be usable by the database's access rules. Supabase Auth issues the identity that row-level security reads, includes 50,000 monthly active users on the free plan, and needs no separate vendor. With admin-created accounts and custom SMTP included even on Free, there is no cost per user at 100.

**Rejected, and why:**
- **Clerk / Auth0** - good products, but a second vendor and a second bill for a problem a bundled auth already solves at this scale. Auth0 is priced and shaped for larger organisations.
- **Self-managed sessions (rolling your own or NextAuth with your own tables)** - more code to write and a security surface you now own (K3).
- **Social login** - agency staff signing in with a personal Google account is not what an internal tool wants.
- **Phone OTP** - familiar in India, but it needs an SMS provider and a per-message cost; not justified when email works.
- **SSO / SAML** - no IT department to demand it, and it is a paid add-on.

**MVP vs production:** identical code. Production only changes plans. Moving to a different identity provider later would be a rewrite of the auth integration and every access rule.

---

## 3. Access control (per-person visibility)

**Choice: Postgres row-level security, keyed to the signed-in user, with a role for the owner.**

**Constraint that forced it (K5).** "Each person sees only their own list" has to be true even if a screen has a bug. Filtering in the interface only is one forgotten clause away from showing one relationship manager another's book.

**Rejected, and why:**
- **Filtering in application code only** - leaks on any missed condition.
- **A database per person or per product** - absurd at this scale and a migration nightmare.
- **Client-side filtering** - not access control at all.

**MVP vs production:** same. This is the layer most affected by PRD C1 and C7; keep the rules in one place so the decision becomes a policy change, not a code rewrite.

---

## 4. Frontend framework

**Choice: Next.js (App Router) with TypeScript.**

**Constraint that forced it (K4, K6, K2).** The board is one authenticated, data-heavy page with filters and an action (log a call or visit) that must reflect new totals immediately. Next.js renders that page on the server, keeps secrets server-side, and co-locates the write with the page in one project and one deploy, which is the cheapest thing that still behaves like an app. It is also the framework the chosen host runs best, so there is no integration tax.

**Rejected, and why:**
- **A plain front-end plus a separate API service** - two deploys, CORS, duplicated auth handling (K3).
- **Remix / SvelteKit / Nuxt** - all capable; rejected on ecosystem maturity and on tighter integration with the chosen host, not on quality.
- **Angular** - more structure and weight than a 100-user internal board needs.
- **Server-rendered HTML with minimal JavaScript (HTMX-style)** - genuinely tempting as the cheapest option, and rejected because the interactive filters, optimistic activity logging and immediate totals would end up as custom JavaScript anyway, without the framework's structure.

**MVP vs production:** same. A UI library (Tailwind plus a small component set) is chosen for speed, not bought.

---

## 5. Hosting

**Choice: Vercel.**

**Constraint that forced it (K2, K3).** It deploys the chosen framework with no server to manage, has a usable free tier, and includes a CDN and HTTPS by default. At 100 users the free tier's traffic allowances are far beyond what the math above needs.

**Rejected, and why:**
- **AWS / GCP / Azure (including containers or Kubernetes)** - the enterprise reflex. Massive operational surface for 100 users (K1, K2).
- **A raw VPS** - cheapest headline price, but you own patching, uptime and backups (K3).
- **Render / Railway / Fly.io** - fine, but less first-party support for the chosen framework and, historically, cold-start and free-tier churn.
- **Netlify / Cloudflare Pages** - capable; rejected for weaker first-party framework integration and, on Cloudflare, complications connecting to Postgres.

**MVP vs production:** Hobby for a pilot, then Pro at **$20/month** for commercial use and more included usage. A plan change, not a code change.

---

## 6. Server functions

**Choice: Next.js Route Handlers and Server Actions, running on the same host.**

**Constraint that forced it (K6, K1).** The only write in the PRD is "log a call or a visit and update the totals." That is one small transaction. A serverless function can write the activity and return the freshly computed totals in the same response, which satisfies "straight away" without any realtime infrastructure. At 100 users there is no need for an always-on process.

**Rejected, and why:**
- **A standalone Node API (Express/Nest) on a container** - a second deploy, always-on cost, and ops for no benefit (K1, K3).
- **Supabase Edge Functions** - splits the application logic across two runtimes and complicates local development for no gain.
- **GraphQL** - one client and a handful of queries; a query language here is ceremony.
- **A queue or background worker** - nothing in the PRD runs in the background.

**Constraint to respect:** serverless functions plus Postgres can exhaust connections. Use the pooled connection setting (Supabase's pooler; 200 pooled connections on the smallest compute) and never open a connection per request. This is the one real performance trap at this scale.

**MVP vs production:** same code. Production adds the pooled connection string and, only if "instant for other viewers" is demanded, realtime as an addition (see below).

---

## 7. Anything the PRD's features specifically demand

**Immediate totals after logging (K6, PRD C3/C6).** MVP: the write returns the recomputed totals; the screen updates from the response. Rejected: WebSockets, Pusher or a realtime service from day one - complexity for a 100-user, once-a-morning app. If the client insists totals must change on other people's screens without a refresh, Supabase Realtime can be switched on later (200 concurrent and 2M messages/month on Free) - an additive change, not a rewrite.

**Completeness of "every" record (K7).** A one-off import of the client's existing lists into the database, with a validation pass that reports missing due dates, missing amounts and unassigned records. Rejected: live synchronisation from any other system - the PRD does not ask for it and it is the expensive path.

**Filters by handler and product (K4).** Plain indexed SQL. Rejected: a search service such as Elasticsearch - tens of thousands of rows do not need one.

**Money and dates (K10).** Integer minor units for money; date types and one working timezone. Rejected: floating-point money and locale-formatted date strings.

**Activity history and trust.** An append-only activity table with actor and timestamp, so a logged call is provable. Rejected: overwriting a "last activity" field - it destroys the history the PRD implies.

**Lookups (product list, handler roster).** Two small tables. Rejected: hard-coding lists in the interface, which makes PRD C2 and C4 harder to change.

**Caching.** None at first. Rejected: Redis or a materialised view before a measured reason exists (K1, K2).

---

## Free tier: the exact limits, and what forces us off

Both providers' published limits as of 2026-09-13.

**Vercel Hobby (free):** 1M edge requests/month, 100 GB fast data transfer, 1M function invocations/month, 4 hours of active CPU, 1 hour of runtime logs. The traffic allowances are roughly 10-25x our estimated use.
**The limit that forces us off:** not traffic - the **terms**. Vercel documents Hobby as "for personal, non-commercial use". The moment a paying client runs this as their business tool, that is the trigger to move to **Pro, $20/month**. If the 100 users are real staff, assume Pro from day one.

**Supabase Free:** 500 MB database, 5 GB egress, 1 GB file storage, 50,000 monthly active users, no backups, and **projects pause after 1 week of inactivity**.
**The limit that forces us off, in order of likelihood:**
1. **No backups.** For money records, this alone forces Pro ($25/month) before go-live.
2. **5 GB egress.** Our estimate is ~2.6 GB/month at full adoption; larger payloads or more loads cross it first. This is the first hard traffic cap we would hit.
3. **500 MB database.** ~16 MB/month of activity rows, so roughly 2-3 years of headroom. Not the near-term limit.
4. **Inactivity pause.** A 7-day pause cannot hit a tool opened every morning, but it is a real risk during holidays and is unacceptable for a client system; Pro removes it.

**Conclusion:** a genuine client deployment costs **about $45/month** ($20 host + $25 database), or **$0** for a non-commercial pilot. At 100 users that is under $0.50 per user per month.

---

## MVP vs production: config switch, additive, or rewrite

**Config switch (a setting, an environment variable, or a plan):**
- Supabase Free to Pro; Vercel Hobby to Pro.
- Swapping the database connection string to the pooled one.
- Custom domain, HTTPS, environment variables, backups toggled on.
- Creating a staging project separate from production.

**Additive (new code, old code untouched):**
- Turning on realtime for cross-user totals.
- Adding indexes, a new field, an import screen, or activity history views.
- Adding a password-reset or invitation flow.

**Rewrites (the ones that hurt):**
- **Leaving the bundled database/auth/access platform.** Every table, query and screen touches it; auth and all row-level rules would be rebuilt.
- **Changing the data model.** Moving from a unified record shape to per-type tables, or adding a tenant/agency scope after data exists, is a migration plus a rewrite of queries and screens.
- **Replacing the frontend framework or splitting out a separate API server.** A full re-deploy and re-auth, not a switch.
- **Switching database engine** (relational to document, or vice versa). Everything downstream changes.

Note that adding realtime, adding a background job, or growing the plan are **not** rewrites. Nothing in the PRD forces a structural change later unless the scale assumption or the tenancy assumption is wrong.

---

## The decision most expensive to reverse

**Making one managed PostgreSQL platform the system of record, the identity provider and the authorization engine at the same time - and choosing a single-tenant data model while doing it.**

Why this one: identity, the per-person visibility rule and the records themselves all land in the same place. Six months in, leaving that platform means rebuilding authentication, every access rule and every query, while migrating live money records. And because the PRD's contradictions (C2 "amount at risk", C4 "due date", C1 "who sees everything") guarantee the record shape will change, the schema is the part most likely to move under you.

The cheap insurance, decided now rather than later:
- Keep access rules centralised so a role change is a policy change.
- Keep money and due-date semantics in one place so C2 and C4 are data decisions.
- If there is any chance of selling this to more than one agency, put a tenant/agency scope on every table **now**. Retrofitting it later is the single most expensive migration in this design.

Runner-up, for the record: choosing serverless functions over an always-on server. It is only expensive to undo if the app later needs long-running background work or heavy realtime, neither of which the PRD asks for.

---

## Verify before signing

- **S1 - tenancy.** One agency or several? This decides whether a tenant scope is added now. Do not skip this one.
- **S2 - geography.** Confirm the closest managed-database region to Thane/Mumbai exists and is available on the chosen plan; choose it at project creation, because changing region later is a migration.
- **S3 - PRD C1, C2, C4, C6.** These four directly decide schema (who is visible, what "amount at risk" is, whether leads have a due date, and whether totals must be instant). They are data/config decisions only if settled before the first import.
- **S4 - client-side email delivery.** Supabase Free includes custom SMTP; confirm the client can supply a sending address so account emails do not come from a shared sender.
- **S5 - free-tier pricing changes.** The figures above are as published on 2026-09-13 and must be re-checked before quoting the client.
