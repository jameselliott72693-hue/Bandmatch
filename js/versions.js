/** Named edits of one imagined song. The list stays on this device; a share link carries one version. */

import { formatProgression, spellName } from "./edit.js";

export const VERSIONS_KEY = "bandmatch.v1.versions";
export const VERSION_LIMIT = 12;
export const VERSION_SONG_LIMIT = 40;

export function cleanVersionName(name) {
  return String(name || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function versionKey(signature, seed) {
  return `${signature}::${seed}`;
}

export function listVersions(store, key) {
  const list = store?.[key];
  return Array.isArray(list) ? list.filter((item) => item && item.name && item.edit) : [];
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "version";
}

export function saveVersion(store, key, name, edit) {
  const label = cleanVersionName(name);
  if (!label) return { store: store || {}, error: "Name this version." };
  if (!edit) return { store: store || {}, error: "Edit the song before saving a version. The original imagined song is already kept." };
  const next = { ...(store || {}) };
  const list = listVersions(next, key).filter((item) => item.name.toLowerCase() !== label.toLowerCase());
  list.unshift({ id: slug(label), name: label, edit });
  next[key] = list.slice(0, VERSION_LIMIT);
  const keys = Object.keys(next);
  if (keys.length > VERSION_SONG_LIMIT) delete next[keys[0]];
  return { store: next, version: next[key][0] };
}

export function forgetVersion(store, key, id) {
  const next = { ...(store || {}) };
  next[key] = listVersions(next, key).filter((item) => item.id !== id);
  if (!next[key].length) delete next[key];
  return next;
}

function clip(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "—";
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}

function keyLabel(draft) {
  return `${spellName(draft.keyPc, draft.spell)} ${draft.mode}`;
}

export function compareDrafts(left, right) {
  const rows = [];
  const add = (label, a, b) => rows.push({ label, left: String(a), right: String(b), same: String(a) === String(b) });
  add("Tempo", `${left.tempo} BPM`, `${right.tempo} BPM`);
  add("Key", keyLabel(left), keyLabel(right));
  add("Meter", left.timeSignature, right.timeSignature);
  add("Sections", left.sections.map((section) => section.name).join(" · "), right.sections.map((section) => section.name).join(" · "));
  const count = Math.max(left.sections.length, right.sections.length);
  for (let index = 0; index < count; index += 1) {
    const a = left.sections[index];
    const b = right.sections[index];
    const name = a?.name || b?.name || `Section ${index + 1}`;
    const chordsA = a ? formatProgression(a.chords, left.spell) : "—";
    const chordsB = b ? formatProgression(b.chords, right.spell) : "—";
    if (chordsA !== chordsB) add(`${name} chords`, chordsA, chordsB);
    const linesA = clip((a?.lines || []).filter(Boolean).join(" / "));
    const linesB = clip((b?.lines || []).filter(Boolean).join(" / "));
    if (linesA !== linesB) add(`${name} lyrics`, linesA, linesB);
  }
  return rows;
}
