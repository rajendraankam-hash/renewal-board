#!/usr/bin/env node
"use strict";

/*
 * Preflight tests. Builds its own image fixtures (no image libraries), runs
 * the agent over them, and asserts the decisions. Includes negative tests:
 * a low-resolution or transparent file must never be auto-approved.
 *
 *   node preflight/test-preflight.js
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const P = require("./preflight.js");

const FIX = path.join(__dirname, "fixtures", "generated");
const specs = P.loadSpecs();
let passCount = 0;
let failCount = 0;

function check(name, ok, detail) {
  if (ok) {
    passCount += 1;
    console.log(`PASS  ${name}`);
  } else {
    failCount += 1;
    console.log(`FAIL  ${name}${detail ? " -> " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------------
// fixture builders
// ---------------------------------------------------------------------------

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    let c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePng(width, height, colorType) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = Buffer.alloc((width * channels + 1) * height);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function makeJpeg(width, height, components) {
  const sof = Buffer.alloc(10 + 3 * components);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(8 + 3 * components, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = components;
  for (let i = 0; i < components; i += 1) {
    sof[10 + i * 3] = i + 1;
    sof[11 + i * 3] = 0x11;
    sof[12 + i * 3] = 0;
  }
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

function makePdf(pointsW, pointsH) {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox [0 0 ${pointsW} ${pointsH}]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "latin1"
  );
}

function makeSvg(inches) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${inches}in" height="${inches}in" viewBox="0 0 300 300"><rect width="300" height="300"/></svg>`,
    "utf8"
  );
}

function writeFixtures() {
  fs.mkdirSync(FIX, { recursive: true });
  const w = (name, buf) => fs.writeFileSync(path.join(FIX, name), buf);
  w("clean.png", makePng(900, 900, 2));
  w("lowres.png", makePng(150, 150, 2));
  w("transparent.png", makePng(900, 900, 6));
  w("grayscale.png", makePng(900, 900, 0));
  w("rgbmid.png", makePng(500, 500, 2));
  w("wide.png", makePng(1200, 600, 2));
  w("cmyk.jpg", makeJpeg(900, 900, 4));
  w("vector.svg", makeSvg(3));
  w("vector.pdf", makePdf(216, 216));
  w("corrupt.png", Buffer.from("this is not a png or any known artwork format", "utf8"));
  w("empty.png", Buffer.alloc(0));
}

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------

function run(file, product, wIn, hIn) {
  return P.runJob(
    { job_id: "TEST", product, ordered_width_in: wIn, ordered_height_in: hIn, customer: null, artwork: path.join(FIX, file) },
    specs
  );
}

writeFixtures();

const cases = [
  { file: "clean.png", product: "die-cut-sticker", w: 3, h: 3, expect: "AUTO_APPROVED", check: "resolution", level: "pass" },
  { file: "lowres.png", product: "die-cut-sticker", w: 3, h: 3, expect: "NEEDS_FIX", check: "resolution", level: "fail" },
  { file: "transparent.png", product: "die-cut-sticker", w: 3, h: 3, expect: "HUMAN_REVIEW", check: "transparency", level: "warn" },
  { file: "transparent.png", product: "clear-sticker", w: 3, h: 3, expect: "AUTO_APPROVED", check: "transparency", level: "pass" },
  { file: "grayscale.png", product: "die-cut-sticker", w: 3, h: 3, expect: "AUTO_APPROVED", check: "color_space", level: "pass" },
  { file: "rgbmid.png", product: "die-cut-sticker", w: 3, h: 3, expect: "HUMAN_REVIEW", check: "resolution", level: "warn" },
  { file: "wide.png", product: "circle-sticker", w: 3, h: 3, expect: "HUMAN_REVIEW", check: "aspect_ratio", level: "review" },
  { file: "cmyk.jpg", product: "die-cut-sticker", w: 3, h: 3, expect: "AUTO_APPROVED", check: "color_space", level: "pass" },
  { file: "vector.svg", product: "circle-sticker", w: 3, h: 3, expect: "AUTO_APPROVED", check: "resolution", level: "pass" },
  { file: "vector.pdf", product: "die-cut-sticker", w: 3, h: 3, expect: "AUTO_APPROVED", check: "resolution", level: "pass" },
  { file: "corrupt.png", product: "die-cut-sticker", w: 3, h: 3, expect: "NEEDS_FIX", check: "format_supported", level: "fail" },
  { file: "empty.png", product: "die-cut-sticker", w: 3, h: 3, expect: "NEEDS_FIX", check: "format_supported", level: "fail" },
];

const results = [];

for (const c of cases) {
  const r = run(c.file, c.product, c.w, c.h);
  results.push({ c, r });
  check(`decision: ${c.file} [${c.product} ${c.w}x${c.h}] = ${c.expect}`, r.decision === c.expect, `got ${r.decision} :: ${r.summary}`);
  const found = r.checks.some((x) => x.id === c.check && (!c.level || x.level === c.level));
  check(`  ${c.check}${c.level ? "(" + c.level + ")" : ""} present`, found, r.checks.filter((x) => x.level !== "pass" && x.level !== "info").map((x) => `${x.level}:${x.id}`).join(",") || "no blocking checks");
}

console.log("");
console.log("Invariants");

for (const { c, r } of results) {
  const label = `${c.file}[${c.product}]`;
  if (r.decision === "AUTO_APPROVED") {
    const blocking = r.checks.filter((x) => x.level === "fail" || x.level === "review" || x.level === "warn");
    check(`  ${label} auto-approved with zero blocking checks`, blocking.length === 0, blocking.map((x) => x.id).join(","));
  }
  if (r.decision === "NEEDS_FIX") {
    check(`  ${label} NEEDS_FIX has at least one fail`, r.checks.some((x) => x.level === "fail"), "none");
    const msg = P.draftCustomerMessage(r);
    check(`  ${label} NEEDS_FIX produced a customer message`, Boolean(msg) && msg.length > 20, String(msg).slice(0, 40));
  }
  if (r.decision !== "NEEDS_FIX") {
    check(`  ${label} non-fail produced no customer message`, P.draftCustomerMessage(r) === null, "message was produced");
  }
}

console.log("");
console.log("Negative tests");

const low = run("lowres.png", "die-cut-sticker", 3, 3);
check("low-resolution artwork is never AUTO_APPROVED", low.decision !== "AUTO_APPROVED", low.decision);
check("low-resolution artwork is NEEDS_FIX", low.decision === "NEEDS_FIX", low.decision);

const transDie = run("transparent.png", "die-cut-sticker", 3, 3);
const transClear = run("transparent.png", "clear-sticker", 3, 3);
check("transparency blocks auto-approve on a vinyl sticker", transDie.decision !== "AUTO_APPROVED", transDie.decision);
check("same file auto-approves on a clear product (spec-driven)", transClear.decision === "AUTO_APPROVED", transClear.decision);

const corrupt = run("corrupt.png", "die-cut-sticker", 3, 3);
check("a corrupt upload is never AUTO_APPROVED", corrupt.decision === "NEEDS_FIX", corrupt.decision);

console.log("");
console.log("Parsers");

const png = P.readPng(fs.readFileSync(path.join(FIX, "clean.png")));
check("readPng reads 900x900 RGB", png.width === 900 && png.height === 900 && png.colorSpace === "rgb" && png.hasAlpha === false, JSON.stringify(png));
const pngAlpha = P.readPng(fs.readFileSync(path.join(FIX, "transparent.png")));
check("readPng detects alpha on an RGBA PNG", pngAlpha.hasAlpha === true && pngAlpha.colorSpace === "rgba", JSON.stringify(pngAlpha));
const jpg = P.readJpeg(fs.readFileSync(path.join(FIX, "cmyk.jpg")));
check("readJpeg reads 900x900 CMYK", jpg.width === 900 && jpg.components === 4 && jpg.colorSpace === "cmyk", JSON.stringify(jpg));
const pdf = P.readPdf(fs.readFileSync(path.join(FIX, "vector.pdf")));
check("readPdf reads a 3in MediaBox", Math.round(pdf.widthIn) === 3 && Math.abs(pdf.heightIn - 3) < 0.01, JSON.stringify(pdf));
const svg = P.readSvg(fs.readFileSync(path.join(FIX, "vector.svg")));
check("readSvg reads 3in width/height", svg.widthIn === 3 && svg.heightIn === 3, JSON.stringify(svg));

console.log("");
console.log(`RESULT: ${passCount} passed, ${failCount} failed`);
process.exitCode = failCount === 0 ? 0 : 1;
