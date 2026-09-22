#!/usr/bin/env node
"use strict";

/*
 * Design Studio app tests. Boots the real HTTP server on an ephemeral port,
 * drives the real API, and asserts the edge validation plus the full
 * brief -> proof -> approve -> delivered flow over HTTP.
 *
 *   node design-studio/test-server.js
 */

const fs = require("fs");
const path = require("path");

const TMP = path.join(__dirname, "fixtures", "tmp");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.DESIGN_STUDIO_DATA = TMP;

const { createServer } = require("./server.js");

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? " -> " + detail : ""}`);
  }
}

async function main() {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const post = async (url, body) => {
    const res = await fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const get = async (url) => {
    const res = await fetch(base + url);
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  const goodBrief = {
    text: "Trailhead Coffee",
    tagline: "Roasted in Portland",
    product: "circle-sticker",
    width_in: 3,
    height_in: 3,
    quantity: 100,
    palette: "forest",
    customer: "Maya",
  };

  console.log("App shell");
  const health = await get("/health");
  check("GET /health is ok", health.status === 200 && health.data.ok === true, JSON.stringify(health.data));
  const page = await fetch(base + "/");
  const html = await page.text();
  check("GET / serves the app", page.status === 200 && html.includes("Design Studio"), `status ${page.status}`);
  const spec = await get("/api/specs");
  check("GET /api/specs lists products and palettes", spec.status === 200 && spec.data.products.some((p) => p.id === "circle-sticker") && spec.data.palettes.includes("forest"), JSON.stringify(spec.data).slice(0, 80));
  check("specs expose the 10 unit minimum", spec.data.minQuantity === 10, String(spec.data.minQuantity));

  console.log("");
  console.log("Edge validation (must reject and save nothing)");
  const empty = await post("/api/brief", {});
  check("empty brief is rejected with field errors", empty.status === 400 && empty.data.fields && empty.data.fields.text && empty.data.fields.product && empty.data.fields.quantity, JSON.stringify(empty.data.fields));
  const qtySmall = await post("/api/brief", { ...goodBrief, quantity: 5 });
  check("quantity below 10 is rejected", qtySmall.status === 400 && /minimum order is 10/.test(qtySmall.data.fields.quantity), JSON.stringify(qtySmall.data.fields));
  const qtyFraction = await post("/api/brief", { ...goodBrief, quantity: 12.5 });
  check("fractional quantity is rejected", qtyFraction.status === 400 && qtyFraction.data.fields.quantity, JSON.stringify(qtyFraction.data.fields));
  const wide = await post("/api/brief", { ...goodBrief, width_in: 999 });
  check("oversized width is rejected", wide.status === 400 && wide.data.fields.width_in, JSON.stringify(wide.data.fields));
  const badProduct = await post("/api/brief", { ...goodBrief, product: "spaceship" });
  check("unknown product is rejected", badProduct.status === 400 && badProduct.data.fields.product, JSON.stringify(badProduct.data.fields));
  const badPalette = await post("/api/brief", { ...goodBrief, palette: "neon" });
  check("unknown palette is rejected", badPalette.status === 400 && badPalette.data.fields.palette, JSON.stringify(badPalette.data.fields));
  const badJson = await fetch(base + "/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
  check("malformed JSON is rejected as 400", badJson.status === 400, `status ${badJson.status}`);
  check("rejected briefs write nothing to disk", fs.readdirSync(TMP).length === 0, fs.readdirSync(TMP).join(","));

  console.log("");
  console.log("Brief -> proof");
  const created = await post("/api/brief", goodBrief);
  check("valid brief returns 201", created.status === 201, `status ${created.status}`);
  check("state is AWAITING_APPROVAL", created.data.state === "AWAITING_APPROVAL", created.data.state);
  check("three variants returned", created.data.variants.length === 3, String(created.data.variants.length));
  check("each variant carries inline SVG", created.data.variants.every((v) => v.svg.includes("<svg")), "missing svg");
  check("no order exists yet", created.data.order === null);
  const id = created.data.brief_id;
  check("brief is listed from disk", (await get(`/api/brief/${id}`)).status === 200);

  console.log("");
  console.log("Approval guardrails");
  const noName = await post(`/api/brief/${id}/approve`, { variant_id: "A" });
  check("approval without a name is rejected", noName.status === 400 && noName.data.fields.by, JSON.stringify(noName.data.fields));
  const badVariant = await post(`/api/brief/${id}/approve`, { variant_id: "Z", by: "Maya" });
  check("approval of an unknown variant is rejected", badVariant.status === 400 && badVariant.data.fields.variant_id, JSON.stringify(badVariant.data.fields));
  const stillOpen = await get(`/api/brief/${id}`);
  check("brief is still awaiting approval after bad attempts", stillOpen.data.state === "AWAITING_APPROVAL" && stillOpen.data.order === null, stillOpen.data.state);

  console.log("");
  console.log("Approve -> order -> production -> shipped -> delivered");
  const approved = await post(`/api/brief/${id}/approve`, { variant_id: "A", by: "Maya" });
  check("approval returns 200", approved.status === 200, `status ${approved.status}`);
  check("final state is DELIVERED", approved.data.state === "DELIVERED", approved.data.state);
  check("order created and attributed", approved.data.order && approved.data.order.approved_by === "Maya", JSON.stringify(approved.data.order));
  check("production created", Boolean(approved.data.production && approved.data.production.turnaround_days === 4), JSON.stringify(approved.data.production));
  check("shipment has a UPS tracking number", Boolean(approved.data.shipment && /^1Z/.test(approved.data.shipment.tracking)), JSON.stringify(approved.data.shipment));
  check("delivery message names the product", Boolean(approved.data.delivery && /Circle sticker/.test(approved.data.delivery.message)), JSON.stringify(approved.data.delivery));
  check("preflight handoff recorded", Boolean(approved.data.preflight && (approved.data.preflight.skipped || approved.data.preflight.ok === true)), JSON.stringify(approved.data.preflight));
  const after = await get(`/api/brief/${id}`);
  check("status persists across requests", after.data.state === "DELIVERED" && after.data.order.order_id === approved.data.order.order_id, after.data.state);
  check("order file exists on disk", fs.existsSync(path.join(TMP, id, "order.json")));
  const auditLines = fs.readFileSync(path.join(TMP, id, "audit.log"), "utf8").trim().split("\n");
  check("audit log recorded each state", auditLines.some((l) => l.includes("ORDER_CREATED")) && auditLines.some((l) => l.includes("DELIVERED")), `${auditLines.length} lines`);

  console.log("");
  console.log("Revisions");
  const second = await post("/api/brief", { ...goodBrief, text: "Second Brand" });
  const revised = await post(`/api/brief/${second.data.brief_id}/revise`, { note: "make the tagline bigger" });
  check("revise returns 200", revised.status === 200, `status ${revised.status}`);
  check("revision increments", revised.data.revision === 2, String(revised.data.revision));
  check("revise clears the approval", revised.data.approval === null);
  check("revise returns to AWAITING_APPROVAL", revised.data.state === "AWAITING_APPROVAL", revised.data.state);
  const noNote = await post(`/api/brief/${second.data.brief_id}/revise`, {});
  check("revise without a note is rejected", noNote.status === 400 && noNote.data.fields.note, JSON.stringify(noNote.data.fields));

  console.log("");
  console.log("Not found");
  const missing = await get("/api/brief/NOPE-1234");
  check("unknown brief returns 404", missing.status === 404, `status ${missing.status}`);

  await new Promise((r) => server.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log("");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main();
