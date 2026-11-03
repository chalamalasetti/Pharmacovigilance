// Account and team page: email sign-in, sync status, display name, and creating,
// joining, switching and leaving teams. An invite link (account.html?join=CODE)
// offers to join that team, after sign-in if needed.

import * as workspace from "./workspace.js";
import {callbackError} from "./auth-callback.js";
const linkError=callbackError(location.href);
import { el } from "./impact-view.js";
import * as cloud from "./cloud.js";
import {PROFESSIONAL_ROLES,loginAlias,newPassword,passwordSignIn,emailSignIn} from "./account-auth.js";
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
    if(linkError){$("signin-msg").textContent=linkError;history.replaceState(null,"","account.html");}
    return;
  }

  $("lede").textContent = "You're signed in.";
  $("me-title").textContent = user.app_metadata?.pv_managed ? "Signed in" : `Signed in as ${user.email}`;
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
 formAction('first-password','signin-msg',async()=>{const password=newPassword($('first-new-password').value,$('first-new-confirm').value);if(password.length>72)throw Error('Use 12–72 characters.');const r=await fetch('/api/account-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'change',alias:$('login-id').value.trim().toLowerCase(),password:$('login-password').value,newPassword:password})});const result=await r.json();if(!r.ok)throw Error(result.error??'Password setup failed.');$('login-password').value='';$('first-new-password').value='';$('first-new-confirm').value='';$('first-password').hidden=true;$('signin-msg').textContent='Permanent password saved. Sign in above with your user ID and new password.';});
 formAction('signin-form','signin-msg',async()=>{await emailSignIn(sb,$('email').value,new URL('account.html',location.href).href);$('signin-msg').textContent='If this is an eligible existing account, check your email for the newest sign-in link. After signing in, use Account → Set or change password to set a password.';});
 formAction('password-login','signin-msg',async()=>{const result=await passwordSignIn(sb,$('login-id').value,$('login-password').value);if(result?.changeRequired){$('first-password').hidden=false;$('signin-msg').textContent='Temporary password verified. Choose a permanent password below before accessing PV Info.';return;}$('login-password').value='';location.reload();});
 // Defer navigation until the SDK releases its Auth callback lock.
 window.addEventListener('pv-auth-change',e=>{if(e.detail?.event==='PASSWORD_RECOVERY'||e.detail?.event==='SIGNED_IN')setTimeout(()=>location.reload(),0);});
}
async function setupProfile(sb,user){
 roleOptions('profile-role');let loaded=false;
 try{const r=await sb.from('account_profiles').select('login_alias,professional_role').eq('user_id',user.id).maybeSingle();if(r.error)throw r.error;$('profile-alias').value=r.data?.login_alias??'';if(r.data?.login_alias)$('me-title').textContent=`Signed in as ${r.data.login_alias}`;$('profile-role').value=r.data?.professional_role??'';loaded=true;}catch{$('profile-msg').textContent='Account preferences could not load. Reload before editing.';}
 $('profile-form').querySelector('button').disabled=!loaded;
 formAction('profile-form','profile-msg',async()=>{if(!loaded)throw Error('Reload account preferences first.');const r=await sb.from('account_profiles').upsert({user_id:user.id,login_alias:loginAlias($('profile-alias').value,{optional:true}),professional_role:$('profile-role').value||null,updated_at:new Date().toISOString()});if(r.error)throw Error('Preferences could not be saved. That user ID may already be in use.');$('profile-msg').textContent='Saved. Your permissions have not changed.';});
 formAction('set-password','password-msg',async()=>{const password=newPassword($('new-password').value,$('new-password-confirm').value);const r=await sb.auth.updateUser({password});if(r.error)throw Error(r.error.code==='same_password'?'Choose a different new password.':'Password could not be changed. Contact the site administrator for account recovery.');$('new-password').value='';$('new-password-confirm').value='';try{sessionStorage.removeItem('pv-password-recovery');}catch{}recovery=false;$('password-msg').textContent='Password updated. You can now sign in with your email or saved user ID.';});
 const showRecovery=()=>{let flag=recovery;try{flag ||= sessionStorage.getItem('pv-password-recovery')==='1';}catch{}if(flag){$('password-settings').open=true;$('password-msg').textContent='Recovery link accepted. Choose a new password below.';$('password-settings').scrollIntoView({block:'center'});}};
 showRecovery();window.addEventListener('pv-auth-change',e=>{if(e.detail?.event==='PASSWORD_RECOVERY')showRecovery();if(e.detail?.event==='SIGNED_OUT')location.reload();});
}
main().catch(e=>{$('lede').textContent='Account could not load. Please refresh and try again.';});
