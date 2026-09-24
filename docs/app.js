import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm";
import { AGENT_ID } from "./config.js";
import { createCrm } from "./crm.js";

const $ = (id) => document.getElementById(id);
const els = {
  callBtn: $("callBtn"), callLabel: $("callLabel"), chatBtn: $("chatBtn"), status: $("status"),
  transcript: $("transcript"), composer: $("composer"), msg: $("msg"),
  owners: $("owners"), actions: $("actions"), records: $("records"),
};

const OWNERS = [
  { name: "Omar Haddad", unit: "CRK-A-1204", last4: "4417", try: "Ready for handover: book an appointment. Try it in Arabic." },
  { name: "Sarah Mitchell", unit: "CRK-B-0807", last4: "2290", try: "Asks to book handover, but two items are still outstanding." },
  { name: "Fatima Al Mansoori", unit: "OAS-TH-031", last4: "7731", try: "AC not cooling, still under the defects period. Or ask what she owes." },
  { name: "Rahul Menon", unit: "OAS-V-112", last4: "5582", try: "Overdue service charges: ask for a payment plan." },
];
els.owners.innerHTML = OWNERS.map((o) => `
  <li class="owner">
    <div class="owner-top"><span class="owner-name">${o.name}</span><span class="owner-creds">${o.unit} · ${o.last4}</span></div>
    <div class="owner-try">${o.try}</div>
  </li>`).join("");

let language = "en";
let conversation = null;
let textMode = false;
let lastUserText = "";

document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  if (conversation) return;
  language = b.dataset.lang;
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
}));

// ---- rendering -------------------------------------------------------------
function clearEmpty(list) { list.querySelector(".empty")?.remove(); }

function addBubble(role, text) {
  clearEmpty(els.transcript);
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.dir = "auto";
  div.textContent = text;
  els.transcript.append(div);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function summarise(obj) {
  const s = JSON.stringify(obj);
  return s.length > 220 ? s.slice(0, 217) + "…" : s;
}

function logAction(name, params, result) {
  clearEmpty(els.actions);
  const li = document.createElement("li");
  li.className = "action" + (result && (result.error || result.verified === false) ? " error" : "");
  li.innerHTML = `<div class="action-name"></div><div class="action-io"></div><div class="action-io"></div>`;
  li.children[0].textContent = name;
  li.children[1].textContent = "→ " + summarise(params);
  li.children[2].textContent = "← " + summarise(result);
  els.actions.prepend(li);
}

function addRecord({ kind, ref, detail }) {
  clearEmpty(els.records);
  const li = document.createElement("li");
  li.className = "record";
  li.innerHTML = "<b></b><span></span>";
  li.children[0].textContent = `${kind} · ${ref}`;
  li.children[1].textContent = detail;
  els.records.prepend(li);
}

function setStatus(text) { els.status.textContent = text; }

function setLive(live) {
  els.callBtn.classList.toggle("live", live && !textMode);
  els.callLabel.textContent = live ? (textMode ? "End chat" : "End call") : "Start call";
  els.callBtn.setAttribute("aria-label", live ? "End conversation" : "Start voice call");
  els.chatBtn.disabled = live;
  document.querySelectorAll(".seg button").forEach((b) => (b.disabled = live));
  els.composer.hidden = !(live && textMode);
  if (!live) els.callBtn.classList.remove("speaking");
}

// ---- session ---------------------------------------------------------------
async function start(asText) {
  textMode = asText;
  const crm = createCrm(addRecord);
  const clientTools = Object.fromEntries(Object.entries(crm.handlers).map(([name, fn]) => [name, async (params) => {
    const result = fn(params || {});
    logAction(name, params, result);
    return result;
  }]));

  setStatus("Connecting…");
  els.transcript.innerHTML = "";
  try {
    if (!asText) await navigator.mediaDevices.getUserMedia({ audio: true });
    conversation = await Conversation.startSession({
      agentId: AGENT_ID,
      // WebSocket for voice too: the agent only accepts sessions that carry this site's Origin header,
      // and the WebRTC transport doesn't send one, so it would be refused at start-up.
      connectionType: "websocket",
      textOnly: asText,
      overrides: { agent: { language } },
      dynamicVariables: { channel: asText ? "web_chat" : "web_voice" },
      clientTools,
      onConnect: () => { setLive(true); setStatus(asText ? "Chat connected" : "Listening"); if (asText) els.msg.focus(); },
      onDisconnect: (details) => {
        conversation = null;
        setLive(false);
        if (details && details.reason === "error") {
          console.error("Disconnected:", details);
          setStatus("The connection dropped. The demo may have reached today's limit; please try again later.");
        } else {
          setStatus("Conversation ended");
        }
        addBubble("system", "Conversation ended.");
      },
      onStatusChange: ({ status }) => { if (status === "connecting") setStatus("Connecting…"); },
      onModeChange: ({ mode }) => {
        if (textMode) return;
        els.callBtn.classList.toggle("speaking", mode === "speaking");
        setStatus(mode === "speaking" ? "Noor is speaking" : "Listening");
      },
      onMessage: ({ message, role }) => {
        if (!message) return;
        if (role === "user" && textMode && message.trim() === lastUserText.trim()) return;
        addBubble(role === "user" ? "user" : "agent", message);
      },
      onError: (message) => { console.error(message); setStatus("Something went wrong. Please try again."); },
    });
  } catch (err) {
    console.error(err);
    conversation = null;
    setLive(false);
    setStatus(err && err.name === "NotAllowedError" ? "Microphone access is needed for a voice call. You can use text chat instead." : "Couldn't connect. The demo may have reached today's limit; please try later.");
  }
}

async function stop() {
  const c = conversation;
  conversation = null;
  if (c) await c.endSession();
}

els.callBtn.addEventListener("click", () => (conversation ? stop() : start(false)));
els.chatBtn.addEventListener("click", () => { if (!conversation) start(true); });
els.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.msg.value.trim();
  if (!text || !conversation) return;
  lastUserText = text;
  addBubble("user", text);
  conversation.sendUserMessage(text);
  els.msg.value = "";
});
