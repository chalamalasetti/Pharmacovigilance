// Draws an update's impact card and its actions (save, follow, assess, assign,
// dismiss with a reason). Used by the main list, My PV Briefing, the team queue
// and the archive. When the reader is in a team, assessments, assignments and
// dismissals also go to the team's shared queue (cloud.js).

import { impactCard, cardText, DATE_LABELS } from "./impact.js";
import { ASSESSMENT, DISMISS_REASONS, item, update, reviewStatus, snapshot } from "./workspace.js";
import { team, teamAction, teamSummary } from "./cloud.js";

export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...kids.flat().filter((k) => k != null && k !== false));
  return n;
};

const fmtDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const today = () => new Date().toISOString();

// Small badges for what the reader has done with an update.
export function statusBadges(rec) {
  const out = [];
  if (rec.saved) out.push(el("span", { class: "ws-badge" }, "★ Saved"));
  if (rec.followed) out.push(el("span", { class: "ws-badge" }, "🔔 Following"));
  if (rec.assess) out.push(el("span", { class: `ws-badge a-${rec.assess.status}` }, ASSESSMENT.find((a) => a.id === rec.assess.status)?.label ?? "Assessed"));
  if (rec.assign) out.push(el("span", { class: "ws-badge" }, `→ ${rec.assign.to}`));
  if (rec.dismissed) out.push(el("span", { class: "ws-badge dim" }, `Dismissed: ${rec.dismissed.reason}`));
  return out;
}

const matched = (x) => el("span", { class: "why" }, `matched “${x.trigger}”`);

function impactList(xs, none) {
  if (!xs.length) return el("p", { class: "none" }, none);
  return el("ul", { class: "imp-list" }, xs.map((x) => el("li", {}, x.text, " ", matched(x))));
}

function datesBlock(card) {
  const rows = [];
  for (const type of ["published", "effective", "consultation", "transition", "deadline"]) {
    const ds = card.dates.filter((d) => d.type === type);
    if (!ds.length && type === "deadline") continue;
    rows.push(el("dt", {}, DATE_LABELS[type]));
    if (!ds.length) rows.push(el("dd", { class: "none" }, "Not stated in the source text"));
    for (const d of ds) {
      rows.push(
        el(
          "dd",
          {},
          type === "published" ? (d.date ? fmtDate(d.date) : "Unknown") : d.value,
          d.quote ? el("span", { class: "why" }, ` from “${d.quote}”`) : type === "published" ? el("span", { class: "why" }, " per the feed") : null,
        ),
      );
    }
  }
  return el("dl", { class: "imp-dates" }, rows);
}

