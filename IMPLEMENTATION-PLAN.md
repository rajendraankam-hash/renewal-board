# IMPLEMENTATION-PLAN - Renewal and Lead Follow-Up Board

**STATUS: DRAFT.** Answers one question: **in what order, and what is demonstrable at each step?**
**Inputs read in order:** `PRD.md`, then `TECH-STACK.md`.
**Scale:** 100 users. **Platform:** managed PostgreSQL + auth + row-level security, Next.js on the chosen host.

**The ordering rule, which overrides everything else:** every step ends in something you can open on a phone and look at. If a step cannot end that way, it is two steps or it is in the wrong place. A "phone check" at 360px and 390px widths is part of every step's test.

**The verification rule:** built without tested does not count as done. Every step below has a **Test before done** block. Negative tests are included wherever a wrong result could leak data or save bad data. Each result is recorded in `WORKLOG.md` as: what I did -> the command -> what it actually printed.

**Why this order:** the two things most expensive to undo (the tenancy/schema decision and the identity/access decision) happen in steps 1-3, while no data exists and no screens depend on them. A mistake there costs a day. The same mistake found at step 9 means unwinding everything built on top. Read value comes before write value, and real data comes after the read and write paths are proven, so a bad import cannot poison the demo.

---

## Decision gate - day 0, before step 1

These are not build steps, but if they are not answered, steps 2, 3 and 8 stall. Where the client is still undecided, the build below is designed to hold both answers rather than pick one (per `PRD.md`), and the open choice is flagged in `WORKLOG.md`.

| Decision | Needed by | If undecided, build so both work |
|---|---|---|
| **D1** One agency or many (tenancy, `TECH-STACK` S1) | Before step 1 | Add a tenant/agency scope column to every table now. It is free today and the most expensive migration later. |
| **D2** Who sees everything (PRD C1) | Step 3 | Owner sees all; everyone else sees only their own. Enforced in the database, not the screen. |
| **D3** What "amount at risk" is (PRD C2) | Step 2 | Store a per-type money figure and derive one common displayed figure; blank allowed, with a visible count of blanks. |
| **D4** Due date vs next-contact for leads (PRD C4) | Step 2 | Store a real due date (nullable) and a next-contact date; leads use the latter. The ranking reads one effective date. |
| **D5** Which totals exist (PRD C3) and immediacy (PRD C6) | Step 8 | Show count, money at risk split into overdue and upcoming, and today's logged activity. Immediate via the save response, which also satisfies "by next morning". |

---

## Phase 1 - Foundation, and the mistakes that must be caught now

### Step 1. A live shell you can open on your phone
**Estimate: 1 half-day.**
**Build:** the repository, the app skeleton, and the deploy pipeline. One page with a hard-coded board: a totals band and six rows covering the three record types. No database yet.
**See at the end:** a public URL that opens on a phone and shows a readable board with a totals band and rows. No horizontal scroll.
**Test before done:**
- Fetch the live URL and paste the status line.
- Open it on a real handset at 390px and 360px widths; confirm the band and rows render and nothing overflows.
**Decision landing here:** D1 (tenancy) is recorded in the skeleton, so the schema cannot forget it.

### Step 2. Real data, real schema, real rows
**Estimate: 1.5 half-days.**
**Build:** the database project in the chosen region; the record model with tenant scope, money stored as integer paise, due date and next-contact date, handler and product lookups; about 50 seed rows across the three types. The board now reads from the database and the totals are a query.
**See at the end:** the same URL on the phone, now showing real rows from the database and totals computed by query.
**Test before done:**
- The screen totals equal a hand count of the seed rows.
- Insert a row directly in the database; it appears on refresh.
- Change an amount; the total moves by exactly that amount.
- A row with a blank amount does not crash the screen and is counted as blank.
- Phone check at both widths.
**Decision landing here:** D3 (amount at risk), D4 (due vs next-contact), and the region. This is the schema bet; it is deliberately before any feature work.

### Step 3. Sign-in, and each person sees only their own list
**Estimate: 2 half-days.**
**Build:** authentication with email and password, accounts created by an admin (no public sign-up); two roles, owner and relationship manager; per-person visibility enforced by database row-level security, so a manager sees only their own records and the owner sees all. A phone-friendly sign-in screen.
**See at the end:** on a phone, sign in as two different people and see two different, correct lists; sign in as the owner and see everything.
**Test before done:**
- With manager A signed in, request manager B's record id directly and paste the refusal. This is the negative test that matters.
- Sign out; the board is no longer reachable by URL.
- Password reset works end to end.
- Phone check on the sign-in screen and the board.
**Decision landing here:** D2 (who sees everything). This is the most expensive thing in the build to change later; it is deliberately third.

