#!/usr/bin/env node
"use strict";

/*
 * RenewLoop daily news digest.
 * For: loan and insurance distribution agencies / brokers, and their SME owners
 *      and ops managers who run monthly numbers on spreadsheets.
 * Plain Node only (built-ins, no packages). Run it with:  node digest-agent.js
 *
 * It reads key.txt in this same folder. If the key starts with "sk-or-" the
 * summaries go to OpenRouter; otherwise they go to DeepSeek. No key means the
 * digest still gets written, with a clear note saying why the summaries are
 * missing.
 */

// ============================================================================
// MODEL  <-- change this one line to switch models.
const MODEL = "deepseek-flash";
// ============================================================================

// ============================================================================
// NEWS EDITION  <-- which Google News edition (market) to ask.
// You chose "all over world". Google News has no literal world edition, so this
// is its default worldwide English edition (US). For the India/Thane-Mumbai
// edition instead, change the value to:  hl=en-IN&gl=IN&ceid=IN:en
const NEWS_EDITION = "hl=en-US&gl=US&ceid=US:en";

// Trade words for "loan and insurance distribution agencies and brokers".
const NEWS_QUERY = '("insurance broker" OR "insurance agents" OR "loan agents" OR "loan distribution")';
// ============================================================================

// ============================================================================
// EMAIL  <-- change these two lines.
// The address the digest is sent to, and the Composio user_id your Gmail is
// connected under. The Composio key itself is read from composio-key.txt.
const RECIPIENT_EMAIL = "you@example.com";
const COMPOSIO_USER_ID = "your_composio_user_id";
// ============================================================================

const fs = require("fs");
const path = require("path");

const FOLDER = __dirname;
const KEY_FILE = path.join(FOLDER, "key.txt");
const COMPOSIO_KEY_FILE = path.join(FOLDER, "composio-key.txt");
const OUT_FILE = path.join(FOLDER, "digest.html");
const MAX_STORIES = 5;

const COMPOSIO_ENDPOINT = "https://backend.composio.dev/api/v3/tools/execute/GMAIL_SEND_EMAIL";

const TRADE = "loan and insurance distribution agencies and brokers";
const AUDIENCE = "SME agency owners and their ops managers who run monthly numbers on spreadsheets";

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------
function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(ms) {
  if (!ms) return "date unknown";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

// ---------------------------------------------------------------------------
// Google News RSS
// ---------------------------------------------------------------------------
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const rawTitle = tag(b, "title");
    if (!rawTitle) continue;
    const source = tag(b, "source");
    const link = tag(b, "link");
    const pubDate = tag(b, "pubDate");
    let title = rawTitle;
    if (source && title.endsWith(" - " + source)) {
      title = title.slice(0, title.length - source.length - 3).trim();
    }
    const parsed = Date.parse(pubDate);
    items.push({ title, source, link, pubDate, ms: Number.isNaN(parsed) ? 0 : parsed });
  }
  return items;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 9)
      .join(" ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function fetchNews() {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(NEWS_QUERY)}&${NEWS_EDITION}`;
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RenewLoopDigest/1.0)" },
  });
  const xml = await res.text();
  if (!res.ok) throw new Error(`Google News returned HTTP ${res.status}`);
  const items = dedupe(parseRss(xml));
  items.sort((a, b) => b.ms - a.ms);
  return items.slice(0, MAX_STORIES);
}