// The full card. ctx: { ws, countryName, onChange(id), technicalFirst }.
export function impactSection(u, ctx) {
  const card = impactCard(u, { countryName: ctx.countryName });
  const rec = () => item(ctx.ws, u.id);
  const wrap = el("section", { class: "impact", "aria-label": "Impact card" });
  if (u.companyContext) {
    const c = u.companyContext;
    wrap.append(el("div", {class:"company-context"}, el("h3",{},`${c.companyName} · Company applicability`),
      el("p",{},`Monitoring markets: ${(c.markets??[]).join(", ")} · Portfolio revision ${c.portfolioRevision}`),
      el("p",{},`Matched products: ${(c.products??[]).map(p=>`${p.brand} (${p.market})`).join(", ")}`),
      el("p",{class:"why"},c.reason), el("p",{class:"hint"},"Sent for assessment. Company applicability has not been confirmed."),
      c.outside ? el("p",{class:"warn"},"Outside monitoring markets; assess relevance before taking action.") : null,
      c.evidenceKind === "paper" ? el("p",{class:"hint"},"Research review only. This does not create a regulatory obligation or establish causality.") : null));
  }
  const panel = el("div", { class: "imp-panel" });
  const actions = el("div", { class: "imp-actions" });

  const change = (patch) => {
    // Keep a copy of the update so saved and assigned work outlives the 60-day feed.
    update(ctx.ws, u.id, { ...patch, snapshot: snapshot(u) });
    if (!Object.keys(rec()).some((k) => k !== "snapshot")) update(ctx.ws, u.id, { snapshot: null });
    const shared = Object.fromEntries(Object.entries(patch).filter(([k]) => ["assess", "assign", "dismissed"].includes(k)));
    if (team.id && Object.keys(shared).length) {
      teamMsg.textContent = "Saving to the team queue…";
      teamAction(u, shared).then(
        () => ((teamMsg.textContent = ""), draw()),
        (e) => (teamMsg.textContent = `Saved for you, but not to the team queue: ${e.message}`),
      );
    }
    draw();
    ctx.onChange?.(u.id);
  };

  function form(kind) {
    const r = rec();
    if (kind === "assess") {
      const status = el("select", { "aria-label": "Assessment" }, ASSESSMENT.map((a) => el("option", { value: a.id, selected: r.assess?.status === a.id }, a.label)));
      const note = el("textarea", { rows: 2, placeholder: "Rationale, products checked, next step…", "aria-label": "Assessment note" });
      note.value = r.assess?.note ?? "";
      return el("form", { class: "imp-form", onsubmit: (e) => (e.preventDefault(), change({ assess: { status: status.value, note: note.value.trim(), at: today() } })) },
        el("label", {}, "Assessment ", status), note,
        el("div", { class: "row" }, el("button", { type: "submit", class: "primary" }, "Save assessment"), r.assess ? el("button", { type: "button", onclick: () => change({ assess: null }) }, "Clear") : null, el("button", { type: "button", onclick: () => panel.replaceChildren() }, "Cancel")),
      );
    }
    if (kind === "assign") {
      // Email is the only personal identifier requested for assignments.
      const list = team.id ? el("datalist", { id: `members-${u.id}` }, team.members.map((m) => el("option", { value: m.email }, null))) : null;
      const to = el("input", { type: "email", placeholder: "Email", required: true, "aria-label": "Assign to", value: r.assign?.to ?? "", list: list ? `members-${u.id}` : null });
      const member = () => team.members.find((m) => m.email === to.value.trim());
      const due = el("input", { type: "date", "aria-label": "Due date", value: r.assign?.due ?? "" });
      const note = el("textarea", { rows: 2, placeholder: "What should they check?", "aria-label": "Assignment note" });
      note.value = r.assign?.note ?? "";
      const status = reviewStatus(r);
      const mail = () => {
        const body = `${note.value.trim() ? `${note.value.trim()}\n\n` : ""}${due.value ? `Due: ${due.value}\n\n` : ""}${cardText(u, card, { status })}`;
        const addr = member()?.email ?? (/@/.test(to.value) ? to.value.trim() : "");
        return `mailto:${encodeURIComponent(addr)}?subject=${encodeURIComponent(`PV review: ${u.title}`)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
      };
      const assign = () => {
        const m = member();
        return { to: to.value.trim(), due: due.value, note: note.value.trim(), at: today(), ...(m && { user_id: m.user_id, email: m.email }) };
      };
      return el("form", { class: "imp-form", onsubmit: (e) => (e.preventDefault(), change({ assign: assign() })) },
        el("div", { class: "row" }, el("label", {}, "Assign to ", to, list), el("label", {}, "Due ", due)), note,
        el("p", { class: "hint" }, team.id ? `Shared with ${team.name}: a teammate sees it under Team → Assigned to me. Use “Email” to tell them too.` : "Assignments are kept in this browser only. Sign in and join a team to share them, or use “Email” to send the card."),
        el("div", { class: "row" },
          el("button", { type: "submit", class: "primary" }, "Save assignment"),
          el("button", { type: "button", onclick: () => (location.href = mail()) }, "✉ Email"),
          r.assign ? el("button", { type: "button", onclick: () => change({ assign: null }) }, "Unassign") : null,
          el("button", { type: "button", onclick: () => panel.replaceChildren() }, "Cancel"),
        ),
      );
    }
    // dismiss
    const reason = el("select", { "aria-label": "Reason" }, DISMISS_REASONS.map((x) => el("option", { selected: r.dismissed?.reason === x }, x)));
    const note = el("input", { type: "text", placeholder: "Note (required for “Other”)", "aria-label": "Dismiss note", value: r.dismissed?.note ?? "" });
    return el("form", { class: "imp-form", onsubmit: (e) => {
        e.preventDefault();
        if (reason.value === "Other" && !note.value.trim()) return note.focus();
        change({ dismissed: { reason: reason.value, note: note.value.trim(), at: today() } });
      } },
      el("div", { class: "row" }, el("label", {}, "Reason ", reason), note),
      el("div", { class: "row" }, el("button", { type: "submit", class: "primary" }, "Dismiss"), el("button", { type: "button", onclick: () => panel.replaceChildren() }, "Cancel")),
    );
  }

  const open = (kind) => {
    panel.replaceChildren(form(kind));
    panel.querySelector("select, input, textarea")?.focus();
  };

  function draw() {
    const r = rec();
    const act = (label, onclick, pressed) => el("button", { type: "button", class: "act", "aria-pressed": pressed == null ? null : String(Boolean(pressed)), onclick }, label);
    actions.replaceChildren(
      act(r.saved ? "★ Saved" : "☆ Save", () => change({ saved: !r.saved, savedAt: r.saved ? null : today() }), r.saved),
      act(r.followed ? "🔔 Following" : "🔔 Follow", () => change({ followed: !r.followed, followedAt: r.followed ? null : today(), follow: r.followed ? null : card.affected.substances }), r.followed),
      act(r.assess ? "✓ Assessed" : "Assess", () => open("assess"), Boolean(r.assess)),
      act(r.assign ? `→ ${r.assign.to}` : "Assign", () => open("assign"), Boolean(r.assign)),
      r.dismissed ? act("Restore", () => change({ dismissed: null })) : act("Dismiss…", () => open("dismiss")),
      act("Copy", async (e) => {
        try {
          await navigator.clipboard.writeText(cardText(u, card, { status: reviewStatus(r) }));
          e.target.textContent = "Copied";
        } catch {
          e.target.textContent = "Copy failed";
        }
        setTimeout(() => (e.target.textContent = "Copy"), 1500);
      }),
    );
    status.textContent = reviewStatus(r);
    notes.replaceChildren(
      ...[
      r.assess?.note ? el("p", {}, el("b", {}, "Assessment note: "), r.assess.note) : null,
      r.assign ? el("p", {}, el("b", {}, "Assigned to: "), r.assign.to, r.assign.due ? ` · due ${fmtDate(r.assign.due)}` : "", r.assign.note ? ` · ${r.assign.note}` : "") : null,
      r.dismissed ? el("p", {}, el("b", {}, "Dismissed: "), r.dismissed.reason, r.dismissed.note ? ` · ${r.dismissed.note}` : "") : null,
      team.id && team.items.get(u.id) ? el("p", { class: "team-line" }, el("b", {}, `${team.name}: `), teamSummary(team.items.get(u.id))) : null,
      ].filter(Boolean),
    );
  }

  const business = el("div", { class: "imp-block" }, el("h4", {}, "Business impact ", el("span", { class: "pot" }, "potential")), impactList(card.business, "No business implications detected by the rules."));
  const technical = el("div", { class: "imp-block" }, el("h4", {}, "Technical impact ", el("span", { class: "pot" }, "potential")), impactList(card.technical, "No technical implications detected by the rules."));
  const status = el("span");
  const notes = el("div", { class: "imp-notes" });
  const teamMsg = el("p", { class: "hint", role: "status" });
  const ev = card.evidence;
  wrap.append(
    el("div", { class: "imp-block" },
      el("h4", {}, "What changed"),
      el("p", { class: "changed" }, card.changed.from === "summary" ? `“${card.changed.text}”` : card.changed.text),
      el("p", { class: "why" }, card.changed.from === "summary" ? "Quoted from the source's own summary." : "Headline only: the source published no summary. Open the source for details."),
    ),
    el("div", { class: "imp-block" },
      el("h4", {}, "Who may be affected"),
      el("div", { class: "imp-chips" },
        card.affected.jurisdictions.map((j) => el("span", { class: "chip-s place" }, j)),
        card.affected.substances.map((s) => el("span", { class: "chip-s sub", title: "Detected by name pattern; not verified" }, `💊 ${s}`)),
        card.affected.roles.map((r) => el("span", { class: "chip-s role", title: `matched “${r.trigger}”` }, r.text)),
      ),
      card.affected.substances.length ? el("p", { class: "why" }, "Products and substances are detected by name pattern and may be incomplete.") : el("p", { class: "why" }, "No product or substance names detected in the text."),
    ),
    // Technical readers see technical impact first.
    el("div", { class: "imp-cols" }, ...(ctx.technicalFirst ? [technical, business] : [business, technical])),
    el("div", { class: "imp-block" }, el("h4", {}, "Dates"), datesBlock(card)),
    el("div", { class: "imp-block" },
      el("h4", {}, "Evidence"),
      el("dl", { class: "imp-dates" },
        el("dt", {}, "Source"), el("dd", {}, el("a", { href: ev.link, target: "_blank", rel: "noopener" }, ev.source), " · ", ev.official ? "Official regulator feed" : el("span", { class: "warn" }, "News report: confirm with the official notice")),
        el("dt", {}, "Relevant section"), el("dd", {}, ev.sections.length ? ev.sections.join(", ") : el("span", { class: "none" }, "Not named in the summary; see the source")),
        el("dt", {}, "Retrieved"), el("dd", {}, ev.retrieved ? fmtDate(ev.retrieved) : el("span", { class: "none" }, "Before retrieval dates were recorded")),
        el("dt", {}, "Review status"), el("dd", {}, status),
      ),
    ),
    notes,
    teamMsg,
    actions,
    panel,
    el("p", { class: "imp-foot" }, "Impact fields come from keyword rules applied to the source's headline and summary. “Potential” items are prompts to check, not conclusions."),
  );
  draw();
  return wrap;
}