**Phase 1 exit criteria (tick these, not a feeling):**
- [ ] A public URL opens on a real phone.
- [ ] The board shows all three record types from the real database.
- [ ] Top totals are computed by query and match a hand count.
- [ ] Two users sign in and see different, correct lists; the owner sees all.
- [ ] A manager cannot see another manager's record even by changing the URL (negative test pasted).
- [ ] Every screen is usable at 360px width.
- [ ] The tenancy decision is visible in the schema (scope column present, or explicitly excluded and written down).

---

## Phase 2 - The morning answer

### Step 4. "Who to chase first"
**Estimate: 1.5 half-days.**
**Build:** the default ranking (overdue first, then soonest date, then largest amount at risk) and distinct overdue and upcoming states. The morning view is the landing screen with no filters applied. Paging or a row limit resolves "one screen" (PRD C5).
**See at the end:** open the URL on the phone; the top of the list is the answer to "who to chase first", and overdue rows are visually different from upcoming ones.
**Test before done:**
- Build a 20-row fixture whose correct order is known by hand; confirm the on-screen order matches exactly.
- Test the boundaries: due today, due yesterday, due tomorrow.
- Confirm the row limit or paging behaves and the count is still honest.
- Phone check.
**Decision landing here:** D4's effective-date rule and C5.

### Step 5. Filters, and the personal list
**Estimate: 1 half-day.**
**Build:** filter by handler and by product; a manager's default view is their own list; filters are one-handed on a phone.
**See at the end:** on the phone, filter to one product and one manager; a manager opening the app sees only their list.
**Test before done:**
- Each filter's result set matches the same query run directly against the database.
- Both filters combined return the correct intersection.
- Clearing filters returns to the morning view.
- Phone check.
**Cut candidate:** the product filter (keep handler filtering and the own-list) if the week slips.

### Step 6. Totals that tell the truth
**Estimate: 1 half-day.**
**Build:** the totals band follows the active filter (on-screen totals plus the permitted company total), and shows the overdue/upcoming split and the record count.
**See at the end:** change a filter on the phone and watch the totals band change to match.
**Test before done:**
- Filtered totals equal a hand sum for that filter.
- The company total is identical regardless of which filter is applied.
- Phone check.
**Decision landing here:** D5 (which totals exist).
**Cut candidate:** the filtered-totals refinement (keep one company total plus the on-screen count).

**Phase 2 exit criteria:**
- [ ] The default morning view ranks a hand-checked fixture correctly.
- [ ] Overdue and upcoming are visually distinct.
- [ ] Handler and product filters return correct sets, alone and combined.
- [ ] A manager's default view is their own list; the owner's is complete.
- [ ] Filtered totals match a hand sum, and the company total is filter-independent.
- [ ] Every item above is confirmed on a phone.

---

## Phase 3 - Acting on the board

### Step 7. Log a call or a visit
**Estimate: 1.5 half-days.**
**Build:** from a record, log an activity: type (call or visit), date, and a short note. Activities are appended, never overwritten; the actor and the timestamp are recorded.
**See at the end:** on the phone, tap a record, log a call, and see the activity recorded against that record.
**Test before done:**
- The stored activity has the right actor, type, date and timestamp.
- Submitting with no type, or no date, is rejected with a clear reason and **saves nothing**.
- A manager cannot log against another manager's record unless the client's C7 answer allows it; test and paste the refusal.
- Phone check.
**Decision landing here:** D6 (the board is where activity is recorded) and C7 (who may log on whose record).
**Cut candidate:** none. This is the action the PRD is built around.

### Step 8. The totals move on save
**Estimate: 1 half-day.**
**Build:** the save returns the recomputed totals and the record's new state in the same response; the screen updates with no manual refresh.
**See at the end:** on the phone, log a call and watch the row's state and the top totals change immediately.
**Test before done:**
- Totals before and after match a direct query.
- Measure and write down the number: time from tapping save to updated totals on screen.
- Simulate a failed save; confirm nothing is left half-updated and the user sees a clear error.
- Phone check.
**Decision landing here:** D5 immediacy (PRD C6).
**Cut candidate:** none. Without this the board is a report, not a follow-up tool.

### Step 9. A record's history
**Estimate: 1 half-day.**
**Build:** each record shows its calls and visits in order, newest first.
**See at the end:** open a record on the phone and read its history.
**Test before done:**
- History matches the activity table exactly, in order.
- Older entries cannot be edited from the screen.
- Phone check.
**Cut candidate: first thing cut** if the week slips; logging still works and the history is readable in the database.

**Phase 3 exit criteria:**
- [ ] A call or a visit can be logged from a phone.
- [ ] An activity missing its type or date is rejected and saves nothing.
- [ ] Totals and row state change on save, without a refresh, and match the database.
- [ ] The measured save-to-updated time is written down.
- [ ] A record's history shows in order and is append-only.

---

## Phase 4 - Real data, edges, handover