// ---------------------------------------------------------------------------
// AI summaries
// ---------------------------------------------------------------------------
function extractArray(content) {
  let s = String(content).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a === -1 || b === -1 || b < a) return null;
  try {
    const arr = JSON.parse(s.slice(a, b + 1));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

async function callAI(provider, key, items) {
  const endpoint =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.deepseek.com/v1/chat/completions";

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://renewloop.in";
    headers["X-Title"] = "RenewLoop Daily Digest";
  }

  const lines = items
    .map((it, i) => `${i + 1}. ${it.title} — (${it.source || "source unknown"}, ${fmtDate(it.ms)})`)
    .join("\n");

  const user =
    `You write a short daily digest for ${AUDIENCE}.\n` +
    `For each numbered news item about ${TRADE}, write exactly two one-sentence lines:\n` +
    `  "what"  = what happened.\n` +
    `  "means" = what it means for the reader's business.\n` +
    `Return ONLY a JSON array in the same order, one object per item: ` +
    `[{"what":"...","means":"..."}]. No markdown, no extra text.\n\nNews items:\n${lines}`;

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: "You reply with strict JSON only, no markdown." },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    stream: false,
  };

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    return { ok: false, reason: `${provider} request failed (${e.message})` };
  }

  const text = await res.text();
  if (!res.ok) {
    let detail = "";
    try {
      const j = JSON.parse(text);
      detail = (j.error && (j.error.message || j.error.type)) || "";
    } catch {
      /* ignore */
    }
    return { ok: false, reason: `${provider} returned HTTP ${res.status}${detail ? ": " + detail : ""}` };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: `${provider} reply was not JSON` };
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content || !String(content).trim()) {
    return { ok: false, reason: `${provider} returned an empty reply (the AI refused)` };
  }

  const arr = extractArray(content);
  if (!arr) return { ok: false, reason: `${provider} reply was not the expected JSON list` };
  return { ok: true, arr };
}

// ---------------------------------------------------------------------------
// render + save
// ---------------------------------------------------------------------------
function render(items, notice) {
  const head = `Daily digest — ${TRADE}`;
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const rows = items
    .map((it) => {
      const link = it.link ? `<a href="${esc(it.link)}">${esc(it.title)}</a>` : esc(it.title);
      const meta = `${esc(it.source || "source unknown")} · ${esc(fmtDate(it.ms))}`;
      const bodyHtml =
        it.what && it.means
          ? `<p class="what"><span>What happened:</span> ${esc(it.what)}</p>\n      <p class="means"><span>What it means:</span> ${esc(it.means)}</p>`
          : `<p class="missing">Summary missing for this story.</p>`;
      return `    <article>\n      <h2>${link}</h2>\n      <p class="meta">${meta}</p>\n      ${bodyHtml}\n    </article>`;
    })
    .join("\n");

  const noticeHtml = notice ? `    <p class="notice">${esc(notice)}</p>\n` : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(head)}</title>
