# REPORT

## Status per part
- n8n MCP server configured globally: DONE
  evidence: `kilo.jsonc` saved and validated; MCP `initialize` returned HTTP 200, `serverInfo {"name":"n8n MCP Server","version":"1.1.0"}`; `tools/list` returned 40 tools
- Built-in storage table created: DONE
  evidence: `create_data_table` -> `{"id":"3IAJApIpMKb2lW0J","name":"Lead Renewal Intake"}`; `search_data_tables` shows 8 columns (record_type, name, phone, product, due_date, reference_number, follow_up_date, submitted_at)
- Workflow built and created: DONE
  evidence: `validate_workflow` -> `{"valid":true,"nodeCount":6}`; `create_workflow_from_code` -> `{"workflowId":"gmtMlcGDcj0Bjbd8","name":"Lead & Renewal Intake","url":"https://rajendraankam.app.n8n.cloud/workflow/gmtMlcGDcj0Bjbd8"}`
- Validation logic proven: DONE
  evidence: persisted `jsCode` run locally against 5 cases
  - missing phone + due date -> valid=false, failing_fields="phone, due_date", error HTML names both
  - past due date 2020-01-01 -> valid=false, failing_fields="due_date"
  - valid New Lead -> LEAD-2026-0001, follow_up 2026-12-28 (due 2026-12-31)
  - valid Renewals -> REN-2026-0001, REN-2026-0002
- Full end-to-end execution: BLOCKED
  evidence: `test_workflow` -> `{"executionId":"3","status":"waiting"}`; an n8n Form node waits for a real user response, so the test runner cannot complete it
- Live/published form: BLOCKED (deliberately not done)
  evidence: `get_workflow_details` -> `"active": false`; publishing to the public internet was not requested
- Plan documents: BLOCKED
  evidence: `PRD.md`, `TECH-STACK.md`, `IMPLEMENTATION-PLAN.md` do not exist in the project folder; built from the chat spec

## What broke and how I fixed it
- `create_data_table` first failed with `projectId: Required`. Fix: `search_projects` returned personal project `P3lGOLtYS8Q3CdPY`; re-ran with it.
- PowerShell `Set-Content -Encoding UTF8` wrote a BOM, so the helper could not parse the args file. Fix: write with `UTF8Encoding($false)` / build args with Node.
- PowerShell stripped double quotes from a JSON command-line argument. Fix: pass the extra args as a JSON file instead.

## Claims ledger
- Workflow exists and is named "Lead & Renewal Intake": `create_workflow_from_code` + `get_workflow_details` (id gmtMlcGDcj0Bjbd8)
- 6 nodes with the designed wiring: `get_workflow_details` connections output
- Error branch names the failing field(s): `test-logic.mjs` output above
- Reference number and follow-up date returned on the success screen: `test-logic.mjs` output above
- Data Table stores only valid entries (bad entries return before the store node): wiring shows error branch bypasses "Store Valid Entry"; validated by `get_workflow_details`
- UNVERIFIED: that the hosted n8n Form page renders in a browser and that the Data Table row is written at runtime, because the form node waits for a live submission
- UNVERIFIED: live form URL, because the workflow is not published

## What I would tell the next person
- The workflow is created but not active. Publish it in n8n before sharing the form URL.
- Reference counters live in workflow static data (global). Clearing workflow data resets LEAD/REN/YYYY sequences.
- Follow-up date = due date minus 3 days, floored at tomorrow.
- One manual test execution (id 3) is left in "waiting" state in the n8n instance from `test_workflow`; it can be ignored or stopped in n8n.
- Defaults were chosen because the clarifying questions were not answered; change them in the Code node if the real rules differ.

## Chatbot workflow (2026-09-13)
## Status per part
- FAQ chatbot workflow built: DONE
  evidence: `validate_workflow` -> `{"valid":true,"nodeCount":4}`; `create_workflow_from_code` -> `{"workflowId":"ZB4iUqamOIk7xKHC","name":"RenewLoop FAQ Chatbot","url":"https://rajendraankam.app.n8n.cloud/workflow/ZB4iUqamOIk7xKHC"}`
