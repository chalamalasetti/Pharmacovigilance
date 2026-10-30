// "Missing a company?" on the Companies page: signed-in readers ask for a company to be
// added (supabase/schema.sql: company_requests), see what happened to their earlier
// requests, and admins answer them on the Admin page. Hidden when the site has no database.

import { el } from "./impact-view.js";
import * as cloud from "./cloud.js";

const $ = (id) => document.getElementById(id);
const STATUS = { open: "waiting for an admin", added: "added", declined: "not added" };

async function mine(sb) {
  const { data } = await sb.from("company_requests").select("name,status,company_id,created_at").order("created_at", { ascending: false }).limit(10);
  $("my-requests").replaceChildren(
    ...(data ?? []).map((r) => el("li", {}, el("b", {}, r.name), " · ", r.status === "added" && r.company_id ? el("a", { href: `company.html?id=${encodeURIComponent(r.company_id)}` }, STATUS.added) : STATUS[r.status], el("span", { class: "hint" }, ` · asked ${r.created_at.slice(0, 10)}`))),
  );
}

async function main() {
  const sb = await cloud.client();
  if (!sb) return;
  $("request-sec").hidden = false;
  const user = await cloud.currentUser();
  if (!user) {
    $("request-lede").replaceChildren("The list covers large and regional groups first. ", el("a", { href: "account.html" }, "Sign in"), " to ask for a company to be added.");
    return;
  }
  $("request-lede").textContent = "The list covers large and regional groups first. Ask for a company and an admin will review it; it appears here once added.";
  const form = $("request-form");
  form.hidden = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = (n) => form.elements[n].value.trim() || null;
    $("request-msg").textContent = "Sending…";
    const { error } = await sb.from("company_requests").insert({ name: v("name"), country: v("country"), website: v("website"), note: v("note") });
    if (error) return void ($("request-msg").textContent = error.message);
    form.reset();
    $("request-msg").textContent = "Thanks. An admin will review it.";
    mine(sb);
  });
  mine(sb);
}

main();
