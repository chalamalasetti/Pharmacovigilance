// Account and team page: email sign-in, sync status, display name, and creating,
// joining, switching and leaving teams. An invite link (account.html?join=CODE)
// offers to join that team, after sign-in if needed.

import * as workspace from "./workspace.js";
import { el } from "./impact-view.js";
import * as cloud from "./cloud.js";
import {PROFESSIONAL_ROLES,loginAlias,newPassword,passwordSignIn} from "./account-auth.js";
let recovery=false;
try{recovery=new URLSearchParams(location.hash.slice(1)).get("type")==="recovery"||sessionStorage.getItem("pv-password-recovery")==="1";}catch{}

const $ = (id) => document.getElementById(id);
const PENDING = "pv-join";
const ws = workspace.load();

const busy = async (msgEl, fn) => {
  msgEl.textContent = "Working…";
  try {
    await fn();
    if (msgEl.textContent === "Working…") msgEl.textContent = "";
  } catch (e) {
    msgEl.textContent = e.message || String(e);
  }
};

const joinCode = () => {
  const asked = new URLSearchParams(location.search).get("join");
  try {
    if (asked) sessionStorage.setItem(PENDING, asked);
    return asked || sessionStorage.getItem(PENDING);
  } catch {
    return asked;
  }
};
const clearJoin = () => {
  try {
    sessionStorage.removeItem(PENDING);
  } catch {}
  history.replaceState(null, "", "account.html");
};

function renderSync(s) {
  const at = s.at ? s.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  $("sync-msg").textContent = {
    syncing: "Syncing your briefing profile, groups and actions…",
    synced: `Your briefing profile, groups and actions are synced across your devices (last synced ${at}).`,
    error: `Couldn't sync just now: ${s.error?.message ?? "unknown error"}. Your changes are safe in this browser and will sync next time.`,
    off: "",
  }[s.state];
}

function renderTeams() {
  const t = cloud.team;
  const code = joinCode();
  const already = t.list.find((x) => x.code === code);
  $("invited").hidden = !code || Boolean(already);
  if (code && !already) {
    $("invited").replaceChildren(
      el("p", {}, el("b", {}, "You've been invited to a team. "), "Join it to share its review queue."),
      el("div", { class: "row" },
        el("button", { type: "button", class: "primary", onclick: () => busy($("team-msg"), async () => (await cloud.joinTeam(ws, code), clearJoin(), renderTeams())) }, "Join the team"),
        el("button", { type: "button", onclick: () => (clearJoin(), renderTeams()) }, "Not now"),
      ),
    );
  } else if (already) clearJoin();

  $("team-list").replaceChildren(
    ...[t.list.length > 1
      ? el("div", { class: "row" }, el("span", { class: "label" }, "Active team"),
          ...t.list.map((x) => el("button", { type: "button", class: "chip", "aria-pressed": String(x.id === t.id), onclick: () => busy($("team-msg"), async () => (await cloud.setActiveTeam(ws, x.id), renderTeams())) }, x.name)))
      : t.list.length ? null : el("p", { class: "empty small" }, "You're not in a team yet. Create one and invite colleagues, or join with an invite code.")].filter(Boolean),
  );

  if (!t.id) return $("team-detail").replaceChildren();
  const owner = t.role === "owner";
  const link = cloud.inviteLink(t.code);
  $("team-detail").replaceChildren(
    el("h3", {}, t.name, " ", el("span", { class: "why" }, owner ? "(you're an owner)" : "")),
    el("div", { class: "row" },
      el("span", {}, "Invite link: "), el("code", { class: "invite" }, link),
      el("button", { type: "button", onclick: async (e) => {
        try {
          await navigator.clipboard.writeText(link);
          e.target.textContent = "Copied";
        } catch {
          e.target.textContent = "Copy failed";
        }
        setTimeout(() => (e.target.textContent = "Copy link"), 1500);
      } }, "Copy link"),
      owner ? el("button", { type: "button", title: "The old link stops working", onclick: () => busy($("team-msg"), async () => (await cloud.newInviteCode(ws), renderTeams())) }, "New link") : null,
    ),
    el("p", { class: "hint" }, "Anyone with the link can join after signing in, so share it only with your team."),
    el("ul", { class: "upcoming members" },
      t.members.map((m) => el("li", {},
        el("b", {}, m.email || "Member"), el("span", { class: "why" }, `${m.email ?? ""}${m.role === "owner" ? " · owner" : ""}`),
        m.user_id === t.me?.id
          ? el("button", { type: "button", class: "act", onclick: () => confirm(`Leave ${t.name}? You'll lose access to its queue.`) && busy($("team-msg"), async () => (await cloud.removeMember(ws, m.user_id), renderTeams())) }, "Leave")
          : owner ? el("button", { type: "button", class: "act", onclick: () => confirm(`Remove ${m.email} from ${t.name}?`) && busy($("team-msg"), async () => (await cloud.removeMember(ws, m.user_id), renderTeams())) }, "Remove") : null,
      )),
    ),
    el("p", {}, el("a", { href: "team.html" }, "Open the team queue →")),
  );
}

