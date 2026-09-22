#!/usr/bin/env node
"use strict";

/*
 * Design Studio - the customer-facing app on top of the design agent.
 *
 *   node design-studio/server.js            -> http://localhost:4321
 *   PORT=8080 node design-studio/server.js
 *
 * Endpoints
 *   GET  /                     the app
 *   GET  /api/specs            products, palettes, limits (drives the form)
 *   POST /api/brief            validate a brief, then draft variants + proof
 *   GET  /api/brief/:id        status of a brief, with variant artwork
 *   POST /api/brief/:id/approve   { variant_id, by } -> order -> production -> shipped -> delivered
 *   POST /api/brief/:id/revise    { note } -> new revision, approval cleared
 *
 * Plain Node built-ins. The design agent does the work; this file validates
 * input at the edge and never invents state.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const agent = require(path.join(__dirname, "..", "design-agent", "design-agent.js"));

const APP = "design-studio/0.1.0";
const specs = agent.loadSpecs();
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 65536;

function dataRoot() {
  return process.env.DESIGN_STUDIO_DATA || path.join(__dirname, "data");
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

function validateBrief(body) {
  const errors = {};
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  const text = str(body.text);
  if (!text) errors.text = "Brand text is required.";
  else if (text.length > 60) errors.text = "Brand text must be 60 characters or fewer.";

  const tagline = str(body.tagline);
  if (tagline.length > 80) errors.tagline = "Tagline must be 80 characters or fewer.";

  const product = str(body.product);
  if (!product || !specs.products[product]) {
    errors.product = `Choose a product: ${Object.keys(specs.products).join(", ")}.`;
  }

  const w = Number(body.width_in);
  if (!Number.isFinite(w) || w <= 0 || w > 24) errors.width_in = "Width must be between 0 and 24 inches.";
  const h = Number(body.height_in);
  if (!Number.isFinite(h) || h <= 0 || h > 24) errors.height_in = "Height must be between 0 and 24 inches.";

  const q = Number(body.quantity);
  if (!Number.isInteger(q)) errors.quantity = "Quantity must be a whole number of 10 or more.";
  else if (q < 10) errors.quantity = "Our minimum order is 10.";
  else if (q > 100000) errors.quantity = "That quantity is too large for this tool.";

  const palette = str(body.palette);
  if (palette && !specs.palettes[palette]) errors.palette = `Choose a palette: ${Object.keys(specs.palettes).join(", ")}.`;

  const ok = Object.keys(errors).length === 0;
  if (!ok) return { ok, errors, brief: null };

  const rawId = str(body.brief_id);
  const briefId = /^[A-Za-z0-9-]{4,40}$/.test(rawId) ? rawId : `BR-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9)}`;

  return {
    ok,
    errors,
    brief: {
      brief_id: briefId,
      customer: str(body.customer).slice(0, 60),
      product,
      ordered_width_in: w,
      ordered_height_in: h,
      quantity: q,
      text,
      tagline,
      palette: palette || undefined,
      notes: str(body.notes).slice(0, 200),
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function sendFile(res, name, type) {
  const file = path.join(PUBLIC_DIR, name);
  if (!fs.existsSync(file)) return send(res, 404, { error: `Missing ${name}` });
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(file));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > MAX_BODY) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

async function readJson(req, res) {
  try {
    return await readBody(req);
  } catch (e) {
    send(res, 400, { error: e.message });
    return null;
  }
}

function variantsWithSvg(dir, status) {
  return status.variants.map((v) => {
    let svg = "";
    try {
      svg = fs.readFileSync(path.join(dir, v.file), "utf8");
    } catch {
      svg = "";
    }
    return { id: v.id, layout: v.layout, palette: v.palette, sha256: v.sha256, svg };
  });
}

function briefStatus(dir, status, extra) {
  return {
    brief_id: status.brief_id,
    state: status.state,
    revision: status.revision,
    brief: {
      customer: status.brief.customer,
      product: status.brief.product,
      product_label: specs.products[status.brief.product] ? specs.products[status.brief.product].label : null,
      width_in: status.brief.ordered_width_in,
      height_in: status.brief.ordered_height_in,
      quantity: status.brief.quantity,
      text: status.brief.text,
      tagline: status.brief.tagline,
      palette: status.brief.palette || null,
    },
    variants: variantsWithSvg(dir, status),
    approval: status.approval || null,
    order: status.order || null,
    production: status.production || null,
    shipment: status.shipment || null,
    delivery: status.delivery || null,
    preflight: status.preflight || null,
    blocked: extra && extra.blocked ? extra.gate : null,
  };
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  if (req.method === "GET" && (p === "/" || p === "/index.html")) return sendFile(res, "index.html", "text/html; charset=utf-8");

  if (req.method === "GET" && p === "/health") return send(res, 200, { ok: true, app: APP, agent: agent.AGENT });

  if (req.method === "GET" && p === "/api/specs") {
    return send(res, 200, {
      products: Object.keys(specs.products).map((id) => ({ id, label: specs.products[id].label })),
      palettes: Object.keys(specs.palettes),
      dpi: specs.print.dpi,
      minQuantity: 10,
      maxRevisions: specs.policy.maxRevisions,
      turnaroundDays: specs.print.turnaround_days,
    });
  }

  if (req.method === "POST" && p === "/api/brief") {
    const body = await readJson(req, res);
    if (body === null) return;
    const v = validateBrief(body);
    if (!v.ok) return send(res, 400, { error: "Some fields need attention.", fields: v.errors });
    const r = await agent.startBrief(v.brief, specs, dataRoot(), { provider: "local" });
    return send(res, 201, briefStatus(r.dir, r.status));
  }

  const m = p.match(/^\/api\/brief\/([A-Za-z0-9-]+)(?:\/(approve|revise))?$/);
  if (m) {
    const id = m[1];
    const action = m[2];
    const dir = path.join(dataRoot(), id);
    const status = agent.loadStatus(dir);
    if (!status) return send(res, 404, { error: `No brief "${id}".` });

    if (req.method === "GET" && !action) return send(res, 200, briefStatus(dir, status));

    if (req.method === "POST" && action === "approve") {
      const body = await readJson(req, res);
      if (body === null) return;
      const by = typeof body.by === "string" ? body.by.trim() : "";
      if (!by) return send(res, 400, { error: "A name is required to approve.", fields: { by: "Who is approving this design?" } });
      const variantId = String(body.variant_id || "").toUpperCase();
      if (!status.variants.some((v) => v.id === variantId)) {
        return send(res, 400, { error: `Variant "${variantId}" is not on this proof.`, fields: { variant_id: `Choose one of ${status.variants.map((v) => v.id).join(", ")}.` } });
      }
      try {
        const r = await agent.approve(status.brief, specs, dataRoot(), variantId, by, { provider: "local" });
        return send(res, r.out.blocked ? 409 : 200, briefStatus(r.dir, r.status, r.out));
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    if (req.method === "POST" && action === "revise") {
      const body = await readJson(req, res);
      if (body === null) return;
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!note) return send(res, 400, { error: "Describe the change you want.", fields: { note: "A note is required." } });
      try {
        const r = await agent.revise(status.brief, specs, dataRoot(), note, { provider: "local" });
        return send(res, 200, briefStatus(r.dir, r.status));
      } catch (e) {
        return send(res, 409, { error: e.message });
      }
    }
  }

  return send(res, 404, { error: "Not found" });
}

function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((e) => send(res, 500, { error: e.message }));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4321);
  createServer().listen(port, () => {
    console.log(`Design Studio on http://localhost:${port}`);
    console.log(`Data folder: ${dataRoot()}`);
  });
}

module.exports = { createServer, validateBrief, APP };
