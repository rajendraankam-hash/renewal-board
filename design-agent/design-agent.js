#!/usr/bin/env node
"use strict";

/*
 * Design agent - turns a customer brief into design variants, produces a proof
 * for approval, and only after approval runs order -> production -> ship ->
 * deliver. It refuses to order without an approval bound to the exact artwork,
 * and it hands off to the Preflight agent before ordering.
 *
 *   node design-agent/design-agent.js --brief design-agent/jobs/example-brief.json
 *   node design-agent/design-agent.js --approve A --by "Maya"
 *   node design-agent/design-agent.js --revise "make the tagline bigger"
 *   node design-agent/design-agent.js --status
 *
 * Plain Node built-ins. The default concept provider is local and deterministic.
 * A model provider can be enabled with --provider remote and an API key; it is
 * gated behind a key and falls back to local with a recorded note.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const child_process = require("child_process");

const AGENT = "design-agent/0.1.0";
const SELF_DIR = __dirname;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sha(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function loadSpecs(specsPath) {
  return JSON.parse(fs.readFileSync(specsPath || path.join(SELF_DIR, "design-specs.json"), "utf8"));
}

function readKey() {
  const env = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (env) return env.trim();
  try {
    return fs.readFileSync(path.join(SELF_DIR, "key.txt"), "utf8").trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// concept provider: decides layout, palette and copy for each variant
// ---------------------------------------------------------------------------

function pickPalette(brief, specs) {
  const names = Object.keys(specs.palettes);
  if (brief.palette && specs.palettes[brief.palette]) return brief.palette;
  const n = parseInt(sha(String(brief.text || brief.customer || "brand")).slice(0, 8), 16);
  return names[n % names.length];
}

function localConcepts(brief, specs) {
  const names = Object.keys(specs.palettes);
  const base = pickPalette(brief, specs);
  const startIdx = names.indexOf(base);
  const layouts = specs.layouts.slice(0, specs.policy.variantsPerRound);
  return layouts.map((layout, i) => ({
    id: String.fromCharCode(65 + i),
    layout,
    palette: names[(startIdx + i) % names.length],
    brand: brief.text || brief.customer || "Your brand",
    tagline: brief.tagline || "",
    source: "local",
  }));
}

function buildModelPrompt(brief, specs) {
  return [
    "You are a print designer. Return strict JSON only, no prose, no code fences.",
    `Return exactly ${specs.policy.variantsPerRound} objects, each with: id (A,B,C), layout (one of ${specs.layouts.join(", ")}), palette (one of ${Object.keys(specs.palettes).join(", ")}), brand (string), tagline (string, max 40 chars).`,
    `Product: ${brief.product}. Size: ${brief.ordered_width_in}x${brief.ordered_height_in} in. Quantity: ${brief.quantity}.`,
    `Customer brand text: ${JSON.stringify(brief.text || "")}. Tagline hint: ${JSON.stringify(brief.tagline || "")}. Notes: ${JSON.stringify(brief.notes || "")}.`,
  ].join("\n");
}

async function modelConcepts(brief, specs) {
  const key = readKey();
  if (!key) return { ok: false, reason: "no API key found (set DEEPSEEK_API_KEY or add design-agent/key.txt)" };
  const openrouter = key.startsWith("sk-or-");
  const url = openrouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.deepseek.com/chat/completions";
  const model = openrouter ? "deepseek/deepseek-chat" : "deepseek-chat";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildModelPrompt(brief, specs) }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });
    if (!res.ok) return { ok: false, reason: `model HTTP ${res.status}` };
    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return { ok: false, reason: "model did not return a JSON array" };
    const parsed = JSON.parse(match[0]);
    const valid = Array.isArray(parsed) && parsed.length > 0 && parsed.every((c) => specs.layouts.includes(c.layout) && specs.palettes[c.palette]);
    if (!valid) return { ok: false, reason: "model JSON failed validation" };
    return { ok: true, concepts: parsed.map((c, i) => ({ ...c, id: String.fromCharCode(65 + i), source: "model" })) };
  } catch (e) {
    return { ok: false, reason: `model call failed: ${e.message}` };
  }
}

async function buildConcepts(brief, specs, provider) {
  if (provider === "remote") {
    const r = await modelConcepts(brief, specs);
    if (r.ok) return { concepts: r.concepts, note: "concepts from model" };
    return { concepts: localConcepts(brief, specs), note: `model provider unavailable (${r.reason}); used local concepts` };
  }
  return { concepts: localConcepts(brief, specs), note: "concepts from local rules" };
}

// ---------------------------------------------------------------------------
// renderer: concept -> SVG, sized to the ordered print dimensions
// ---------------------------------------------------------------------------

function shapeBase(shape, vw, vh, bg) {
  if (shape === "circle") return `<circle cx="${Math.round(vw / 2)}" cy="${Math.round(vh / 2)}" r="${Math.round(Math.min(vw, vh) / 2)}" fill="${bg}"/>`;
  return `<rect x="0" y="0" width="${Math.round(vw)}" height="${Math.round(vh)}" fill="${bg}"/>`;
}

const FONT_FAMILY = "Arial, Helvetica, sans-serif";

function glyphFactor(weight) {
  return weight >= 700 ? 0.58 : 0.54;
}

function splitInto(words, n) {
  const total = words.reduce((a, w) => a + w.length, 0);
  const target = total / n;
  const out = [];
  let cur = [];
  let len = 0;
  for (let i = 0; i < words.length; i += 1) {
    cur.push(words[i]);
    len += words[i].length;
    const remainingWords = words.length - i - 1;
    const remainingGroups = n - out.length - 1;
    if (out.length < n - 1 && len >= target && remainingWords >= remainingGroups) {
      out.push(cur.join(" "));
      cur = [];
      len = 0;
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

function fitLines(text, maxWidth, maxFontSize, weight, maxLines) {
  const words = String(text == null ? "" : text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], fontSize: maxFontSize };
  const maxN = Math.min(maxLines, words.length);
  const f = glyphFactor(weight);
  let best = null;
  for (let n = 1; n <= maxN; n += 1) {
    const lines = splitInto(words, n);
    const longest = Math.max(...lines.map((l) => l.length));
    const size = Math.min(maxFontSize, maxWidth / Math.max(1, longest * f));
    best = { lines, fontSize: size };
    if (size >= maxFontSize * 0.55) break;
  }
  return best;
}

function textBlock(x, y, lines, fontSize, fill, weight, extra) {
  if (!lines.length) return "";
  const attrs = `fill="${fill}" font-family="${FONT_FAMILY}" font-size="${Math.round(fontSize)}" font-weight="${weight}" text-anchor="middle"${extra ? " " + extra : ""}`;
  const spans = lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : Math.round(fontSize * 1.18)}">${esc(l)}</tspan>`).join("");
  return `<text x="${x}" y="${Math.round(y)}" ${attrs}>${spans}</text>`;
}

function layoutContent(layout, c, vw, vh, pal) {
  const cx = Math.round(vw / 2);
  const S = Math.min(vw, vh);

  if (layout === "badge") {
    const avail = S * 0.7;
    const brand = fitLines(c.brand, avail, S * 0.14, 700, 2);
    const n = brand.lines.length || 1;
    const blockH = (n - 1) * brand.fontSize * 1.18;
    const firstY = vh * 0.44 - blockH / 2;
    const barY = firstY + blockH + brand.fontSize * 0.95;
    const tag = fitLines(c.tagline, avail, S * 0.055, 400, 1);
    return [
      `<circle cx="${cx}" cy="${Math.round(vh / 2)}" r="${Math.round(S * 0.44)}" fill="none" stroke="${pal.accent}" stroke-width="${Math.round(S * 0.018)}"/>`,
      textBlock(cx, firstY, brand.lines, brand.fontSize, pal.ink, 700),
      `<rect x="${Math.round(cx - S * 0.11)}" y="${Math.round(barY)}" width="${Math.round(S * 0.22)}" height="${Math.max(3, Math.round(S * 0.012))}" fill="${pal.accent}"/>`,
      textBlock(cx, barY + S * 0.085, tag.lines, tag.fontSize, pal.ink, 400),
    ].join("\n  ");
  }

  if (layout === "stack") {
    const avail = vw * 0.82;
    const brand = fitLines(c.brand, avail, S * 0.17, 800, 3);
    const n = brand.lines.length || 1;
    const blockH = (n - 1) * brand.fontSize * 1.18;
    const firstY = vh * 0.44 - blockH / 2;
    const tag = fitLines(c.tagline, avail, S * 0.062, 400, 1);
    const tagY = firstY + blockH + brand.fontSize * 1.05;
    return [
      textBlock(cx, firstY, brand.lines, brand.fontSize, pal.ink, 800),
      textBlock(cx, tagY, tag.lines, tag.fontSize, pal.accent, 400),
      `<rect x="${Math.round(cx - S * 0.26)}" y="${Math.round(tagY + S * 0.085)}" width="${Math.round(S * 0.52)}" height="${Math.max(3, Math.round(S * 0.01))}" fill="${pal.ink}" opacity="0.5"/>`,
    ].join("\n  ");
  }

  const avail = S * 0.66;
  const brand = fitLines(c.brand, avail, S * 0.12, 600, 2);
  const n = brand.lines.length || 1;
  const blockH = (n - 1) * brand.fontSize * 1.18;
  const firstY = vh * 0.52 - blockH / 2;
  const tag = fitLines(c.tagline, avail, S * 0.048, 400, 1);
  return [
    `<circle cx="${cx}" cy="${Math.round(vh * 0.4)}" r="${Math.round(S * 0.045)}" fill="${pal.accent}"/>`,
    textBlock(cx, firstY, brand.lines, brand.fontSize, pal.ink, 600),
    textBlock(cx, firstY + blockH + brand.fontSize * 1.05, tag.lines, tag.fontSize, pal.ink, 400, 'opacity="0.85"'),
  ].join("\n  ");
}

function buildSvg(concept, brief, product, specs) {
  const w = Number(brief.ordered_width_in) || 3;
  const h = Number(brief.ordered_height_in) || 3;
  const dpi = specs.print.dpi;
  const vw = Math.round(w * dpi);
  const vh = Math.round(h * dpi);
  const pal = specs.palettes[concept.palette] || specs.palettes.forest;
  const shape = product.shape || "rect";
  const base = shapeBase(shape, vw, vh, pal.bg);
  const content = layoutContent(concept.layout, concept, vw, vh, pal);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}in" height="${h}in" viewBox="0 0 ${vw} ${vh}" role="img">`,
    `  <title>${esc(concept.brand)} - ${esc(concept.layout)}</title>`,
    `  ${base}`,
    `  ${content}`,
    `</svg>`,
    ``,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// proof + status persistence
// ---------------------------------------------------------------------------

function dirFor(outRoot, brief) {
  return path.join(path.resolve(outRoot || "design-out"), brief.brief_id);
}

function statusPath(dir) {
  return path.join(dir, "status.json");
}

function loadStatus(dir) {
  try {
    return JSON.parse(fs.readFileSync(statusPath(dir), "utf8"));
  } catch {
    return null;
  }
}

function saveStatus(dir, status) {
  status.updated_at = nowIso();
  fs.writeFileSync(statusPath(dir), JSON.stringify(status, null, 2), "utf8");
}

function audit(dir, event) {
  fs.appendFileSync(path.join(dir, "audit.log"), JSON.stringify({ at: nowIso(), agent: AGENT, ...event }) + "\n", "utf8");
}

function initStatus(brief) {
  return {
    brief_id: brief.brief_id,
    state: null,
    revision: 1,
    brief,
    variants: [],
    approval: null,
    order: null,
    production: null,
    shipment: null,
    delivery: null,
    history: [],
  };
}

function setState(dir, status, state, note) {
  status.state = state;
  status.history.push({ at: nowIso(), state, note: note || null });
  audit(dir, { event: "state", state, note: note || null });
}

function generateVariants(brief, specs, concepts, dir, revision) {
  const product = specs.products[brief.product];
  if (!product) throw new Error(`Unknown product "${brief.product}"`);
  const vDir = path.join(dir, "variants");
  fs.mkdirSync(vDir, { recursive: true });
  return concepts.map((c) => {
    const svg = buildSvg(c, brief, product, specs);
    const file = path.join("variants", `${c.id}.svg`);
    fs.writeFileSync(path.join(dir, file), svg, "utf8");
    return {
      id: c.id,
      layout: c.layout,
      palette: c.palette,
      brand: c.brand,
      tagline: c.tagline,
      source: c.source,
      revision,
      file,
      sha256: sha(svg),
      width_in: Number(brief.ordered_width_in),
      height_in: Number(brief.ordered_height_in),
    };
  });
}

function renderProofHtml(dir, brief, specs, variants, revision) {
  const product = specs.products[brief.product];
  const cards = variants
    .map((v) => {
      const svg = fs.readFileSync(path.join(dir, v.file), "utf8");
      return `      <figure class="card">
        <div class="art">${svg}</div>
        <figcaption>
          <strong>Variant ${v.id}</strong> &middot; ${v.layout} &middot; ${v.palette}<br>
          <span class="mono">${v.sha256.slice(0, 12)}</span>
        </figcaption>
      </figure>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Proof ${esc(brief.brief_id)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f6f6f4;color:#111}
  header{padding:20px 28px;background:#111;color:#fff}
  header h1{margin:0 0 6px;font-size:20px}
  header p{margin:0;opacity:.8;font-size:14px}
  main{padding:24px 28px 48px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin-top:8px}
  .card{margin:0;background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px;text-align:center}
  .art svg{width:100%;height:auto;display:block}
  figcaption{font-size:13px;margin-top:10px;line-height:1.5}
  .mono{font-family:Consolas,monospace;color:#666}
  .ask{margin-top:26px;background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px 18px}
  code{background:#f0f0ee;padding:2px 6px;border-radius:4px;font-family:Consolas,monospace}
</style></head>
<body>
<header>
  <h1>Proof for ${esc(brief.customer || brief.brief_id)}</h1>
  <p>${esc(product ? product.label : brief.product)} &middot; ${brief.ordered_width_in} &times; ${brief.ordered_height_in} in &middot; qty ${brief.quantity} &middot; revision ${revision}</p>
</header>
<main>
  <div class="grid">
${cards}
  </div>
  <div class="ask">
    <strong>Approve one variant</strong>
    <p>Reply with the variant id, or run:</p>
    <p><code>node design-agent/design-agent.js --approve A --by "customer"</code></p>
    <p>Nothing is ordered until a variant is approved. Request changes with <code>--revise "your note"</code>.</p>
  </div>
</main>
</body></html>
`;
}

function renderProof(dir, brief, specs, variants, revision) {
  const html = renderProofHtml(dir, brief, specs, variants, revision);
  fs.writeFileSync(path.join(dir, "proof.html"), html, "utf8");
  fs.writeFileSync(
    path.join(dir, "proof.json"),
    JSON.stringify(
      {
        brief_id: brief.brief_id,
        revision,
        generated_at: nowIso(),
        product: brief.product,
        ordered: { width_in: brief.ordered_width_in, height_in: brief.ordered_height_in, quantity: brief.quantity },
        variants: variants.map((v) => ({ id: v.id, layout: v.layout, palette: v.palette, file: v.file, sha256: v.sha256, source: v.source })),
      },
      null,
      2
    ),
    "utf8"
  );
  return path.join(dir, "proof.html");
}

// ---------------------------------------------------------------------------
// preflight handoff
// ---------------------------------------------------------------------------

function runPreflightGate(artworkPath, brief) {
  let preflight;
  try {
    preflight = require(path.join(SELF_DIR, "..", "preflight", "preflight.js"));
  } catch {
    return { ok: true, skipped: "preflight agent not present in this checkout" };
  }
  let specs;
  try {
    specs = preflight.loadSpecs(path.join(SELF_DIR, "..", "preflight", "preflight-specs.json"));
  } catch {
    return { ok: true, skipped: "preflight specs not found" };
  }
  const result = preflight.runJob(
    {
      job_id: brief.brief_id,
      product: brief.product,
      ordered_width_in: brief.ordered_width_in,
      ordered_height_in: brief.ordered_height_in,
      artwork: artworkPath,
    },
    specs
  );
  return { ok: result.decision === "AUTO_APPROVED", decision: result.decision, reasons: result.summary };
}

// ---------------------------------------------------------------------------
// approval, revision, fulfilment
// ---------------------------------------------------------------------------

function revalidateApproval(dir, status) {
  if (!status.approval) return { valid: false, reason: "no approval on record" };
  const v = status.variants.find((x) => x.id === status.approval.variant_id);
  if (!v) return { valid: false, reason: "approved variant no longer exists" };
  let current;
  try {
    current = sha(fs.readFileSync(path.join(dir, v.file), "utf8"));
  } catch {
    return { valid: false, reason: "approved artwork is missing" };
  }
  if (current !== status.approval.artwork_sha256) return { valid: false, reason: "artwork changed after approval" };
  return { valid: true };
}

function fulfill(dir, status, brief, specs) {
  if (specs.policy.requireApprovalBeforeOrder) {
    const v = revalidateApproval(dir, status);
    if (!v.valid) throw new Error(`Refusing to order: ${v.reason}`);
  }
  const rid = `R${status.revision}`;
  const v = status.variants.find((x) => x.id === status.approval.variant_id);
  const artAbs = path.join(dir, v.file);

  if (specs.policy.requirePreflightBeforeOrder) {
    const gate = runPreflightGate(artAbs, brief);
    status.preflight = { at: nowIso(), ...gate };
    audit(dir, { event: "preflight", ...gate });
    if (!gate.ok) {
      setState(dir, status, "ORDER_BLOCKED", `preflight: ${gate.decision || "skipped"} ${gate.reasons || ""}`.trim());
      return { ok: false, blocked: true, gate };
    }
  }

  status.order = {
    order_id: `SM-${brief.brief_id}-${rid}`,
    brief_id: brief.brief_id,
    variant_id: v.id,
    product: brief.product,
    quantity: brief.quantity,
    width_in: brief.ordered_width_in,
    height_in: brief.ordered_height_in,
    artwork: v.file,
    artwork_sha256: v.sha256,
    approved_by: status.approval.approved_by,
    created_at: nowIso(),
  };
  fs.writeFileSync(path.join(dir, "order.json"), JSON.stringify(status.order, null, 2), "utf8");
  setState(dir, status, "ORDER_CREATED", `order ${status.order.order_id}`);

  status.production = {
    production_id: `PROD-${brief.brief_id}-${rid}`,
    order_id: status.order.order_id,
    product: brief.product,
    quantity: brief.quantity,
    turnaround_days: specs.print.turnaround_days,
    started_at: nowIso(),
  };
  fs.writeFileSync(path.join(dir, "production.json"), JSON.stringify(status.production, null, 2), "utf8");
  setState(dir, status, "IN_PRODUCTION", `production ${status.production.production_id}, ${specs.print.turnaround_days} day turnaround`);

  status.shipment = {
    shipment_id: `SHP-${brief.brief_id}-${rid}`,
    order_id: status.order.order_id,
    carrier: "UPS",
    tracking: `1Z${v.sha256.slice(0, 16).toUpperCase()}`,
    ships_in_days: specs.print.turnaround_days,
    shipped_at: nowIso(),
  };
  fs.writeFileSync(path.join(dir, "shipment.json"), JSON.stringify(status.shipment, null, 2), "utf8");
  setState(dir, status, "SHIPPED", `tracking ${status.shipment.tracking}`);

  status.delivery = {
    delivered_at: nowIso(),
    order_id: status.order.order_id,
    tracking: status.shipment.tracking,
    message: `Your ${specs.products[brief.product].label} of "${v.brand}" is on its way. Tracking ${status.shipment.tracking}.`,
  };
  fs.writeFileSync(path.join(dir, "delivery.txt"), status.delivery.message + "\n", "utf8");
  setState(dir, status, "DELIVERED", "delivery recorded");
  return { ok: true, status };
}

async function startBrief(brief, specs, outRoot, opts) {
  const dir = dirFor(outRoot, brief);
  const done = ["ORDER_CREATED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "ORDER_BLOCKED"];
  let status = loadStatus(dir);
  if (status && done.includes(status.state)) return { dir, status, note: `already ${status.state}; no regenerated proof` };

  fs.mkdirSync(dir, { recursive: true });
  if (!status) {
    status = initStatus(brief);
    audit(dir, { event: "brief", brief_id: brief.brief_id, product: brief.product });
  }
  status.brief = brief;

  const { concepts, note } = await buildConcepts(brief, specs, opts.provider);
  status.concepts_note = note;
  const variants = generateVariants(brief, specs, concepts, dir, status.revision);
  status.variants = variants;
  status.approval = null;
  renderProof(dir, brief, specs, variants, status.revision);
  setState(dir, status, "AWAITING_APPROVAL", note);
  saveStatus(dir, status);
  return { dir, status, note };
}

async function approve(brief, specs, outRoot, variantId, by, opts) {
  const dir = dirFor(outRoot, brief);
  let status = loadStatus(dir);
  if (!status) throw new Error("No proof yet. Run --brief <file> first.");
  const v = status.variants.find((x) => x.id === String(variantId).toUpperCase());
  if (!v) throw new Error(`Variant "${variantId}" not found. Available: ${status.variants.map((x) => x.id).join(", ")}`);

  const current = sha(fs.readFileSync(path.join(dir, v.file), "utf8"));
  if (current !== v.sha256) throw new Error("Variant file changed on disk; regenerate the proof before approving.");

  status.approval = { variant_id: v.id, artwork_sha256: v.sha256, approved_by: by || "unattributed", approved_at: nowIso(), revision: status.revision };
  setState(dir, status, "APPROVED", `variant ${v.id} approved by ${status.approval.approved_by}`);
  saveStatus(dir, status);

  const out = fulfill(dir, status, brief, specs);
  saveStatus(dir, status);
  return { dir, status, out };
}

async function revise(brief, specs, outRoot, note, opts) {
  const dir = dirFor(outRoot, brief);
  let status = loadStatus(dir);
  if (!status) status = initStatus(brief);
  if (status.revision >= specs.policy.maxRevisions) {
    throw new Error(`Revision cap reached (${specs.policy.maxRevisions}). Escalate to a human designer.`);
  }
  fs.mkdirSync(dir, { recursive: true });
  status.brief = brief;
  status.revision += 1;
  status.approval = null;
  audit(dir, { event: "revision_requested", note: note || null, revision: status.revision });

  const { concepts, note: cnote } = await buildConcepts(brief, specs, opts.provider);
  const variants = generateVariants(brief, specs, concepts, dir, status.revision);
  status.variants = variants;
  renderProof(dir, brief, specs, variants, status.revision);
  setState(dir, status, "AWAITING_APPROVAL", `revision ${status.revision}: ${note || "customer requested changes"}`);
  saveStatus(dir, status);
  return { dir, status, note: cnote };
}

// ---------------------------------------------------------------------------
// optional png render of the proof
// ---------------------------------------------------------------------------

function renderProofPng(dir) {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const exe = candidates.find((p) => fs.existsSync(p));
  if (!exe) return { ok: false, reason: "Edge not found" };
  const html = path.join(dir, "proof.html");
  const png = path.join(dir, "proof.png");
  try {
    child_process.execFileSync(exe, ["--headless=new", "--hide-scrollbars", "--window-size=1200,1400", `--screenshot=${png}`, `file:///${html.replace(/\\/g, "/")}`], { stdio: "ignore", timeout: 60000 });
    return { ok: true, png };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`Design agent - brief to proof to delivered order (${AGENT})

Usage
  node design-agent/design-agent.js --brief <brief.json> [--provider local|remote] [--render]
  node design-agent/design-agent.js --approve <id> --by "<name>" [--brief <brief.json>]
  node design-agent/design-agent.js --revise "<note>" [--brief <brief.json>]
  node design-agent/design-agent.js --status [--brief <brief.json|brief_id>]

Options
  --brief <file|id>  Brief JSON to start, or a brief id to act on an existing proof
  --approve <id>     Approve one variant (A, B, C). Orders only after this.
  --revise "<note>"  Request changes; bumps the revision and reissues the proof
  --provider <p>     local (default, deterministic) or remote (needs an API key)
  --render           Also write proof.png via headless Edge, if available
  --out <folder>     Output folder (default design-out)
  --status           Print the current state and history
  --help             Show this text

Guardrails
  - No order is created without an approval bound to the exact artwork hash.
  - The approved artwork is handed to the Preflight agent before ordering.
  - Every state change is appended to audit.log.
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

function resolveBriefFile(args) {
  const v = args.brief;
  if (!v || v === true) throw new Error("--brief is required (a brief JSON file, or a brief id)");
  if (String(v).toLowerCase().endsWith(".json")) return { brief: JSON.parse(fs.readFileSync(v, "utf8")), file: v };
  const dir = path.join(path.resolve(args.out || "design-out"), String(v));
  const status = loadStatus(dir);
  if (!status) throw new Error(`No proof found for brief id "${v}" in ${dir}`);
  return { brief: status.brief, file: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.brief && !args.status)) {
    printHelp();
    return;
  }
  const specs = loadSpecs(args.specs);
  const outRoot = args.out || "design-out";
  const opts = { provider: args.provider === "remote" ? "remote" : "local" };

  try {
    if (args.status) {
      const { brief } = resolveBriefFile(args);
      const dir = dirFor(outRoot, brief);
      const status = loadStatus(dir);
      if (!status) {
        console.log(`No status for ${brief.brief_id} in ${dir}`);
        return;
      }
      console.log(`Brief ${status.brief_id} | state ${status.state} | revision ${status.revision}`);
      if (status.approval) console.log(`Approved: variant ${status.approval.variant_id} by ${status.approval.approved_by} at ${status.approval.approved_at}`);
      if (status.order) console.log(`Order: ${status.order.order_id}`);
      if (status.shipment) console.log(`Shipment: ${status.shipment.shipment_id} tracking ${status.shipment.tracking}`);
      console.log(`Artifacts: ${dir}`);
      return;
    }

    const { brief } = resolveBriefFile(args);

    if (args.approve) {
      const { status, out } = await approve(brief, specs, outRoot, args.approve, args.by, opts);
      if (out.blocked) {
        console.log(`BLOCKED at ORDER_BLOCKED: ${out.gate.decision || "preflight"} - ${out.gate.reasons || ""}`);
        console.log(`No order created. Proof: ${path.join(dirFor(outRoot, brief), "proof.html")}`);
      } else {
        console.log(`Approved variant ${status.approval.variant_id} by ${status.approval.approved_by}`);
        console.log(`Order ${status.order.order_id} -> ${status.production.production_id} -> ${status.shipment.shipment_id}`);
        console.log(`Delivered: ${status.delivery.message}`);
      }
      return;
    }

    if (args.revise) {
      const { status } = await revise(brief, specs, outRoot, args.revise, opts);
      console.log(`Revision ${status.revision} drafted. Proof: ${path.join(dirFor(outRoot, brief), "proof.html")}`);
      return;
    }

    const { dir, status, note } = await startBrief(brief, specs, outRoot, opts);
    console.log(`Brief ${brief.brief_id} | ${status.state} | revision ${status.revision} | ${note}`);
    for (const v of status.variants) console.log(`  Variant ${v.id}  ${v.layout.padEnd(8)} ${v.palette.padEnd(7)} ${v.sha256.slice(0, 10)}  ${v.file}`);
    console.log(`Proof: ${path.join(dir, "proof.html")}`);
    console.log(`No order has been created. Approve a variant to proceed.`);
    if (args.render) {
      const r = renderProofPng(dir);
      console.log(r.ok ? `Rendered: ${r.png}` : `PNG render skipped: ${r.reason}`);
    }
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  AGENT,
  loadSpecs,
  localConcepts,
  buildConcepts,
  buildSvg,
  generateVariants,
  renderProof,
  dirFor,
  loadStatus,
  saveStatus,
  initStatus,
  setState,
  startBrief,
  approve,
  revise,
  fulfill,
  revalidateApproval,
  runPreflightGate,
};