### Step 10. Import the client's lists
**Estimate: 1.5 half-days.**
**Build:** a repeatable import of the client's renewals, loans and leads, plus an exceptions report: missing due date, missing amount, unassigned handler, unknown product.
**See at the end:** the phone shows the client's real records on the board, and an exceptions list of what needs fixing.
**Test before done:**
- Imported count matches the source count.
- The exceptions list matches the known gaps (verify against the source).
- Running the import a second time does not duplicate records.
- Phone check.
**Cut candidate:** none. "Every record" is the promise; importing the real data is the point.

### Step 11. Fix the gaps on the phone
**Estimate: 1 half-day.**
**Build:** each exception links to its record, where the missing due date, amount or handler can be set; an empty required field is rejected.
**See at the end:** fix a record's missing amount on the phone; it leaves the exceptions list and enters the totals.
**Test before done:**
- Setting a value updates the totals.
- An empty value is rejected and saves nothing.
- Phone check.
**Cut candidate:** cut second; replace with a one-off cleanup of the source data before importing.

### Step 12. Production pass and handover
**Estimate: 1 half-day.**
**Build:** move to the paid plans, enable backups and the pooled connection, add an uptime check, and write a one-page "how to use this" for the client (URL, sign-in, the morning flow).
**See at the end:** on a real handset over the client's network, sign in and walk the whole morning flow end to end; the handover page opens too.
**Test before done:**
- A full pass on a real handset, not an emulator, over the client's network.
- Backups are on; the live URL responds.
- The handover page opens on the phone.
- Phone check.
**Note:** this is the one step whose "build" is mostly config. It still ends in a screen - the real-device pass - which is why it is allowed here.

**Phase 4 exit criteria:**
- [ ] The client's real records appear on the board, and the import is repeatable without duplicates.
- [ ] The exceptions list matches the known gaps in the source data.
- [ ] Gaps can be fixed on the phone and the fix changes the totals.
- [ ] The full morning flow passes on a real handset over the client's network.
- [ ] Backups are on and the handover page exists.

---

## Decisions most expensive to reverse, and where they happen

| Decision | Where in the order | Why it sits there |
|---|---|---|
| **Tenancy** - one agency or many (D1) | Day 0, before step 1 | Adds a scope column to every table. Retrofitting it with live data is the single most expensive migration in this design. |
| **Database region** | Step 2 | Changing region later moves the whole database. Choose the nearest India region at project creation. |
| **The record model** - amount at risk (D3) and due vs next-contact date (D4) | Step 2 | The schema is created here, before any feature depends on it and before real data exists. |
| **Identity and per-person access** - enforced in the database (D2) | Step 3 | Access rules are written once and every screen inherits them. A mistake found at step 9 would touch everything. |
| **The board as the place activity is recorded** (D6) | Step 7 | If this is wrong, activity ends up in two places and must be reconciled. |
| **Totals semantics and immediacy** (D5) | Step 8 | Cheap in code, but it is what the owner trusts each morning. |

**The single most expensive to reverse remains the one from `TECH-STACK.md`:** putting the records, the identities and the access rules in one managed platform under one tenancy model. Steps 1-3 are where it is committed, which is why they come first even though they show the least.

---

## What gets cut if the week slips (decided now)

Cut in this order, at the first slip, not at 2am on the last night:

1. **Step 9 - record history.** Logging still works; the history can be read from the database.
2. **Step 11 - fixing gaps on the phone.** Replace with a one-off cleanup of the source data before import.
3. **Step 6 - filtered totals.** Keep one company total plus the on-screen count.
4. **Step 5 - the product filter.** Keep handler filtering and the personal own-list, which is the PRD's actual need.
5. **Step 12 - written handover.** Keep the plan changes and the real-device pass; hand over in a short message instead.

**Never cut, at any slippage:**
- The day-0 tenancy decision and the schema (steps 1-2).
- Authentication and database-enforced per-person visibility (step 3). A board holding the client's data with no sign-in is not shippable.
- The morning ranking (step 4). It is the whole product.
- Activity logging and immediate totals (steps 7-8). Without them the board is a report.
- Importing the client's real data (step 10). "Every record" is the promise.

If the slip goes beyond the cut list, stop and re-cut with the client. Do not silently drop a never-cut item.

---

## Summary: what is demonstrable, and when

| Step | On a phone at the end you can see | Half-days |
|---|---|---|
| 1 | A live board shell with sample rows | 1 |
| 2 | Real rows and real totals from the database | 1.5 |
| 3 | Two users, two different correct lists; owner sees all | 2 |
| 4 | The morning list, ranked "who to chase first" | 1.5 |
| 5 | Filters by handler and product; own-list | 1 |
| 6 | Totals that follow the filter | 1 |
| 7 | A logged call or visit on a record | 1.5 |
| 8 | Totals that move the moment you save | 1 |
| 9 | A record's history | 1 |
| 10 | The client's real records plus an exceptions list | 1.5 |
| 11 | A gap fixed on the phone | 1 |
| 12 | The full morning flow on a real handset | 1 |
| | **Total** | **16 half-days = 8 working days** |

Plan inside a 10-working-day envelope, leaving 2 days of buffer before the cut list is needed.
