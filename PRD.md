# PRD - Renewal and Lead Follow-Up Board

**STATUS: DRAFT**
**Source received:** one paragraph from you ("My idea"). No interview Q&A transcript was supplied, so the only client wording available is that paragraph. Where the paragraph is silent, I have assumed and flagged it.

> **READ THE UNRESOLVED CONTRADICTIONS FIRST (section 2).** They can each change the scope. This document is not settled until the client decides each one. I have not decided any of them for you.

**This document answers exactly one question: what are we building, and for whom.** It does not answer how. No technology names appear anywhere in it.

---

## Unresolved contradictions - read these first

- **C1** "Every policy renewal, loan file and cold lead" (company-wide) vs "each person sees only their own list" (personal). Whose "everything" is it?
- **C2** "The amount at risk" across three record types that may each mean a different amount, and cold leads may have none.
- **C3** "Logging a call or a visit updates the totals at the top" - a call does not change money, so which "totals" actually move?
- **C4** A cold lead has no real due date; it has a next-contact date. Is "due date" one field for all three types?
- **C5** "One screen" vs "every" record - a complete list cannot literally all fit on one screen.
- **C6** "Straight away" (immediate) vs "opens this page each morning" (once a day). Which is the real requirement?
- **C7** Who may log activity on whose records, given that each person sees only their own list.

---

## 1. What was said, and what it means for the build

Each client phrase is quoted, then translated into what it implies.

**"Renewal and lead follow-up board"**
Implies a working surface used to act, not a report that is read and closed. "Board" implies items arranged by state and urgency, changing over time. It implies one agreed place replacing scattered personal lists.
*[ASSUMPTION A1: today these records live in more than one place, and the client wants one place.]*

**"One screen of every policy renewal, loan file and cold lead"**
Implies three different kinds of thing - insurance renewals, loan files and cold leads - shown together. That forces one shared shape across records whose natures differ. The word "every" implies completeness: if a record is missing, the owner's morning decision is wrong, so completeness is a real requirement, not a nice-to-have. "One screen" implies the whole picture is visible without hunting through menus.
*[ASSUMPTION A2: the records exist and can be supplied; this document does not assume from where.]*

**"with its due date"**
Implies every record carries a deadline and the deadline drives priority. Implies overdue and upcoming are distinct states, and that sorting by date is expected.
*[ASSUMPTION A3: due dates are maintained by hand today.]*

**"the person handling it"**
Implies exactly one accountable person per record. Implies a roster of handlers exists and that a record's handler can change. Implies per-person grouping.
*[ASSUMPTION A4: one handler per record, not a team.]*

**"and the amount at risk"**
Implies the client measures exposure in money and wants to prioritise by it. Implies one money figure per record and totals of that figure. It implies the client believes revenue is quietly leaking through missed follow-up. For a cold lead the amount may be an estimate or nothing.
*[ASSUMPTION A5: a single money figure per record, in one currency. See C2 for the cold-lead case.]*

**"Logging a call or a visit updates the totals at the top straight away"**
Implies staff will record activity here rather than elsewhere. "A call or a visit" implies at least two activity types. "Straight away" implies the summary numbers refresh the moment the activity is saved, with no separate step. "The totals at the top" implies a summary band the client already pictures - but the client never said which totals.
*[ASSUMPTION A6: an activity is a call or a visit, with a date and a short note. See C3 for which totals move.]*

**"The owner opens this page each morning and sees who to chase first"**
Implies a daily ritual and one primary user at the start of the day. "Who to chase first" implies a default ranking that answers a priority question, not a raw list. Implies the owner should not have to filter or search each morning; the default view must already be the answer.
*[ASSUMPTION A7: default order is overdue first, then soonest due, then largest amount at risk.]*

**"Filter by relationship manager or by product so each person sees only their own list"**
Implies two grouping dimensions: person and product. Implies a relationship-manager role and a product taxonomy. "Each person sees only their own list" implies visibility restrictions, which is in direct tension with "every" above (C1). Implies one board serves both a company view and personal views.
*[ASSUMPTION A8: a small, fixed product list exists and is shared across loans and insurance. ASSUMPTION A9: a relationship-manager roster exists.]*

---

## 2. What does not add up

Each item below is a genuine tension in the source. For each, the decision is yours. I have not picked a side.

**C1. "Every ... record" vs "each person sees only their own list."**
The owner's morning decision needs a complete company picture. Per-person visibility needs each viewer scoped down. These can both hold only if the view changes with the viewer.
*Decision you must make: does "every" mean the owner sees all records while others see scoped lists, or does everyone, including the owner, see only their own slice? This also decides what "totals at the top" means to each kind of viewer.*