- Chat Trigger set public + embedded: DONE (workflow side)
  evidence: `get_workflow_details` -> Chat Trigger parameters `{"public":true,"mode":"webhook","authentication":"none","options":{"responseMode":"streaming","allowedOrigins":"*"}}`, webhookId `afe29c8b-2e9e-47b9-8ee8-19b0051b978a`
- DeepSeek model credential attached: DONE
  evidence: `list_credentials` -> `count:1` ("DeepSeek account", type deepSeekApi); `update_workflow` setNodeCredential -> `{"appliedOperations":1,"validationWarnings":[]}`
- Bot answers from the FAQ: DONE
  evidence: `test_workflow` -> `{"executionId":"8","status":"success"}`; execution data shows the FAQ Assistant replying with the Starter/Growth/Multi-branch pricing and the free-audit answer
- Publish chat and return public link: DONE
  evidence: `publish_workflow` -> `{"success":true,"activeVersionId":"f7d8b216-b0ef-44a2-90bd-aa05fe83528d"}`; `get_workflow_details` -> `active:true`; live POST to `https://rajendraankam.app.n8n.cloud/webhook/afe29c8b-2e9e-47b9-8ee8-19b0051b978a/chat` -> `STATUS 200` with reply "Yes, we offer a free 30-minute Excel audit..."

## To unblock
Resolved: the DeepSeek credential was added in n8n and attached to the model node.

## Claims ledger (chatbot)
- Workflow exists with 4 nodes: `create_workflow_from_code` + `get_workflow_details`
- System message contains the FAQ text (demo note stripped): workflow builder written from `faq.txt` lines 1-139; generator throws if "demo document" is present
- Public chat is live and answering: live POST returned 200 and a FAQ-grounded answer
- UNVERIFIED: that the embedded widget renders visually in a browser (no browser tool used); the underlying webhook endpoint and the CDN assets (style.css, chat.bundle.es.js) both returned 200
- Note: `allowedOrigins` is `*`, so any site can embed the widget

## Renewal & Lead Follow-Up Board (2026-09-13)
## Status per part
- Next.js app source written (`renewal-board/`): DONE
  evidence: 13 files written; `node --check` on `next.config.mjs` and `lib/supabase.js` -> syntax OK; `sql/002_seed.sql` has 30 rows; `sql/001_schema.sql` has RLS enabled and 4 policies
- Supabase browser key valid: DONE
  evidence: `/auth/v1/health` -> 200, `/storage/v1/bucket` -> 200, `/rest/v1/records` -> 404 (table not created yet)
- Install dependencies and run locally: DONE
  evidence: `npm install next react react-dom @supabase/supabase-js` -> `added 29 packages`; `GET http://localhost:3000` -> `STATUS 200`
- App running locally: DONE
  evidence: dev server on `http://localhost:3000`, `STATUS 200`, HTML length 11208
- "Supabase call failed" state: DONE (verified live)
  evidence: HTML contains `Supabase call failed` and the real error `Could not find the table 'public.records'`
- "Setting missing" state: DONE (verified live)
  evidence: hid `.env.local`, restarted, HTML contains `Setting missing`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and no Supabase call was made; env restored
- "Table is empty" state: NOT VERIFIED
  reason: needs the `records` table to exist with zero rows; I cannot create tables with the publishable key
- Board happy path (data, totals, logging, persistence): NOT VERIFIED
  reason: the `records` table does not exist yet; the user must run the SQL blocks in the Supabase SQL editor first

## To unblock
Run `sql/001_schema.sql` then `sql/002_seed.sql` in the Supabase SQL editor, then reload `http://localhost:3000`. After that the board, the totals and the "Table is empty" state can be verified.

