#!/usr/bin/env node
"use strict";

/*
 * Preflight - an autonomous artwork QA agent.
 *
 * Reads a print job (product, ordered size, artwork), inspects the file
 * itself, decides AUTO_APPROVED / HUMAN_REVIEW / NEEDS_FIX, and writes a
 * decision record, an audit log line and, when the customer must act, a
 * customer-facing message.
 *
 *   node preflight/preflight.js --job preflight/jobs/example-job.json
 *   node preflight/preflight.js --dir <folder> --product die-cut-sticker --size 3x3 --out <folder>
 *   node preflight/preflight.js --help
 *
 * Plain Node built-ins only. No key required. Thresholds live in
 * preflight-specs.json, not in this file.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const AGENT = "preflight/0.1.0";

const ARTWORK_EXT = new Set([".png", ".jpg", ".jpeg", ".pdf", ".svg", ".gif"]);

// ---------------------------------------------------------------------------
// file readers - header parsing only, no image libraries
// ---------------------------------------------------------------------------

function detectFormat(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 5 && buf.slice(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length >= 3 && buf.slice(0, 3).toString("latin1") === "GIF") return "gif";
  const head = buf.slice(0, 2048).toString("utf8");
  if (/<svg[\s>]/i.test(head)) return "svg";
  return "unknown";
}

function readPng(buf) {
  if (buf.slice(12, 16).toString("latin1") !== "IHDR") throw new Error("PNG has no IHDR chunk");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  const palette = { 0: "gray", 2: "rgb", 3: "indexed", 4: "gray+alpha", 6: "rgba" };
  const hasAlpha = colorType === 4 || colorType === 6 || buf.includes(Buffer.from("tRNS"));
  return {
    vector: false,
    width,
    height,
    bitDepth,
    colorType,
    interlace,
    hasAlpha,
    colorSpace: palette[colorType] || `unknown(${colorType})`,
  };
}

function readJpeg(buf) {
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) break;
    const len = buf.readUInt16BE(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      const components = buf[i + 9];
      return {
        vector: false,
        width,
        height,
        components,
        hasAlpha: false,
        colorSpace: components === 1 ? "gray" : components === 4 ? "cmyk" : "rgb",
      };
    }
    i += 2 + len;
  }
  throw new Error("JPEG has no SOF marker");
}

function readGif(buf) {
  return { vector: false, width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), hasAlpha: false, colorSpace: "indexed" };
}

function readPdf(buf) {
  const text = buf.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page(?!s)/g) || []).length;
  const m = text.match(/\/MediaBox\s*\[\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*\]/);
  if (!m) return { vector: true, widthPt: null, heightPt: null, widthIn: null, heightIn: null, pages, hasAlpha: false, colorSpace: null };
  const w = Math.abs(parseFloat(m[3]) - parseFloat(m[1]));
  const h = Math.abs(parseFloat(m[4]) - parseFloat(m[2]));
  return { vector: true, widthPt: w, heightPt: h, widthIn: w / 72, heightIn: h / 72, pages, hasAlpha: false, colorSpace: null };
}

function lengthToInches(raw) {
  const s = String(raw).trim().toLowerCase();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  if (s.endsWith("in")) return n;
  if (s.endsWith("mm")) return n / 25.4;
  if (s.endsWith("cm")) return n / 2.54;
  if (s.endsWith("pt")) return n / 72;
  if (s.endsWith("pc")) return n / 6;
  return n / 96;
}

function readSvg(buf) {
  const text = buf.slice(0, 40000).toString("utf8");
  const wAttr = text.match(/\bwidth\s*=\s*"([^"]+)"/i);
  const hAttr = text.match(/\bheight\s*=\s*"([^"]+)"/i);
  const vb = text.match(/\bviewBox\s*=\s*"([^"]+)"/i);
  const widthIn = wAttr ? lengthToInches(wAttr[1]) : null;
  const heightIn = hAttr ? lengthToInches(hAttr[1]) : null;
  return { vector: true, widthIn, heightIn, hasViewBox: Boolean(vb), hasAlpha: null, colorSpace: null, pages: 1 };
}

function readArtwork(filePath) {
  const buf = fs.readFileSync(filePath);
  const format = detectFormat(buf);
  const base = {
    file: path.basename(filePath),
    bytes: buf.length,
    format,
    sha256: crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16),
  };
  if (format === "png") return { ...base, ...readPng(buf) };
  if (format === "jpeg") return { ...base, ...readJpeg(buf) };
  if (format === "pdf") return { ...base, ...readPdf(buf) };
  if (format === "svg") return { ...base, ...readSvg(buf) };
  if (format === "gif") return { ...base, ...readGif(buf) };
  return { ...base, vector: false, hasAlpha: null, colorSpace: null };
}

// ---------------------------------------------------------------------------
// evaluation
// ---------------------------------------------------------------------------

function evaluate(job, specs, art) {
  const product = specs.products[job.product] || null;
  const limits = specs.defaults;
  const checks = [];
  const add = (id, level, message, evidence) => checks.push({ id, level, message, evidence: evidence || null });

  if (product) add("known_product", "pass", `Product spec loaded: ${product.label}`, `spec ${specs.spec_version}`);
  else add("known_product", "review", `No spec for product "${job.product}"`, null);

  if (art.error) {
    add("file_readable", "fail", `Artwork could not be read: ${art.error}`, art.file || null);
    return finalize(job, product, checks, art, specs);
  }

  add("file_readable", "pass", "Artwork read", `${art.bytes} bytes`);

  if (limits.supportedFormats.includes(art.format)) {
    add("format_supported", "pass", `Format ${art.format} is supported`, null);
  } else {
    add("format_supported", "fail", `Unsupported format "${art.format}" (supported: ${limits.supportedFormats.join(", ")})`, art.file);
  }

  if (art.bytes === 0) add("file_not_empty", "fail", "File is 0 bytes", null);
  else if (art.bytes > limits.maxFileMb * 1024 * 1024) {
    add("file_size", "warn", `File is ${(art.bytes / 1048576).toFixed(1)} MB, above the ${limits.maxFileMb} MB review threshold`, null);
  }

  const ow = Number(job.ordered_width_in);
  const oh = Number(job.ordered_height_in);

  if (art.vector) {
    add("resolution", "pass", "Vector artwork is resolution-independent", `${art.format}${art.widthIn ? `, ${art.widthIn} x ${art.heightIn} in` : ""}`);
  } else if (art.width && art.height && ow > 0 && oh > 0) {
    const dpi = Math.min(art.width / ow, art.height / oh);
    const r = Math.round(dpi);
    const ev = `${art.width} x ${art.height} px at ${ow} x ${oh} in`;
    if (dpi < limits.minDpi) add("resolution", "fail", `Effective resolution is ${r} DPI, below the ${limits.minDpi} DPI minimum`, ev);
    else if (dpi < limits.recommendedDpi) add("resolution", "warn", `Effective resolution is ${r} DPI, below the recommended ${limits.recommendedDpi} DPI`, ev);
    else add("resolution", "pass", `Effective resolution is ${r} DPI`, ev);
  } else {
    add("dimensions_known", "review", "Artwork pixel dimensions or ordered size missing, so resolution cannot be computed", null);
  }

  if (art.hasAlpha === true) {
    if (product && product.allowsTransparency) add("transparency", "pass", "Transparency is allowed for this product", null);
    else add("transparency", "warn", "Artwork has transparency, which can print with an unwanted background", null);
  } else if (art.hasAlpha === null || art.hasAlpha === undefined) {
    add("transparency", "info", "Transparency is not evaluated for this format", null);
  } else {
    add("transparency", "pass", "No transparency detected", null);
  }

  const cs = art.colorSpace;
  if (cs === "cmyk") add("color_space", "pass", "CMYK artwork, no conversion needed", null);
  else if (cs === "gray") add("color_space", "pass", "Grayscale artwork", null);
  else if (cs === "rgb" || cs === "rgba") add("color_space", "info", "RGB artwork will be converted to CMYK; very bright colors can shift", "web uploads are normally RGB");
  else if (cs) add("color_space", "info", `Color space: ${cs}`, null);
  else if (art.vector) add("color_space", "info", "Color space is embedded in the vector file and handled at print time", null);
  else add("color_space", "review", "Color space could not be determined", null);

  if (product && product.fixedShape && !art.vector && art.width && art.height && ow > 0 && oh > 0) {
    const artAspect = art.width / art.height;
    const ordAspect = ow / oh;
    const pct = (Math.abs(artAspect - ordAspect) / ordAspect) * 100;
    if (pct > limits.aspectTolerancePct) {
      add("aspect_ratio", "review", `Artwork aspect ${artAspect.toFixed(2)}:1 differs from the ordered ${product.shape} by ${pct.toFixed(0)}%`, `ordered ${ow} x ${oh} in`);
    } else {
      add("aspect_ratio", "pass", `Artwork aspect matches the ordered ${product.shape} within ${limits.aspectTolerancePct}%`, null);
    }
  } else if (product && !product.fixedShape) {
    add("aspect_ratio", "pass", "Die-cut follows the artwork shape, so there is no aspect requirement", null);
  } else {
    add("aspect_ratio", "pass", "Aspect check not applicable", null);
  }

  if (art.format === "pdf" && art.pages > 1) {
    add("pdf_pages", "warn", `PDF has ${art.pages} pages; only the first page is used`, null);
  }

  return finalize(job, product, checks, art, specs);
}

function decide(checks, specs) {
  const has = (level) => checks.some((c) => c.level === level);
  if (has("fail")) return "NEEDS_FIX";
  if (has("review")) return "HUMAN_REVIEW";
  if (has("warn") && specs.decision.autoApproveRequiresNoWarnings) return "HUMAN_REVIEW";
  return "AUTO_APPROVED";
}

function summarize(decision, checks) {
  const blocked = checks.filter((c) => c.level === "fail" || c.level === "review" || c.level === "warn");
  if (decision === "AUTO_APPROVED") return "No blocking issues found";
  return blocked.map((c) => c.message).join("; ");
}

function finalize(job, product, checks, art, specs) {
  const decision = decide(checks, specs);
  return {
    agent: AGENT,
    spec_version: specs.spec_version,
    job_id: job.job_id || null,
    product: job.product || null,
    product_label: product ? product.label : null,
    customer: job.customer || null,
    ordered: {
      width_in: Number.isFinite(Number(job.ordered_width_in)) ? Number(job.ordered_width_in) : null,
      height_in: Number.isFinite(Number(job.ordered_height_in)) ? Number(job.ordered_height_in) : null,
      quantity: job.quantity || null,
    },
    artwork: {
      file: art.file || (job.artwork ? path.basename(job.artwork) : null),
      format: art.format || "unknown",
      bytes: art.bytes || 0,
      sha256: art.sha256 || null,
      vector: Boolean(art.vector),
      width_px: art.width || null,
      height_px: art.height || null,
      color_space: art.colorSpace || null,
      has_alpha: art.hasAlpha === undefined ? null : art.hasAlpha,
    },
    decision,
    summary: summarize(decision, checks),
    checks,
    decided_at: new Date().toISOString(),
  };
}

function draftCustomerMessage(result) {
  const fails = result.checks.filter((c) => c.level === "fail");
  if (result.decision !== "NEEDS_FIX" || fails.length === 0) return null;
  const lines = fails.map((f) => `- ${f.message}${f.evidence ? ` (${f.evidence})` : ""}`).join("\n");
  return [
    `Hi${result.customer ? " " + result.customer : ""},`,
    "",
    `Thanks for your artwork for order ${result.job_id}. Before we can print it, we need one fix:`,
    "",
    lines,
    "",
    "Re-upload an updated file and we will re-check it right away. Your order is not in production yet.",
    "",
    "Preflight",
  ].join("\n");
}

function runJob(job, specs) {
  let art;
  try {
    art = readArtwork(job.artwork);
  } catch (e) {
    art = { error: e.message, file: job.artwork ? path.basename(job.artwork) : null };
  }
  return evaluate(job, specs, art);
}

// ---------------------------------------------------------------------------
// outputs + cli
// ---------------------------------------------------------------------------

function loadSpecs(specsPath) {
  const p = specsPath || path.join(__dirname, "preflight-specs.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeOutputs(results, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "decisions.json"), JSON.stringify(results, null, 2), "utf8");

  const auditPath = path.join(outDir, "audit.log");
  const lines = results.map((r) =>
    JSON.stringify({
      at: r.decided_at,
      agent: r.agent,
      spec_version: r.spec_version,
      job_id: r.job_id,
      product: r.product,
      file: r.artwork.file,
      sha256: r.artwork.sha256,
      decision: r.decision,
      reasons: r.checks.filter((c) => c.level !== "pass" && c.level !== "info").map((c) => `${c.level}:${c.id}`),
    })
  );
  fs.appendFileSync(auditPath, lines.join("\n") + "\n", "utf8");

  const msgDir = path.join(outDir, "messages");
  const messages = results
    .map((r) => ({ r, text: draftCustomerMessage(r) }))
    .filter((x) => x.text);
  if (messages.length) {
    fs.mkdirSync(msgDir, { recursive: true });
    for (const { r, text } of messages) {
      fs.writeFileSync(path.join(msgDir, `${r.job_id || "job"}.txt`), text, "utf8");
    }
  }
  return { decisions: path.join(outDir, "decisions.json"), audit: auditPath, messages: messages.length };
}

function parseSize(raw) {
  const m = String(raw).match(/([\d.]+)\s*x\s*([\d.]+)/i);
  if (!m) return [null, null];
  return [parseFloat(m[1]), parseFloat(m[2])];
}

function printHelp() {
  console.log(`Preflight - autonomous artwork QA agent (${AGENT})

Usage
  node preflight/preflight.js --job <job.json>
  node preflight/preflight.js --dir <folder> --product <id> --size <WxH> [--out <folder>]
  node preflight/preflight.js --help

Options
  --job <file>      Run a single job JSON (job_id, product, ordered_width_in,
                    ordered_height_in, artwork, customer, quantity)
  --dir <folder>    Run every artwork file in a folder, unattended
  --product <id>    Product id from preflight-specs.json (default die-cut-sticker)
  --size <WxH>      Ordered size in inches (default 3x3)
  --specs <file>    Alternate specs file
  --out <folder>    Output folder (default preflight-out)
  --help            Show this text

Decisions
  AUTO_APPROVED  no blocking issues; safe to skip the human queue
  HUMAN_REVIEW   a warning or ambiguous result; a human decides
  NEEDS_FIX      a hard blocker; the customer is sent a specific fix
`);
}

function parseArgs(argv) {
  const args = { _: [] };
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
    } else {
      args._.push(a);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.job && !args.dir)) {
    printHelp();
    return;
  }

  const specs = loadSpecs(args.specs);
  const outDir = path.resolve(args.out || "preflight-out");
  let jobs = [];

  if (args.job) {
    jobs = [JSON.parse(fs.readFileSync(args.job, "utf8"))];
  } else {
    const [ow, oh] = parseSize(args.size || "3x3");
    const product = args.product || "die-cut-sticker";
    const files = fs
      .readdirSync(args.dir)
      .filter((f) => ARTWORK_EXT.has(path.extname(f).toLowerCase()))
      .sort();
    jobs = files.map((f, idx) => ({
      job_id: `AUTO-${String(idx + 1).padStart(4, "0")}`,
      product,
      ordered_width_in: ow,
      ordered_height_in: oh,
      customer: null,
      artwork: path.join(args.dir, f),
    }));
  }

  const results = jobs.map((j) => runJob(j, specs));
  const out = writeOutputs(results, outDir);

  console.log(`Preflight ${AGENT} | spec ${specs.spec_version} | ${results.length} job(s)`);
  console.log("");
  for (const r of results) {
    console.log(`${r.job_id.padEnd(12)} ${r.decision.padEnd(14)} ${r.artwork.file}`);
    if (r.decision !== "AUTO_APPROVED") console.log(`${"".padEnd(12)} -> ${r.summary}`);
  }
  const count = (d) => results.filter((r) => r.decision === d).length;
  console.log("");
  console.log(`AUTO_APPROVED ${count("AUTO_APPROVED")} | HUMAN_REVIEW ${count("HUMAN_REVIEW")} | NEEDS_FIX ${count("NEEDS_FIX")}`);
  console.log(`Decisions: ${out.decisions}`);
  console.log(`Audit log: ${out.audit}`);
  if (out.messages) console.log(`Customer messages written: ${out.messages}`);
}

if (require.main === module) main();

module.exports = {
  AGENT,
  detectFormat,
  readPng,
  readJpeg,
  readGif,
  readPdf,
  readSvg,
  readArtwork,
  evaluate,
  decide,
  draftCustomerMessage,
  runJob,
  loadSpecs,
  writeOutputs,
};