**C2. "The amount at risk" across three record types.**
A policy renewal has a renewal value. A loan file has a loan amount. A cold lead may have no amount at all.
*Decision you must make: is "amount at risk" one money field with a stated rule for records with no amount (including whether zero or unknown is allowed), or does each record type carry its own money meaning shown under one shared heading? This decides whether a single "total at risk" number is honest.*

**C3. "Logging a call or a visit updates the totals at the top straight away."**
A call or a visit does not change how much money is at risk. It changes activity and next action.
*Decision you must make: do the top totals include activity counts, money at risk, or both, and which of those is a logged call or visit allowed to move? Without this, the totals can mislead the owner.*

**C4. "Due date" on a cold lead.**
A cold lead has no contractual deadline; it has a next-contact date. Renewals and loans have real deadlines.
*Decision you must make: does every record carry the same "due date" field, or do cold leads use a separate next-contact date while renewals and loans use a real deadline? This changes what "overdue" means and how the priority ranking treats leads.*

**C5. "One screen" vs "every policy renewal, loan file and cold lead."**
A complete company list cannot literally all sit on one screen once the list is real.
*Decision you must make: does "one screen" mean a single page with filters and a summary, accepting some scrolling, or does it mean everything visible at once with a hard limit on how many records are shown?*

**C6. "Straight away" vs "opens this page each morning."**
Instant reflection of a logged call is asked for, but the stated use is once each morning.
*Decision you must make: is immediate reflection a firm requirement, or is "by the next morning" acceptable? The first costs meaningfully more than the second.*

**C7. Who logs activity on whose records.**
"Logging a call or a visit" plus "each person sees only their own list" implies each person logs their own. The owner may also want to log or correct anything.
*Decision you must make: may a person log activity only on records they handle, or may roles above them log on anyone's record? This drives who can do what.*

---

## 3. Who this is for