<style>
  body { font: 16px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 16px; color: #1a1a1a; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .stamp { color: #666; font-size: 13px; margin-top: 0; }
  .notice { background: #fff4e5; border: 1px solid #f0b46b; padding: 10px 12px; border-radius: 6px; font-weight: 600; }
  article { border-top: 1px solid #e5e5e5; padding: 16px 0; }
  h2 { font-size: 18px; margin: 0 0 4px; }
  h2 a { color: #0b57d0; text-decoration: none; }
  .meta { color: #666; font-size: 13px; margin: 0 0 8px; }
  .what, .means { margin: 4px 0; }
  .what span, .means span { font-weight: 600; }
  .missing { color: #999; font-style: italic; }
</style>
</head>
<body>
  <h1>${esc(head)}</h1>
  <p class="stamp">Generated ${esc(stamp)} · model ${esc(MODEL)} · edition ${esc(NEWS_EDITION)}</p>
${noticeHtml}${rows}
</body>
</html>
`;

  fs.writeFileSync(OUT_FILE, html, "utf8");

  console.log("");
  console.log(head);
  console.log(`Generated ${stamp} | model ${MODEL}`);
  if (notice) console.log("!! " + notice);
  console.log("");
  if (items.length === 0) console.log("(no stories)");
  items.forEach((it, i) => {
    console.log(`${i + 1}. ${it.title}`);
    console.log(`   ${it.source || "source unknown"} · ${fmtDate(it.ms)}`);
    console.log(`   ${it.link}`);
    if (it.what && it.means) {
      console.log(`   What happened: ${it.what}`);
      console.log(`   What it means: ${it.means}`);
    } else {
      console.log("   Summary missing for this story.");
    }
    console.log("");
  });
  console.log(`Saved: ${OUT_FILE}`);
  return html;
}

// ---------------------------------------------------------------------------
// email the same digest through Composio (Gmail)
// ---------------------------------------------------------------------------
async function sendEmail(html) {
  if (!fs.existsSync(COMPOSIO_KEY_FILE)) {
    console.log(
      `Email is off: ${path.basename(COMPOSIO_KEY_FILE)} was not found in ${FOLDER}. ` +
        `Paste your ak_... Composio key there to turn email on.`
    );
    return false;
  }
  const composioKey = fs.readFileSync(COMPOSIO_KEY_FILE, "utf8").trim();
  if (!composioKey) {
    console.log(
      `Email is off: ${path.basename(COMPOSIO_KEY_FILE)} is empty. ` +
        `Paste your ak_... Composio key there to turn email on.`
    );
    return false;
  }

  const subject = `Daily digest — ${TRADE} — ${new Date().toISOString().slice(0, 10)}`;
  const payload = {
    user_id: COMPOSIO_USER_ID,
    version: "latest",
    arguments: {
      recipient_email: RECIPIENT_EMAIL,
      subject,
      body: html,
      is_html: true,
    },
  };

  let res;
  try {
    res = await fetch(COMPOSIO_ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": composioKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    console.log(`Email failed: the Composio request could not be sent (${e.message}).`);
    process.exitCode = 1;
    return false;
  }

  const raw = await res.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* non-JSON reply */
  }

  const successful = !!(json && (json.successful === true || (json.data && json.data.successful === true)));
  if (successful) {
    console.log(`Email sent to ${RECIPIENT_EMAIL} via Composio (successful=true).`);
    return true;
  }

  let err = "no error field in the reply";
  if (json && json.error !== undefined && json.error !== null) err = JSON.stringify(json.error);
  else if (json && json.data && json.data.error !== undefined && json.data.error !== null) err = JSON.stringify(json.data.error);
  else if (!json) err = `HTTP ${res.status}, non-JSON reply: ${raw}`;
  console.log(
    `Email failed: Composio did not report success. ` +
      `successful=${json ? JSON.stringify(json.successful) : "missing"}; error=${err}`
  );
  process.exitCode = 1;
  return false;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const notes = [];

  let key = "";
  if (fs.existsSync(KEY_FILE)) {
    key = fs.readFileSync(KEY_FILE, "utf8").trim();
    if (!key) notes.push("key.txt is empty");
  } else {
    notes.push("key.txt was not found in " + FOLDER);
  }

  let stories = [];
  let newsError = "";
  try {
    stories = await fetchNews();
  } catch (e) {
    newsError = e.message;
  }

  if (stories.length === 0) {
    const html = render([], `News could not be fetched (${newsError || "no stories came back"}, so today's digest has no stories).`);
    await sendEmail(html);
    return;
  }

  let summaries = null;
  if (key) {
    const provider = key.startsWith("sk-or-") ? "openrouter" : "deepseek";
    console.log(`Summaries requested from ${provider} with model "${MODEL}".`);
    const r = await callAI(provider, key, stories);
    if (r.ok) summaries = r.arr;
    else notes.push(r.reason);
  }

  const items = stories.map((it, i) => {
    const s = summaries && summaries[i] && typeof summaries[i] === "object" ? summaries[i] : null;
    return { ...it, what: s && s.what ? String(s.what) : "", means: s && s.means ? String(s.means) : "" };
  });

  const anyMissing = items.some((it) => !it.what || !it.means);
  if (summaries && anyMissing) notes.push("the AI did not return two lines for every story");

  const notice = anyMissing
    ? "Summaries are missing: " + (notes.length ? notes.join("; ") : "the AI returned incomplete output") + "."
    : "";

  const html = render(items, notice);
  await sendEmail(html);
}

main().catch((e) => {
  console.error("Digest failed:", e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
