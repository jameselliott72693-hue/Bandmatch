/** Edits on top of an imagined song: tempo, key, meter, sections, chords, and lyrics. */

import { arrangeFull } from "./arrange.js";
import { ROLE_IDS } from "./musicians.js";
import { hashString, mulberry32 } from "./song.js";

const ROLES = [
  ["intro", "Intro"],
  ["verse", "Verse"],
  ["pre", "Pre-chorus"],
  ["chorus", "Chorus"],
  ["bridge", "Bridge"],
  ["final", "Final chorus"],
  ["outro", "Outro"],
];

const ROLE_CODE = { intro: "i", verse: "v", pre: "p", chorus: "c", bridge: "b", final: "f", outro: "o" };
const CODE_ROLE = Object.fromEntries(Object.entries(ROLE_CODE).map(([role, code]) => [code, role]));

const NAMES = {
  c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6,
  g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11,
};

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const QUALITIES = [
  ["maj7", "maj7"],
  ["min7", "min7"],
  ["m7", "min7"],
  ["7", "dom7"],
  ["m", "min"],
  ["5", "power"],
];

export const KEY_OPTIONS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const SECTION_ROLES = ROLES;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function spellName(pc, spell) {
  const names = spell === "flat" ? FLAT : SHARP;
  return names[((pc % 12) + 12) % 12];
}

export function chordSymbol(chord, spell) {
  const suffix = { maj: "", min: "m", dom7: "7", maj7: "maj7", min7: "m7", power: "5" };
  return `${spellName(chord.pc, spell)}${suffix[chord.quality] || ""}`;
}

