import { randomUUID } from "node:crypto";

export const DEFAULT_TITLE = "New chat";
const LEGACY_TITLE = "Nový chat"; // chats created before the UI was switched to English
const isDefaultTitle = (t) => t === DEFAULT_TITLE || t === LEGACY_TITLE;
const now = () => Date.now();

/** Title from the first thing the user said (without the @/📍 context lines the app appends). */
export function titleFrom(entries = []) {
  const first = entries.find((e) => e.kind === "user" && e.text?.trim());
  if (!first) return DEFAULT_TITLE;
  const t = first.text.split("\n")[0].replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 59) + "…" : t || DEFAULT_TITLE;
}

const blank = () => ({ id: randomUUID(), title: DEFAULT_TITLE, createdAt: now(), updatedAt: now(), sessionId: null, entries: [] });

/**
 * A project keeps several conversations: state.chats = [{id,title,createdAt,updatedAt,sessionId,entries}] and
 * state.currentChatId. Older states stored one conversation as state.chat + state.sessionId; it becomes the first one.
 * Mutates and returns `state`.
 */
export function normalize(state) {
  if (!Array.isArray(state.chats)) {
    const legacy = Array.isArray(state.chat) && state.chat.length;
    state.chats = [];
    if (legacy || state.sessionId) state.chats.push({ ...blank(), title: titleFrom(state.chat), sessionId: state.sessionId ?? null, entries: state.chat ?? [] });
  }
  delete state.chat; delete state.sessionId;
  if (!state.chats.length) state.chats.push(blank());
  if (!state.chats.some((c) => c.id === state.currentChatId)) state.currentChatId = [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
  return state;
}

export const current = (state) => normalize(state).chats.find((c) => c.id === state.currentChatId);
const find = (state, id) => normalize(state).chats.find((c) => c.id === id);

/** Starts a fresh conversation. An empty current one is reused instead of piling up blank ones. */
export function newChat(state) {
  const cur = current(state);
  if (!cur.entries.length) return { state, chat: cur, created: false };
  const chat = blank(); state.chats.push(chat); state.currentChatId = chat.id;
  return { state, chat, created: true };
}

export function saveEntries(state, chatId, entries) {
  const c = find(state, chatId); if (!c) return state;
  c.entries = entries; c.updatedAt = now();
  if (isDefaultTitle(c.title)) c.title = titleFrom(entries);
  return state;
}

export function setSession(state, chatId, sessionId) {
  const c = find(state, chatId); if (c) c.sessionId = sessionId;
  return state;
}

export function switchChat(state, chatId) {
  if (find(state, chatId)) state.currentChatId = chatId;
  return state;
}

/** Removes a conversation; when it was the open one the most recent remaining one (or a blank one) takes over. */
export function deleteChat(state, chatId) {
  normalize(state);
  state.chats = state.chats.filter((c) => c.id !== chatId);
  return normalize(state);
}

export const list = (state) => normalize(state).chats
  .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messages: c.entries.filter((e) => e.kind === "user").length, current: c.id === state.currentChatId }))
  .sort((a, b) => b.updatedAt - a.updatedAt);
