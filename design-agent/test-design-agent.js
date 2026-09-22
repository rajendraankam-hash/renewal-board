#!/usr/bin/env node
"use strict";

/*
 * Design agent tests. Builds real proofs in a temp folder, then asserts the
 * guardrails: no order without approval, an approval binds to the exact
 * artwork, tampering invalidates it, the revision cap holds, and a corrupt
 * file is blocked by the preflight handoff.
 *
 *   node design-agent/test-design-agent.js
 */

const fs = require("fs");
const path = require("path");
const A = require("./design-agent.js");

const specs = A.loadSpecs();
const TMP = path.join(__dirname, "fixtures", "tmp");
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

function baseBrief(id) {
  return {
    brief_id: id,
    customer: "Maya",
    product: "circle-sticker",
    ordered_width_in: 3,
    ordered_height_in: 3,
    quantity: 100,
    text: "Trailhead Coffee",
    tagline: "Roasted in Portland",
    palette: "forest",
  };
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const brief = baseBrief("BR-T1");
  const brief3 = baseBrief("BR-T3");
  const product = specs.products["circle-sticker"];

  console.log("Renderer");
  const concept = A.localConcepts(brief, specs)[0];
  const s1 = A.buildSvg(concept, brief, product, specs);
  const s2 = A.buildSvg(concept, brief, product, specs);
  check("buildSvg is deterministic", s1 === s2);
  check("artboard is sized in inches at 300 dpi", s1.includes('width="3in"') && s1.includes('height="3in"') && s1.includes('viewBox="0 0 900 900"'), s1.slice(0, 90));
  const evil = A.buildSvg({ ...concept, brand: "Ben & Jerry <b>", tagline: "a>b" }, brief, product, specs);
  check("brand text is XML-escaped", evil.includes("Ben &amp; Jerry &lt;b&gt;"), "not escaped");

  const longB = { ...brief, text: "The Extremely Long Coffee Company Name", tagline: "Freshly roasted every single morning in Portland Oregon" };
  const longSvg = A.buildSvg(A.localConcepts(longB, specs)[0], longB, product, specs);
  const firstText = longSvg.match(/<text[^>]*font-size="(\d+)"[^>]*>([\s\S]*?)<\/text>/);
  const size = Number(firstText[1]);
  const tspans = [...firstText[2].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
  const longest = Math.max(...tspans.map((t) => t.length));
  const est = longest * size * 0.58;
  check("long brand text is scaled to fit inside the artboard", size > 0 && est <= 900 * 0.7 + 2, `size ${size}, est ${Math.round(est)}px for "${tspans.find((t) => t.length === longest)}"`);
  check("fitting reduces the font size below the unfitted maximum", size < 900 * 0.14, `size ${size}`);

  console.log("");
  console.log("Providers");
  const lc = await A.buildConcepts(brief, specs, "local");
  check("local provider returns 3 concepts", lc.concepts.length === 3 && lc.concepts.every((c) => c.source === "local"), lc.note);
  check("local concepts use distinct palettes", new Set(lc.concepts.map((c) => c.palette)).size === 3, lc.concepts.map((c) => c.palette).join(","));
  const rc = await A.buildConcepts(brief, specs, "remote");
  check("remote provider without a key falls back to local and says so", rc.concepts.length === 3 && /unavailable/.test(rc.note), rc.note);

  console.log("");
  console.log("Brief -> proof (no order)");
  const r1 = await A.startBrief(brief, specs, TMP, { provider: "local" });
  check("state is AWAITING_APPROVAL", r1.status.state === "AWAITING_APPROVAL", r1.status.state);
  check("three variants written", r1.status.variants.length === 3);
  check("proof.html exists", fs.existsSync(path.join(r1.dir, "proof.html")));
  const proofHtml = fs.readFileSync(path.join(r1.dir, "proof.html"), "utf8");
  check("proof.html shows every variant", r1.status.variants.every((v) => proofHtml.includes(`Variant ${v.id}`)));
  check("proof.html offers an approve command", proofHtml.includes("--approve"));
  check("NO order exists before approval", !fs.existsSync(path.join(r1.dir, "order.json")));
  check("variant files exist on disk", r1.status.variants.every((v) => fs.existsSync(path.join(r1.dir, v.file))));

  console.log("");
  console.log("Approval guardrails");
  let rejectedUnknown = false;
  try {
    await A.approve(brief, specs, TMP, "Z", "Maya", { provider: "local" });
  } catch {
    rejectedUnknown = true;
  }
  check("approving an unknown variant is rejected", rejectedUnknown);

  let refused = false;
  try {
    A.fulfill(r1.dir, { revision: 1, variants: r1.status.variants, approval: null }, brief, specs);
  } catch (e) {
    refused = /Refusing to order/.test(e.message);
  }
  check("fulfil refuses with no approval on record", refused);

  const st = A.loadStatus(r1.dir);
  const tampered = JSON.parse(JSON.stringify(st));
  tampered.approval = { variant_id: "A", artwork_sha256: "deadbeef" };
  const rv = A.revalidateApproval(r1.dir, tampered);
  check("artwork changed after approval invalidates it", rv.valid === false && /changed after approval/.test(rv.reason), rv.reason);

  console.log("");
  console.log("Approval -> order -> production -> shipped -> delivered");
  const r2 = await A.approve(brief, specs, TMP, "A", "Maya", { provider: "local" });
  check("order.json created", fs.existsSync(path.join(r2.dir, "order.json")));
  check("production.json created", fs.existsSync(path.join(r2.dir, "production.json")));
  check("shipment.json created", fs.existsSync(path.join(r2.dir, "shipment.json")));
  check("delivery.txt created", fs.existsSync(path.join(r2.dir, "delivery.txt")));
  check("final state is DELIVERED", r2.status.state === "DELIVERED", r2.status.state);
  const hist = r2.status.history.map((h) => h.state);
  check(
    "state order is APPROVED -> ORDER_CREATED -> IN_PRODUCTION -> SHIPPED -> DELIVERED",
    JSON.stringify(hist.slice(-5)) === JSON.stringify(["APPROVED", "ORDER_CREATED", "IN_PRODUCTION", "SHIPPED", "DELIVERED"]),
    JSON.stringify(hist)
  );
  check("order records the approver", r2.status.order.approved_by === "Maya", r2.status.order.approved_by);
  check("order binds to the artwork hash", r2.status.order.artwork_sha256 === r2.status.approval.artwork_sha256);
  check("preflight gate result recorded", Boolean(r2.status.preflight) && (r2.status.preflight.skipped || r2.status.preflight.ok === true), JSON.stringify(r2.status.preflight));
  check("re-running --brief on a delivered order does not regenerate", (await A.startBrief(brief, specs, TMP, { provider: "local" })).status.state === "DELIVERED");

  console.log("");
  console.log("Preflight handoff");
  const badArt = path.join(TMP, "corrupt-art.svg");
  fs.writeFileSync(badArt, "this is not artwork in any supported format", "utf8");
  const gbad = A.runPreflightGate(badArt, brief);
  check("corrupt artwork is blocked by the preflight gate", gbad.skipped ? false : gbad.ok === false && gbad.decision === "NEEDS_FIX", JSON.stringify(gbad));
  const goodArt = path.join(r1.dir, r1.status.variants[0].file);
  const ggood = A.runPreflightGate(goodArt, brief);
  check("generated vector artwork passes the preflight gate", ggood.skipped || ggood.ok === true, JSON.stringify(ggood));

  console.log("");
  console.log("Revisions");
  const capped = JSON.parse(JSON.stringify(specs));
  capped.policy.maxRevisions = 2;
  await A.startBrief(brief3, capped, TMP, { provider: "local" });
  const rev = await A.revise(brief3, capped, TMP, "make the tagline bigger", { provider: "local" });
  check("revise bumps the revision", rev.status.revision === 2, String(rev.status.revision));
  check("revise clears the approval", rev.status.approval === null);
  check("revise returns to AWAITING_APPROVAL", rev.status.state === "AWAITING_APPROVAL", rev.status.state);
  let capHit = false;
  try {
    await A.revise(brief3, capped, TMP, "one more", { provider: "local" });
  } catch (e) {
    capHit = /Revision cap/.test(e.message);
  }
  check("revision cap is enforced", capHit);

  console.log("");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main();