async function main() {
  const sb = await cloud.client();
  if (!sb) {
    $("lede").textContent = "PV Info works without an account: your briefing and actions stay in this browser.";
    $("off").hidden = false;
    return;
  }
  // Coming back from the emailed link, the library reads the session from the address.
  const user = await cloud.currentUser();
  cloud.team.me = user;
  cloud.markNav();
  if (!user) {
    $("lede").textContent = joinCode()
      ? "Sign in to join the team you were invited to."
      : "Sign in to keep your briefing profile, groups and actions on every device, and to share a review queue with your team.";
    $("signin").hidden = false;
    setupLogin(sb);
    return;
  }

  $("lede").textContent = "You're signed in.";
  $("me-title").textContent = `Signed in as ${user.email}`;
  $("me").hidden = false;
  cloud.isAdmin().then((yes) => ($("admin-link").hidden = !yes));
  await setupProfile(sb,user);
  cloud.onSync(renderSync);
  $("signout").addEventListener("click", async () => {
    await cloud.signOut();
    location.reload();
  });

  $("teams").hidden = false;
  $("create-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy($("team-msg"), async () => {
      await cloud.createTeam(ws, $("team-name").value.trim());
      $("team-name").value = "";
      renderTeams();
    });
  });
  $("join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    // Accept a pasted invite link as well as the bare code.
    const raw = $("code").value.trim();
    const code = raw.match(/[?&]join=([^&#]+)/)?.[1] ?? raw;
    busy($("team-msg"), async () => {
      await cloud.joinTeam(ws, decodeURIComponent(code));
      $("code").value = "";
      renderTeams();
    });
  });

  await cloud.initCloud(ws);
  renderTeams();
}

function roleOptions(id){$(id).replaceChildren(el('option',{value:''},'Choose a role (optional)'),...PROFESSIONAL_ROLES.map(r=>el('option',{value:r},r)));}
function formAction(id,msg,fn){$(id).addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button[type="submit"]');button.disabled=true;try{await busy($(msg),fn);}finally{button.disabled=false;}});}
function setupLogin(sb){
 roleOptions('signup-role');
 document.querySelectorAll('[data-auth-mode]').forEach(button=>button.onclick=()=>{const mode=button.dataset.authMode;for(const [id,key]of [['password-login','login'],['signup-form','signup'],['recovery-form','recovery']])$(id).hidden=key!==mode;document.querySelectorAll('[data-auth-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('signin-msg').textContent='';});
 formAction('password-login','signin-msg',async()=>{await passwordSignIn(sb,$('login-id').value,$('login-password').value);$('login-password').value='';location.reload();});
 formAction('signup-form','signin-msg',async()=>{const password=newPassword($('signup-password').value,$('signup-confirm').value),alias=loginAlias($('signup-alias').value);const r=await sb.auth.signUp({email:$('signup-email').value.trim(),password,options:{emailRedirectTo:new URL('account.html',location.href).href,data:{login_alias:alias,professional_role:$('signup-role').value||null}}});if(r.error)throw Error('Could not create the account. Try another user ID, or recover your existing account using your email.');$('signup-password').value='';$('signup-confirm').value='';if(r.data.session)location.reload();else $('signin-msg').textContent='Check your email to confirm the account, then sign in. If you already have an account, use password recovery.';});
 formAction('recovery-form','signin-msg',async()=>{const r=await sb.auth.resetPasswordForEmail($('recovery-email').value.trim(),{redirectTo:new URL('account.html',location.href).href});if(r.error)throw Error('Recovery email could not be requested. Please try again later.');$('signin-msg').textContent='If this email has an eligible account, you will receive a password reset link. Check your spam folder too.';});
 formAction('signin-form','signin-msg',async()=>{await cloud.signIn($('email').value.trim());$('signin-msg').textContent='Check your email for a sign-in link.';});
 // Links opened in an already loaded tab can establish a recovery session later.
 window.addEventListener('pv-auth-change',e=>{if(e.detail?.event==='PASSWORD_RECOVERY'||e.detail?.event==='SIGNED_IN')location.reload();});
}
async function setupProfile(sb,user){
 roleOptions('profile-role');let loaded=false;
 try{const r=await sb.from('account_profiles').select('login_alias,professional_role').eq('user_id',user.id).maybeSingle();if(r.error)throw r.error;$('profile-alias').value=r.data?.login_alias??'';$('profile-role').value=r.data?.professional_role??'';loaded=true;}catch{$('profile-msg').textContent='Account preferences could not load. Reload before editing.';}
 $('profile-form').querySelector('button').disabled=!loaded;
 formAction('profile-form','profile-msg',async()=>{if(!loaded)throw Error('Reload account preferences first.');const r=await sb.from('account_profiles').upsert({user_id:user.id,login_alias:loginAlias($('profile-alias').value,{optional:true}),professional_role:$('profile-role').value||null,updated_at:new Date().toISOString()});if(r.error)throw Error('Preferences could not be saved. That user ID may already be in use.');$('profile-msg').textContent='Saved. Your permissions have not changed.';});
 formAction('set-password','password-msg',async()=>{const password=newPassword($('new-password').value,$('new-password-confirm').value);const r=await sb.auth.updateUser({password});if(r.error)throw Error('Password could not be changed. Request a fresh recovery email and try again.');$('new-password').value='';$('new-password-confirm').value='';try{sessionStorage.removeItem('pv-password-recovery');}catch{}recovery=false;$('password-msg').textContent='Password updated. You can now sign in with your email or saved user ID.';});
 const showRecovery=()=>{let flag=recovery;try{flag ||= sessionStorage.getItem('pv-password-recovery')==='1';}catch{}if(flag){$('password-settings').open=true;$('password-msg').textContent='Recovery link accepted. Choose a new password below.';$('password-settings').scrollIntoView({block:'center'});}};
 showRecovery();window.addEventListener('pv-auth-change',e=>{if(e.detail?.event==='PASSWORD_RECOVERY')showRecovery();if(e.detail?.event==='SIGNED_OUT')location.reload();});
}
main().catch(e=>{$('lede').textContent='Account could not load. Please refresh and try again.';});
