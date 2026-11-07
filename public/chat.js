import {createBusinessChat} from './business-chat.js';
import {createLabelQuestionChat} from './label-question-chat.js';
import {createProductIntelligence} from './product-intelligence.js';
import {createIntelligenceChat} from './intelligence-chat.js';
import {fetchData} from './data-fetch.js';
// "Ask PV Info": a chat bubble in the bottom-right corner. Readers ask about a
// country, agency, topic or drug and get the matching updates back, each linked
// to its regulator notice or news report. Answers come from chat-lib.js over the
// site's own data, using explicit evidence and coverage limits.

import { buildIndex, reply } from "./chat-lib.js";

let businessChat,labelQuestionChat,intelligenceChat,intelligenceLayer;
let responseQueue=Promise.resolve(),conversationEpoch=0;
const TEASED = "pv-chat-teased";
let index = null;
let loading = null;

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

async function json(url) {
  try {
    const res = await fetchData(url, { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const loadIndex = () => (loading ??= Promise.all([json("data/updates.json"), json("data/agencies.json")]).then(([d, a]) => (index = buildIndex(d, a))));

const fab = el("button", { type: "button", className: "chat-fab", ariaLabel: "Ask PV Info: chat about the latest PV updates", title: "Ask PV Info" }, [
  el("span", { className: "chat-fab-ico", ariaHidden: "true", textContent: "💬" }),
]);
fab.setAttribute("aria-expanded", "false");
fab.setAttribute("aria-controls", "chatPanel");

const log = el("div", { className: "chat-log", role: "log", ariaLive: "polite" });
const chips = el("div", { className: "chat-chips" });
const input = el("input", { type: "text", className: "chat-input", placeholder: "Ask about a product, label history or PV updates…", ariaLabel: "Ask about PV updates", enterKeyHint: "send", maxLength: 500, autocomplete: "off" });
const send = el("button", { type: "submit", className: "chat-send", ariaLabel: "Send", textContent: "➤" });
const form = el("form", { className: "chat-form" }, [input, send]);
const close = el("button", { type: "button", className: "chat-close", ariaLabel: "Close chat", textContent: "×" });
const panel = el("section", { className: "chat-panel", id: "chatPanel", ariaLabel: "Ask PV Info", hidden: true }, [
  el("header", { className: "chat-head" }, [
    el("span", { className: "chat-avatar", ariaHidden: "true", textContent: "🛡️" }),
    el("div", {}, [el("b", { textContent: "Ask PV Info" }), el("span", { textContent: "products, labels and PV updates · with sources" })]),
    el('button',{type:'button',className:'chat-expand',ariaLabel:'Expand chat',textContent:'⤢',onclick:()=>{const expanded=panel.classList.toggle('chat-expanded');panel.querySelector('.chat-expand').ariaLabel=expanded?'Restore chat size':'Expand chat';}}),
    el('button',{type:'button',className:'chat-clear',ariaLabel:'Clear conversation',textContent:'↺',onclick:()=>{conversationEpoch++;labelQuestionChat.reset();intelligenceChat.reset();intelligenceLayer.clear();businessChat.reset();businessChat=createBusinessChat({el,bubble,json});log.replaceChildren();chips.replaceChildren();bubble('bot',[el('p',{textContent:'Conversation cleared. Ask a new product or business question.'})]);}}),
    close,
  ]),
  log,
  chips,
  form,
  el("p", { className: "chat-foot", textContent: "Uses the shared Product Intelligence evidence layer and retrieved label versions. Dates and coverage gaps stay explicit. Human review required." }),
]);

function bubble(who, children) {
  const b = el("div", { className: `chat-msg ${who}` }, children);
  log.append(b);
  // Long answers are read from the top, so scroll to where the reply starts.
  log.scrollTop = who === "bot" && b.offsetHeight > log.clientHeight * 0.7 ? b.offsetTop - 12 : log.scrollHeight;
  return b;
}

function cardNode(c) {
  return el("article", { className: "chat-card" }, [
    el("p", { className: "chat-card-meta", textContent: c.meta }),
    el("a", { className: "chat-card-title", href: c.link, target: "_blank", rel: "noopener", textContent: c.title }),
    ...c.lines.map((l) => el("p", { className: "chat-line", textContent: l.text })),
    el("p", { className: "chat-card-src", textContent: c.source }),
  ]);
}

function showChips(list) {
  chips.replaceChildren(
    ...list.map((label) => {
      const b = el("button", { type: "button", className: "chat-chip", textContent: label });
      b.onclick = () => ask(label);
      return b;
    }),
  );
}

async function respond(q,turn=conversationEpoch) {
  if(await labelQuestionChat(q)){intelligenceChat.reset();return;}
  labelQuestionChat.reset();
  if(await intelligenceChat(q)){return;}
  if(await businessChat(q)){return;}

  if(turn!==conversationEpoch)return;
  const typing = bubble("bot typing", [el("span"), el("span"), el("span")]);
  typing.ariaLabel = "Typing";
  chips.replaceChildren();
  await loadIndex();
  // A short pause reads as a reply rather than a page refresh.
  await new Promise((r) => setTimeout(r, 350));
  typing.remove();
  if(turn!==conversationEpoch)return;
  if (!index.updates.length) {
    bubble("bot", [el("p", { textContent: "The update list hasn't loaded yet. Try again in a minute." })]);
    return;
  }
  const out = reply(q, index);
  showChips(out.chips);
  bubble("bot", [
    el("p", { textContent: out.text }),
    ...out.cards.map(cardNode),
    out.more ? el("a", { className: "chat-more", href: out.more.href, textContent: out.more.label }) : null,
  ]);
}

function ask(text) {
  const q = text.trim();
  if (!q) return;
  bubble("me", [el("p", { textContent: q })]);
  const turn=conversationEpoch;
  responseQueue=responseQueue.then(()=>turn===conversationEpoch?respond(q,turn):null).catch(()=>bubble('bot',[el('p',{textContent:'This evidence check could not complete. Please retry; no conclusion was inferred.'})]));
}

function open(state = true) {
  panel.hidden = !state;
  fab.setAttribute("aria-expanded", String(state));
  fab.classList.toggle("open", state);
  document.querySelector(".chat-teaser")?.remove();
  if (state) {
    loadIndex();
    if (!log.childNodes.length) {
      bubble("bot", [el("p", { textContent: "Hi 👋 Ask about a product’s approval, a safety term in its label, or PV updates. I’ll show the captured evidence and tell you what it cannot establish." })]);
      showChips(["What can you answer?", "🚨 Latest safety alerts", "🇺🇸 FDA this week", "🇪🇺 EMA PRAC updates", "🇮🇳 What's new in India?", "📊 Summary"]);
    }
    if (matchMedia("(pointer: fine)").matches) input.focus();
  } else fab.focus();
}

fab.onclick = () => open(panel.hidden);
close.onclick = () => open(false);
panel.addEventListener("keydown", (e) => {
  if (e.key === "Escape") open(false);
});
form.onsubmit = (e) => {
  e.preventDefault();
  ask(input.value);
  input.value = "";
};

intelligenceLayer=createProductIntelligence({json});
intelligenceChat=createIntelligenceChat({el,bubble,json,layer:intelligenceLayer});
labelQuestionChat=createLabelQuestionChat({el,bubble,json,readRepository:intelligenceLayer.load,layer:intelligenceLayer});
businessChat=createBusinessChat({el,bubble,json});
document.body.append(panel, fab);

// One gentle hint, the first time only.
try {
  if (!localStorage.getItem(TEASED)) {
    localStorage.setItem(TEASED, "1");
    setTimeout(() => {
      if (!panel.hidden) return;
      const tip = el("button", { type: "button", className: "chat-teaser", textContent: "Ask me about PV updates 👋" });
      tip.onclick = () => open(true);
      document.body.append(tip);
      setTimeout(() => tip.remove(), 7000);
    }, 4000);
  }
} catch {}
