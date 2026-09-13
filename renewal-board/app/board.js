"use client";

import { useMemo, useState } from "react";
import { createSupabaseClient, readSupabaseConfig } from "@/lib/supabase";

const TYPE_LABEL = {
  policy_renewal: "Policy renewal",
  loan_file: "Loan file",
  cold_lead: "Cold lead",
};

const CLOSED = new Set(["won", "lost", "closed"]);
const OWNER = "__owner__";

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function todayStr() {
  return localDateStr(new Date());
}

function parseLocal(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(dateStr) {
  const a = parseLocal(dateStr).getTime();
  const b = parseLocal(todayStr()).getTime();
  return Math.round((a - b) / 86400000);
}

function effectiveDate(r) {
  return r.due_date || r.next_contact_date || null;
}

function formatINR(paise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(paise || 0) / 100);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return parseLocal(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dueMeta(r) {
  const d = effectiveDate(r);
  if (!d) return { tone: "later", label: "No date", cls: "later" };
  const n = daysUntil(d);
  const isLead = r.record_type === "cold_lead";
  const word = isLead ? "Contact" : "Due";
  if (n < 0)
    return { tone: "overdue", label: "Overdue by " + Math.abs(n) + "d", cls: "overdue", n };
  if (n === 0) return { tone: "soon", label: word + " today", cls: "soon", n };
  if (n <= 7) return { tone: "soon", label: word + " in " + n + "d", cls: "soon", n };
  return { tone: "later", label: word + " in " + n + "d", cls: "later", n };
}

function priorityCompare(a, b) {
  const t = todayStr();
  const ad = effectiveDate(a);
  const bd = effectiveDate(b);
  const aOver = ad && ad < t && !CLOSED.has(a.status) ? 0 : 1;
  const bOver = bd && bd < t && !CLOSED.has(b.status) ? 0 : 1;
  if (aOver !== bOver) return aOver - bOver;
  const ax = ad || "9999-12-31";
  const bx = bd || "9999-12-31";
  if (ax !== bx) return ax < bx ? -1 : 1;
  return Number(b.amount_at_risk_paise || 0) - Number(a.amount_at_risk_paise || 0);
}

function computeTotals(rows) {
  const t = todayStr();
  let amount = 0;
  let overdue = 0;
  let dueToday = 0;
  let followupsToday = 0;
  for (const r of rows) {
    amount += Number(r.amount_at_risk_paise || 0);
    const d = effectiveDate(r);
    if (d && d < t && !CLOSED.has(r.status)) overdue += 1;
    if (d === t && !CLOSED.has(r.status)) dueToday += 1;
    if (r.last_activity_at && localDateStr(new Date(r.last_activity_at)) === t)
      followupsToday += 1;
  }
  return { count: rows.length, amount, overdue, dueToday, followupsToday };
}

export default function Board({ initialRecords }) {
  const [records, setRecords] = useState(initialRecords);
  const [viewingAs, setViewingAs] = useState(OWNER);
  const [product, setProduct] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const handlers = useMemo(
    () => Array.from(new Set(records.map((r) => r.handler).filter(Boolean))).sort(),
    [records]
  );
  const products = useMemo(
    () => Array.from(new Set(records.map((r) => r.product).filter(Boolean))).sort(),
    [records]
  );

  const visible = useMemo(() => {
    let rows = records;
    if (viewingAs !== OWNER) rows = rows.filter((r) => r.handler === viewingAs);
    if (product !== "all") rows = rows.filter((r) => r.product === product);
    return [...rows].sort(priorityCompare);
  }, [records, viewingAs, product]);

  const totals = useMemo(() => computeTotals(visible), [visible]);

  async function logActivity(record, type) {
    const now = new Date().toISOString();
    const nextStatus = CLOSED.has(record.status) ? record.status : "contacted";
    const nextCount = Number(record.activity_count || 0) + 1;
    const snapshot = records;

    setRecords((rows) =>
      rows.map((r) =>
        r.id === record.id
          ? {
              ...r,
              last_activity_at: now,
              last_activity_type: type,
              activity_count: nextCount,
              status: nextStatus,
            }
          : r
      )
    );
    setBusyId(record.id);
    setError("");

    const { url, key, missing } = readSupabaseConfig();
    if (missing.length) {
      setRecords(snapshot);
      setError("Missing setting: " + missing.join(", "));
      setBusyId(null);
      return;
    }

    const supabase = createSupabaseClient(url, key);
    const { error: updateError } = await supabase
      .from("records")
      .update({
        last_activity_at: now,
        last_activity_type: type,
        activity_count: nextCount,
        status: nextStatus,
      })
      .eq("id", record.id);

    if (updateError) {
      setRecords(snapshot);
      setError("Could not save the " + type + ": " + updateError.message);
    }
    setBusyId(null);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>Renewal &amp; Lead Follow-Up Board</h1>
          <p>Every renewal, loan file and cold lead — {totals.count} in view</p>
        </div>
        <div className="viewswitch">
          <label htmlFor="rm">Relationship manager</label>
          <select
            id="rm"
            value={viewingAs}
            onChange={(e) => setViewingAs(e.target.value)}
          >
            <option value={OWNER}>Owner — everyone</option>
            {handlers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="totals" aria-label="Totals">
        <div className="stat">
          <div className="label">Records in view</div>
          <div className="value">{totals.count}</div>
        </div>
        <div className="stat risk">
          <div className="label">Amount at risk</div>
          <div className="value">{formatINR(totals.amount)}</div>
        </div>
        <div className="stat overdue">
          <div className="label">Overdue</div>
          <div className="value">{totals.overdue}</div>
        </div>
        <div className="stat today">
          <div className="label">Due today</div>
          <div className="value">{totals.dueToday}</div>
        </div>
        <div className="stat">
          <div className="label">Follow-ups today</div>
          <div className="value">{totals.followupsToday}</div>
        </div>
      </section>

      <div className="filters">
        <label htmlFor="product" className="hint">
          Product
        </label>
        <select
          id="product"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        >
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="hint">
          Pick a relationship manager above to see only their list.
        </span>
      </div>

      {viewingAs !== OWNER && (
        <div className="banner scope">
          Showing only {viewingAs}&rsquo;s list. The owner sees every list.
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      {visible.length === 0 ? (
        <div className="empty-filter">
          No records match this filter. Clear the product filter or choose the
          owner to see everyone.
        </div>
      ) : (
        <div className="list">
          {visible.map((r) => {
            const meta = dueMeta(r);
            const busy = busyId === r.id;
            return (
              <article key={r.id} className={"card " + meta.cls}>
                <div className="card-top">
                  <div>
                    <div className="who">{r.customer_name}</div>
                    <div className="type">{TYPE_LABEL[r.record_type] || r.record_type}</div>
                  </div>
                  <div className="type">{r.product}</div>
                </div>

                <div className="card-meta">
                  <div className="meta-item">
                    <span className="k">{r.record_type === "cold_lead" ? "Next contact" : "Due"}</span>
                    <span className="v">{formatDate(effectiveDate(r))}</span>
                  </div>
                  <div className="meta-item">
                    <span className="k">Handler</span>
                    <span className="v">{r.handler}</span>
                  </div>
                  <div className="meta-item">
                    <span className="k">Amount at risk</span>
                    <span className="v">
                      {r.amount_at_risk_paise == null
                        ? "—"
                        : formatINR(r.amount_at_risk_paise)}
                    </span>
                  </div>
                </div>

                <div className="badges">
                  <span className={"badge " + meta.tone}>{meta.label}</span>
                  <span className="badge plain">
                    {CLOSED.has(r.status) ? r.status : r.status}
                  </span>
                  <span className="badge plain">
                    {r.activity_count
                      ? r.activity_count +
                        " follow-up" +
                        (r.activity_count === 1 ? "" : "s") +
                        (r.last_activity_type ? " (" + r.last_activity_type + ")" : "")
                      : "No follow-up yet"}
                  </span>
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => logActivity(r, "call")}
                  >
                    {busy ? "Saving…" : "Log call"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => logActivity(r, "visit")}
                  >
                    Log visit
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