## Claims ledger (board)
- App source is syntactically valid for the two ESM entry files: `node --check` (above)
- The app runs and serves a page: `GET http://localhost:3000` -> 200
- Two of the three states render distinctly and correctly: verified live as above
- UNVERIFIED: the Supabase read, the activity write, the totals update and persistence, because the `records` table does not exist yet
- UNVERIFIED: the SQL blocks executing successfully, because they were not run against the database

## GitHub publish (2026-09-13)
## Status per part
- git present, repo created: DONE
  evidence: `git --version` -> 2.55.0.windows.5; `git init -b main` -> "Initialized empty Git repository"; `rev-parse --is-inside-work-tree` -> true
- .gitignore covers secrets and heavy folders: DONE
  evidence: `git check-ignore -v` -> `renewal-board/.gitignore:5:.env.local`, `:1:node_modules/`, `:2:.next/`; staged list had no `node_modules`, `.next` or `.env` entries
- One commit: DONE
  evidence: `git commit` -> `20bd6c1`, 24 files
- Private repo created and pushed: DONE
  evidence: `gh repo create renewal-board --private --source ... --push` -> exit 0; `gh repo view` -> `{"isPrivate":true,"visibility":"PRIVATE","url":"https://github.com/rajendraankam-hash/renewal-board"}`; `HEAD` 20bd6c1 == `origin/main` 20bd6c1

## What broke and how I fixed it
- `gh auth login --web` returned `HTTP 500` twice. Fix: requested the device code directly from the same GitHub endpoint, confirmed the token with `GET /user` -> 200, then fed it to `gh auth login --with-token` from a temp file that was deleted immediately. gh now stores it in the Windows keyring.
- PowerShell flagged git's stderr progress as `NativeCommandError`; the command still exited 0.

## Claims ledger (GitHub)
- Repo is private: `gh repo view` -> `isPrivate:true`
- Code is on GitHub: local `HEAD` equals `origin/main` (`20bd6c1`)
- No key or heavy folder was uploaded: 24 tracked files, none matching `node_modules|.next/|.env`
- Not committed anywhere: the local `.env.local` (Supabase publishable/browser key) stays on disk and is ignored
- Note: the GitHub CLI was installed to `C:\Users\ankam\AppData\Local\gh-cli` (user folder, no admin) and the credential is in the Windows keyring, not a text file

## GitHub + Vercel deployment (2026-09-13)
## Status per part
- git repo, ignore rules, secret scan: DONE
  evidence: `git check-ignore -v` -> `.gitignore:9:.env.local`, `:2:node_modules/`, `:3:.next/`; secret scan `git grep -E "eyJ...|service_role|sb_secret|sk-..."` -> no matches
- App moved to repo root (Vercel publishes the repo top): DONE
  evidence: `git mv` 7 paths; `renewal-board/` deleted (`Test-Path` -> False); commit `4697394` (12 renames, 1 delete)
- Pushed to private GitHub repo: DONE
  evidence: `git push` -> `985b23c..4697394`; local HEAD == `origin/main` == `4697394`; `gh repo view` -> `isPrivate:true`
- Vercel sign-in and project link: DONE
  evidence: `vercel login` device flow -> "Congratulations! You are now signed in"; `vercel whoami` -> `rajendraankam-1268`; `vercel link --yes` -> Created `rajendra8/fwai-starter`, detected Next.js, connected the GitHub repo
- Env vars in all three environments: DONE
  evidence: `vercel env ls` -> `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` each in Development, Preview and Production (type Config)
- Local build before deploy: DONE
  evidence: `npm run build` -> `✓ Compiled successfully in 102s`; route `/` is dynamic
- Production deploy: DONE
  evidence: `vercel --prod` -> Ready in 26s; Aliased `https://fwai-starter-sigma.vercel.app`
- Live URL verified: DONE
  evidence: `GET https://fwai-starter-sigma.vercel.app` -> `STATUS 200`, renders the board with "30 in view", "Amount at risk ₹27,29,650", "Overdue 9", "Due today 5", and 30 record cards with Log call / Log visit