export function parseChord(text) {
  const raw = String(text || "").trim().replace("♯", "#").replace("♭", "b");
  const match = raw.match(/^([A-Ga-g])([#b])?(.*)$/);
  if (!match) return null;
  const pc = NAMES[`${match[1].toLowerCase()}${match[2] || ""}`];
  if (pc == null) return null;
  const tail = match[3].trim().toLowerCase();
  if (!tail) return { pc, quality: "maj" };
  const found = QUALITIES.find(([suffix]) => tail === suffix);
  if (!found) return null;
  return { pc, quality: found[1] };
}

export function parseProgression(text) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const chords = parts.map(parseChord);
  if (chords.some((chord) => !chord)) return null;
  return chords;
}

export function formatProgression(chords, spell) {
  return (chords || []).map((chord) => chordSymbol(chord, spell)).join(" ");
}

function copyChords(chords) {
  return (chords || []).map((chord) => ({ pc: chord.pc, quality: chord.quality }));
}

export function draftFromSong(song) {
  return {
    tempo: song.tempo,
    keyPc: song.keyPc,
    mode: song.mode,
    spell: song.spell,
    timeSignature: song.timeSignature,
    sections: song.structure.map((section) => ({
      role: section.role,
      name: section.name,
      bars: section.bars,
      chords: copyChords(section.chords),
      lines: (section.lines || []).slice(),
    })),
  };
}

export function sameDraft(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clock(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function transposeDraft(draft, keyPc, spell) {
  const next = keyPc % 12;
  const delta = (next - draft.keyPc + 12) % 12;
  draft.keyPc = next;
  draft.spell = spell;
  if (!delta) return;
  draft.sections.forEach((section) => {
    section.chords.forEach((chord) => {
      chord.pc = (chord.pc + delta) % 12;
    });
  });
}

export function setMode(draft, mode) {
  if (draft.mode === mode) return;
  const toMinor = mode === "minor";
  const map = toMinor
    ? { maj: "min", min: "min", maj7: "min7", min7: "min7", dom7: "dom7", power: "power" }
    : { min: "maj", maj: "maj", min7: "maj7", maj7: "maj7", dom7: "dom7", power: "power" };
  draft.mode = mode === "minor" ? "minor" : "major";
  draft.sections.forEach((section) => {
    section.chords.forEach((chord) => {
      chord.quality = map[chord.quality] || chord.quality;
    });
  });
}

export function blankSection(role, chords) {
  const known = ROLES.find((entry) => entry[0] === role) || ROLES[1];
  return {
    role: known[0],
    name: known[1],
    bars: known[0] === "intro" || known[0] === "outro" || known[0] === "pre" ? 4 : 8,
    chords: copyChords(chords).slice(0, 4),
    lines: known[0] === "intro" || known[0] === "outro" ? [] : ["", "", "", ""],
  };
}

export function performSong(song, draft) {
  const tempo = clamp(Math.round(Number(draft.tempo) || song.tempo), 40, 220);
  const timeSignature = ["4/4", "3/4", "6/8", "7/8"].includes(draft.timeSignature) ? draft.timeSignature : "4/4";
  const sixteenthsPerBar = { "4/4": 16, "3/4": 12, "6/8": 12, "7/8": 14 }[timeSignature];
  const swing = timeSignature === "4/4" || timeSignature === "3/4" ? song.swing : 0;
  const sections = draft.sections.map((section) => ({
    role: CODE_ROLE[ROLE_CODE[section.role]] || "verse",
    name: String(section.name || "Section").slice(0, 40),
    bars: clamp(Math.round(Number(section.bars) || 4), 1, 48),
    chords: copyChords(section.chords).slice(0, 16),
    lines: (section.lines || []).slice(0, 8).map((line) => String(line).slice(0, 160)),
  }));
  if (!sections.length) return song;
  sections.forEach((section) => {
    if (!section.chords.length) section.chords = [{ pc: draft.keyPc % 12, quality: draft.mode === "minor" ? "min" : "maj" }];
  });
  const byRole = {};
  ROLE_IDS.forEach((role) => {
    if (song.slots?.[role]) byRole[role] = song.slots[role];
  });
  const stamp = sections.map((section) => `${section.role}${section.bars}:${section.chords.map((chord) => `${chord.pc}${chord.quality}`).join(".")}`).join("/");
  const rng = mulberry32(hashString(`${song.seed}::${song.signature}::edit::${tempo}:${draft.keyPc}:${draft.mode}:${timeSignature}:${stamp}`));
  const arrangement = arrangeFull({
    rng,
    bank: song.bank,
    byRole,
    progression: sections[0].chords,
    bridge: sections.find((section) => section.role === "bridge")?.chords || sections[0].chords,
    sections,
    sixteenthsPerBar,
    timeSignature,
    tempo,
    swing,
    density: song.density,
    weight: song.weight,
    brightness: song.brightness,
    drive: song.drive,
    mode: draft.mode === "minor" ? "minor" : "major",
    tonic: ((draft.keyPc % 12) + 12) % 12,
    style: song.style,
  });
  const structure = arrangement.sections.map((section, index) => ({
    ...section,
    index,
    name: sections[index].name,
    chords: copyChords(sections[index].chords),
    lines: sections[index].lines.slice(),
  }));
  const spell = draft.spell === "flat" ? "flat" : "sharp";
  const mode = draft.mode === "minor" ? "minor" : "major";
  return {
    ...song,
    tempo,
    keyPc: ((draft.keyPc % 12) + 12) % 12,
    mode,
    spell,
    key: `${spellName(draft.keyPc, spell)} ${mode}`,
    timeSignature,
    structure,
    bars: structure.reduce((sum, section) => sum + section.bars, 0),
    duration: arrangement.duration,
    durationLabel: clock(arrangement.duration),
    pocket: String(song.pocket || "").replace(/at \d+ BPM/, `at ${tempo} BPM`),
    arrangement,
  };
}

const ROLE_NAME = Object.fromEntries(ROLES);

export function compactEdit(song, origin) {
  if (!origin) return null;
  const current = draftFromSong(song);
  const base = draftFromSong(origin);
  if (sameDraft(current, base)) return null;
  const payload = {};
  if (current.tempo !== base.tempo) payload.t = current.tempo;
  if (current.keyPc !== base.keyPc || current.spell !== base.spell) payload.k = `${current.keyPc}${current.spell === "flat" ? "b" : "#"}`;
  if (current.mode !== base.mode) payload.m = current.mode === "minor" ? "n" : "M";
  if (current.timeSignature !== base.timeSignature) payload.s = current.timeSignature;
  payload.S = current.sections.map((section) => ({
    r: ROLE_CODE[section.role] || "v",
    n: section.name === (ROLE_NAME[section.role] || section.name) ? undefined : section.name,
    b: section.bars,
    c: section.chords.map((chord) => `${chord.pc}.${chord.quality}`).join(","),
    l: section.lines.some((line) => line) ? section.lines : undefined,
  }));
  return payload;
}

export function expandEdit(origin, compact) {
  const draft = draftFromSong(origin);
  if (!compact || typeof compact !== "object") return draft;
  if (compact.t != null) draft.tempo = compact.t;
  if (typeof compact.k === "string") {
    const keyPc = Number(compact.k.replace(/[^\d-]/g, ""));
    if (!Number.isNaN(keyPc)) draft.keyPc = ((keyPc % 12) + 12) % 12;
    draft.spell = compact.k.includes("b") ? "flat" : "sharp";
  }
  if (compact.m === "n") draft.mode = "minor";
  if (compact.m === "M") draft.mode = "major";
  if (compact.s) draft.timeSignature = compact.s;
  if (Array.isArray(compact.S) && compact.S.length) {
    draft.sections = compact.S.slice(0, 24).map((section) => {
      const role = CODE_ROLE[section.r] || "verse";
      const chords = String(section.c || "").split(",").filter(Boolean).map((part) => {
        const [pc, quality] = part.split(".");
        return { pc: Number(pc) % 12, quality: quality || "maj" };
      }).filter((chord) => !Number.isNaN(chord.pc));
      return {
        role,
        name: section.n || ROLE_NAME[role] || "Section",
        bars: section.b,
        chords: chords.length ? chords : [{ pc: draft.keyPc, quality: draft.mode === "minor" ? "min" : "maj" }],
        lines: Array.isArray(section.l) ? section.l.map((line) => String(line)) : [],
      };
    });
  }
  return draft;
}

export function editStorageKey(hash) {
  return `bandmatch.v1.edit.${hash}`;
}
