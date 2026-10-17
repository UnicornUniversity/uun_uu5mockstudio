import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, current, newChat, saveEntries, setSession, switchChat, deleteChat, list, titleFrom, DEFAULT_TITLE } from "../src/main/chats.mjs";
import { updateState, readState } from "../src/main/projects.mjs";
import { tmp } from "./helpers.mjs";

const u = (text) => ({ kind: "user", text });
const ai = (text) => ({ kind: "ai", text });

test("an empty state gets one blank conversation", () => {
  const s = normalize({});
  assert.equal(s.chats.length, 1); assert.equal(s.currentChatId, s.chats[0].id); assert.equal(s.chats[0].title, DEFAULT_TITLE);
});

test("the legacy single chat and session id become the first conversation", () => {
  const s = normalize({ chat: [u("Navrhni formulář"), ai("Hotovo")], sessionId: "sess-1", layout: { frames: {} } });
  assert.equal(s.chats.length, 1);
  assert.equal(s.chats[0].title, "Navrhni formulář"); assert.equal(s.chats[0].sessionId, "sess-1"); assert.equal(s.chats[0].entries.length, 2);
  assert.equal(s.chat, undefined); assert.equal(s.sessionId, undefined); assert.deepEqual(s.layout, { frames: {} }, "other state is kept");
  assert.equal(normalize(structuredClone(s)).chats.length, 1, "idempotent");
});

test("title comes from the first user line, shortened", () => {
  assert.equal(titleFrom([]), DEFAULT_TITLE);
  assert.equal(titleFrom([ai("x"), u("  Ahoj\n📍 <button>  ")]), "Ahoj");
  assert.equal(titleFrom([u("a".repeat(100))]).length, 60);
});

test("newChat archives the current one; an empty current one is reused", () => {
  const s = normalize({});
  const first = current(s).id;
  assert.equal(newChat(s).created, false, "blank chat is reused");
  saveEntries(s, first, [u("Prvni")]);
  const r = newChat(s);
  assert.equal(r.created, true); assert.notEqual(s.currentChatId, first); assert.equal(s.chats.length, 2);
  assert.equal(s.chats.find((c) => c.id === first).entries.length, 1, "old conversation is kept");
});

test("saveEntries sets the title once and bumps updatedAt; unknown ids are ignored", async () => {
  const s = normalize({}); const id = current(s).id; const t0 = current(s).updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  saveEntries(s, id, [u("Prvni zprava")]); saveEntries(s, id, [u("Prvni zprava"), ai("a"), u("Druha")]);
  assert.equal(current(s).title, "Prvni zprava"); assert.ok(current(s).updatedAt > t0);
  saveEntries(s, "nope", [u("x")]); assert.equal(s.chats.length, 1);
});

test("each conversation keeps its own Claude session id", () => {
  const s = normalize({}); const a = current(s).id;
  saveEntries(s, a, [u("A")]); setSession(s, a, "sess-A");
  const b = newChat(s).chat.id; setSession(s, b, "sess-B");
  assert.equal(s.chats.find((c) => c.id === a).sessionId, "sess-A");
  switchChat(s, a); assert.equal(current(s).sessionId, "sess-A");
  switchChat(s, "unknown"); assert.equal(s.currentChatId, a, "unknown id does not change the current chat");
});

test("deleting the open conversation falls back to the most recent other one, or a blank one", async () => {
  const s = normalize({}); const a = current(s).id; saveEntries(s, a, [u("A")]);
  await new Promise((r) => setTimeout(r, 5));
  const b = newChat(s).chat.id; saveEntries(s, b, [u("B")]);
  deleteChat(s, b); assert.equal(s.currentChatId, a); assert.equal(s.chats.length, 1);
  deleteChat(s, a); assert.equal(s.chats.length, 1); assert.equal(current(s).entries.length, 0, "a blank conversation replaces the last one");
});

test("list is newest first and counts user messages", async () => {
  const s = normalize({}); const a = current(s).id; saveEntries(s, a, [u("A"), ai("x"), u("A2")]);
  await new Promise((r) => setTimeout(r, 5));
  const b = newChat(s).chat.id; saveEntries(s, b, [u("B")]);
  const l = list(s);
  assert.deepEqual(l.map((c) => c.title), ["B", "A"]); assert.equal(l[1].messages, 2); assert.equal(l[0].current, true);
});

test("updateState serializes concurrent writers (no lost updates)", async () => {
  const dir = await tmp("state");
  await Promise.all(Array.from({ length: 25 }, (_, i) => updateState(dir, (s) => { s[`k${i}`] = i; })));
  const s = await readState(dir);
  assert.equal(Object.keys(s).length, 25);
});