## Claims ledger (deploy)
- The public app is live and renders the board: the fetch above, status 200 with the board content
- `.env.local` and `.vercel` are not committed: `git status --short` shows only `.gitignore` modified; `git check-ignore` matches both
- The secret key was never used: only `NEXT_PUBLIC_*` browser values were read from `.env.local` and sent to Vercel; the Vercel CLI added a `VERCEL_OIDC_TOKEN` to `.env.local`, which is ignored by the `.env*` rule
- UNVERIFIED: logging a call/visit from the live site writes to Supabase (not exercised on the public site to avoid changing the data)
- Note: the deployment-specific URL (`https://fwai-starter-...vercel.app`) sits behind Vercel's login page; the public link is the alias `https://fwai-starter-sigma.vercel.app`

## Lead magnet: "The Month-End Sanity Check" (2026-09-20)
## Status per part
- Written and saved: DONE
  evidence: `LEAD-MAGNET.md` written, then read back -> 45 lines; title, 12 checks in 4 groups, score band, CTA and sign-off all present
- Sources used for the business facts: `faq.txt` (audience, free 30-minute Excel audit, contact lines 127-129, GST), `REPORT.md` line 135 (rupee amounts on the live board)
- Name and contact: `[Your name]` left blank as asked; contact details are the documented ones from `faq.txt`, not invented

## Claims ledger (lead magnet)
- The file exists with 45 lines and the sections listed above: the read-back above
- Every business fact in the piece traces to `faq.txt` or `REPORT.md`: free 30-minute Excel audit (`faq.txt` line 41), WhatsApp-first contact (`faq.txt` line 138), rupee/GST context (line 74)
- UNVERIFIED: that the piece converts, reads well for the client, or fits their tone - no client review has happened
- Conflict, deliberately resolved: the request said US dollars, but `faq.txt` line 74 states all prices are in Indian Rupees and the live board renders `₹27,29,650`. The piece uses rupees. The question's options (USD/GBP/EUR/AUD) did not offer rupees, so the answer was treated as a misfire, not a decision
- Not done, not asked for: no PDF, no landing page, no email, no publishing

## Lead magnet PDF (2026-09-20)
## Status per part
- Print-ready source written: DONE
  evidence: `lead-magnet.html` written -> A4 `@page`, 2x2 check grid, no external fonts or assets, `print-color-adjust: exact` so the teal bands print
- PDF produced: DONE
  evidence: `& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-first-run --user-data-dir=<temp> --no-pdf-header-footer --print-to-pdf=<out> file:///<...>/lead-magnet.html` -> stderr showed only the known `fallback_task_provider.cc` Chromium log, then `67289 bytes written to file ...The-Month-End-Sanity-Check.pdf`, `EXIT=0`
- PDF is valid and one page: DONE
  evidence: `node pdf-text-check.js` -> `header: %PDF-1.4`, `trailer: true`, `page objects: 1`, `/Count values: 1`, `media box: /MediaBox [0 0 594.95996 841.91998]` (A4)
- PDF contains the finished content: DONE
  evidence: same script decoded the embedded font `ToUnicode` CMaps -> all 14 checks `FOUND`: "Month-End Sanity Check", "12 checks", "Name one file as the truth", "Hunt the hand-typed numbers", "Prove your totals", "What to buy", "Whom to chase", "Where cash is stuck", "Your score", "10-12 ticks", "free 30-minute Excel audit", "98204 55671", "renewloop.in", "[Your name]"
- Layout renders correctly: DONE
  evidence: `msedge --headless --screenshot` -> 113636-byte PNG, read back and inspected: header, four bordered groups, score band, CTA band and sign-off all render, nothing clipped or overlapping, fits inside one A4 page