*[ASSUMPTION A10: the roles below exist in the client's agency. A real client would have named them.]*

**The owner / principal** (also the buyer, and the primary daily user)
Wants to open one page each morning and, in about a minute, know which relationships are at risk and who is not on top of them. Wants a trustworthy total of money at risk. Wants to stop revenue leaking through missed follow-up without chasing people for updates.

**The relationship manager** (the "person handling it")
Wants a short personal list of who to call or visit today, in priority order. Wants their effort to be visible when they log a call or a visit. Does not want to enter the same thing twice, and does not want the board to feel like surveillance.

**The renewals / back-office coordinator**
Wants to be certain no renewal date is missed and that due dates and amounts are accurate. Wants the exceptions - missing dates, missing amounts, unassigned records - surfaced rather than hidden.

**The product / line lead** (loans versus insurance)
Wants to see the pipeline and exposure for one product only, and to compare across handlers without seeing other products.
*[ASSUMPTION A11: a product-level viewer exists beyond the owner.]*

**The person who keeps the records today**
Wants to stop maintaining several scattered lists and keep one accurate set that everyone trusts.
*[ASSUMPTION A12: someone is currently responsible for keeping these records current.]*

---

## 4. Scope, locked

In scope for the board:

- One board showing policy renewals, loan files and cold leads together.
- On each record: its type, the customer or lead it belongs to, the product, the due date, the person handling it, the amount at risk, and its status.
- A summary band at the top holding the totals. *[ASSUMPTION A13: the band shows at least a count and a total amount at risk, split by record type and by overdue versus upcoming. Exact totals are subject to C1 and C3.]*
- A default morning view that answers "who to chase first." *[ASSUMPTION A7 covers the order.]*
- Filter by relationship manager.
- Filter by product.
- A personal view so each person sees only their own list. *[Subject to C1 and C7.]*
- Log an activity against a record: a call or a visit, with a date and a short note.
- Totals refresh immediately after an activity is logged. *[Subject to C3 and C6.]*
- An overdue versus upcoming distinction driven by the due date. *[Subject to C4.]*

*[ASSUMPTION A14: the list above is the minimum field set; the client has not supplied a full field list.]*

---

## 5. Not building, and why

This section is what you read back to the client. Each exclusion has a reason tied to the source.

- **How records are first created or collected.** The source describes seeing, filtering and logging activity. It does not describe creating records. Whether the board creates and edits records is itself undecided (see C1-C7 and Open Dependencies).
- **Reminders, alerts or notifications to staff or customers.** The stated mechanism is the owner's morning scan, not alerts. Not requested.
- **Customer, partner or external access.** The source describes internal people only ("the owner", "each person").
- **Documents or files attached to a record.** Not mentioned.
- **Commission, incentive or payout calculations.** Not mentioned.
- **Scoring or appraising relationship managers.** Filtering by handler is for scoping a list, not ranking people. Not requested.
- **Automatic chasing, auto-calling or automatic messages.** "Logging a call or a visit" implies a human acts. Not requested.
- **Financial reporting, accounting or books.** The totals are for prioritisation, not for accounts. Not requested.
- **Branch or region views.** Only two filters were named: person and product. *[ASSUMPTION A15: no branch or region dimension is needed for the first version.]*
- **Offline or printed output.** The source says "one screen" opened each morning.
- **Bulk actions across many records.** Not mentioned.

---

## 6. Phasing

What ships first, what waits. *[This phasing depends on the decisions in C1-C7 and may change once they are made.]*

**Phase 1 - See the board**
The single view of renewals, loan files and cold leads with due date, handler, product and amount at risk; the summary totals; the default "who to chase first" order; filters by handler and product; the personal own-list view. This proves the core value: the owner's morning answer.

**Phase 2 - Act on the board**
Logging a call or a visit against a record, with date and note, and the totals updating immediately after. This proves the follow-up loop, not just the view.

**Phase 3 - Keep it trustworthy, then extend**
Per-record activity history; correcting and editing records and their fields; handling missing dates and missing amounts; keeping the handler and product lists current; then whatever the client adds after using it.

*[ASSUMPTION A16: if the client insists on immediate totals from day one, Phase 2 is pulled into Phase 1 and something else moves out.]*

---

## 7. Success metrics

*Every figure below is proposed, not supplied. A real client would set the targets and provide baselines. [ASSUMPTION A17: the client can supply a pre-board baseline for each metric.]*

- The owner opens the board on at least 18 of 20 working mornings in the first month.
- 100% of active renewals, loan files and cold leads appear on the board, checked against the client's own list.
- After the first clean-up, zero records have a missing handler or a missing due date.
- At least 90% of records due in the next seven days have a logged call or visit within that period.
- Missed or overdue renewals fall by at least 20% against the pre-board baseline within the first 90 days.
- Time from opening the board to identifying the first five priorities is under one minute.
- A logged activity is reflected in the top totals within five seconds.
- At least 80% of relationship managers have a logged activity in a normal week.

---

## 8. Open dependencies

What you are waiting on from someone else:

- A signed agreement or, at minimum, written confirmation of scope.
- The source list of renewals, loan files and cold leads, with the fields we need, and the name of who owns that list.
- A written definition of "amount at risk" for each of the three record types, including the rule for records with no amount. (See C2.)
- The product list. *[ASSUMPTION A8.]*
- The relationship-manager roster. *[ASSUMPTION A9.]*
- The rule for cold leads that have no real deadline. (See C4.)
- Decisions on C1 through C7.
- Baseline numbers for every metric in section 7. *[ASSUMPTION A17.]*
- Written confirmation of who may see and change what. (See C1 and C7.)
- A named person on the client side responsible for data accuracy and for answering questions.
- Confirmation that daily use is genuinely expected, so adoption can be measured.

---

## Assumptions (full list)

Every place this document had to assume something a real client would have told us.

- **A1** The records currently live in more than one place, and the client wants them in one place.
- **A2** The records already exist and can be supplied; this document does not assume from where.
- **A3** Due dates are maintained by hand today.
- **A4** Exactly one handler is accountable per record, not a team.
- **A5** "Amount at risk" is a single money figure per record, in one currency. The no-amount case is unresolved (C2).
- **A6** An activity is a call or a visit, with a date and a short note.
- **A7** The default priority order is overdue first, then soonest due, then largest amount at risk.
- **A8** A small, fixed product list exists and is shared across loans and insurance.
- **A9** A relationship-manager roster exists.
- **A10** The roles in section 3 (owner, relationship manager, renewals coordinator, product lead, record keeper) exist in the client's agency.
- **A11** A product-level viewer exists beyond the owner.
- **A12** Someone is currently responsible for keeping these records current.
- **A13** The summary band shows at least a record count and a total amount at risk, split by record type and by overdue versus upcoming.
- **A14** The field list in section 4 is the minimum; the client has not supplied a full field list.
- **A15** No branch or region dimension is needed in the first version.
- **A16** If immediate totals are demanded from day one, Phase 2 moves into Phase 1 and something else moves out.
- **A17** The client can supply a pre-board baseline for each success metric, and will set the actual targets.
- **A18** The client's team can reach the board on a computer each morning.
- **A19** The working language of the board is English.
- **A20** This summary is a faithful condensation of the client's words, and no fuller interview Q&A exists. If a transcript exists, the quotes and translations in section 1 must be re-checked against it.