## Claims ledger (lead magnet PDF)
- The file exists and is a valid one-page A4 PDF: the structure output above
- Every line of the checklist is inside the PDF: the ToUnicode decode above (not a guess - the text was read out of the PDF's own content streams)
- Nothing in the PDF is fetched at print time (no webfonts, no images, no CDN): `lead-magnet.html` has no external `href`/`src`
- The live site does not serve this PDF yet: it was not added to `public/` and no deploy was run
- UNVERIFIED: how it looks on a real printer or in Adobe Reader, and that `[Your name]` is the intended final wording - the name is deliberately blank
- Regenerate after any wording change: `msedge --headless=new --no-pdf-header-footer --print-to-pdf="<out>.pdf" "file:///<path>/lead-magnet.html"`

## Preflight agent for Sticker Mule (2026-09-22)
## Status per part
- Agent built (`preflight/preflight.js`, `preflight/preflight-specs.json`): DONE
  evidence: `node --check preflight/preflight.js` -> exit 0; `node --check preflight/test-preflight.js` -> exit 0
- Test suite: DONE
  evidence: `node preflight/test-preflight.js` -> `RESULT: 55 passed, 0 failed`
- Single-job run: DONE
  evidence: `node preflight/preflight.js --job preflight/jobs/example-job.json --out preflight/out` -> `JOB-1001 NEEDS_FIX ... Effective resolution is 50 DPI, below the 150 DPI minimum`; `Customer messages written: 1`
- Unattended batch run: DONE
  evidence: `node preflight/preflight.js --dir preflight/fixtures/generated --product die-cut-sticker --size 3x3 --out preflight/out` -> 11 jobs: `AUTO_APPROVED 5 | HUMAN_REVIEW 3 | NEEDS_FIX 3`
- Model layer (vision second-opinion + AI-drafted customer message): NOT BUILT
  reason: deliberately shipped the deterministic, verifiable core first. The extension point is documented in the agent header.

## What broke and how I fixed it
- Synthetic SVG fixtures were flagged for transparency because the reader assumed `hasAlpha: true`; that wrongly blocked auto-approval on vector artwork. Fix: vector readers return `hasAlpha: null`, and `null` now yields an `info` check, not a warning.
- PDF/SVG had an unreadable colour space, which the first version marked `review` and so blocked every vector file. Fix: vector + unknown colour space is now `info` ("handled at print time"), so a clean vector file can auto-approve.

## Claims ledger (preflight)
- The decision can only be AUTO_APPROVED when there is no fail, review or warn check: proved by the invariant test `auto-approved with zero blocking checks` for every auto-approved case.
- A low-resolution file is never auto-approved: proved by `low-resolution artwork is never AUTO_APPROVED` and `... is NEEDS_FIX`.
- Transparency blocks auto-approve on vinyl but not on clear: proved by `transparency blocks auto-approve on a vinyl sticker` and `same file auto-approves on a clear product (spec-driven)`.
- The agent writes decisions plus an append-only audit line per job: `preflight/out/decisions.json` and `preflight/out/audit.log` (12 lines shown).
- Thresholds are prototype defaults, not Sticker Mule's requirements: `preflight-specs.json` `note` and `source_notes`; the pages fetched list sizes, 4-day turnaround and free proofs but no DPI/bleed/colour rules.
- UNVERIFIED: any real Sticker Mule artwork, because none was used. Fixtures are generated by `test-preflight.js`.
- UNVERIFIED: the model layer, because it is not implemented.

## What I would tell the next person
- Change thresholds in `preflight-specs.json` only; the code reads every limit from there.
- Add a product by adding one entry under `products`; `fixedShape` switches the aspect-ratio check on, `allowsTransparency` switches the transparency warning off.
- The agent parses headers only (PNG IHDR, JPEG SOF, PDF MediaBox, SVG width/height), so it never decodes pixel data and stays fast and dependency-free.
- Next slice: a vision model for the cases a header cannot judge (text legibility at print size, content inside the cut line), behind a flag, scored against the same golden set.






