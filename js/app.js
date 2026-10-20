import {
  GENRE_IDS,
  GENRE_LABEL,
  MUSICIANS,
  ROLE_IDS,
  ROLE_LABEL,
  createCustomMusician,
  roleLabel,
} from "./musicians.js";
import { imaginedBio, planAlbum } from "./band.js";
import { BANDS_KEY, bandRecord, featuredBands, forgetBand, rememberBand } from "./gallery.js";
import { drawCover, drawMark } from "./cover.js";
import {
  KEY_OPTIONS,
  SECTION_ROLES,
  blankSection,
  chordSymbol,
  compactEdit,
  draftFromSong,
  editStorageKey,
  expandEdit,
  formatProgression,
  parseChord,
  parseProgression,
  performSong,
  setMode,
  transposeDraft,
} from "./edit.js";
import { VERSIONS_KEY, compareDrafts, forgetVersion, listVersions, saveVersion, versionKey } from "./versions.js";
import { CHANNEL_LABEL, channelOrder, partIsMuted, setPartMuted } from "./mixer.js";
import { songToMidi } from "./midi.js";
import { createPlayer, encodeWav } from "./player.js";
import { TRANSITION_MS, liveKicker, nextTrack } from "./set.js";
import { zipStore } from "./zip.js";
import { suggestLineup } from "./suggest.js";
import { blankSlots, decodeShare, encodeShare, generateSong, slotSignature, withSharedMix } from "./song.js";

const FAVORITES_KEY = "bandmatch.v1.favorites";
const player = createPlayer();

const state = {
  slots: blankSlots(),
  selected: "singer",
  roleFilter: "singer",
  query: "",
  swapFrom: null,
  song: null,
  favorites: loadFavorites(),
  mutes: { drums: false, bass: false, chords: false, lead: false, horns: false, dj: false, strings: false },
  originSong: null,
  history: [],
  future: [],
  editMarked: false,
  versionName: "",
  versionStore: loadVersionStore(),
  band: null,
  bandTrack: null,
  playAll: false,
  liveSet: false,
  between: false,
  crowd: false,
  transitionTimer: 0,
  gallery: false,
  bands: loadBands(),
};

const slotsEl = document.querySelector("#slots");
const poolEl = document.querySelector("#pool");
const searchEl = document.querySelector("#search");
const imagineEl = document.querySelector("#imagine");
const hintEl = document.querySelector("#lineup-hint");
const songSection = document.querySelector("#song-section");
const bandSection = document.querySelector("#band-section");
const favoritesEl = document.querySelector("#favorites");
const dialog = document.querySelector("#custom-dialog");
const toastEl = document.querySelector("#toast");
const mini = document.querySelector("#mini-player");

let toastTimer = 0;
let wasStale = false;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function norm(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function filledCount() {
  return ROLE_IDS.filter((role) => state.slots[role]).length;
}

function loadFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadBands() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BANDS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.encoded && item.bandName) : [];
  } catch {
    return [];
  }
}

function persistBands() {
  localStorage.setItem(BANDS_KEY, JSON.stringify(state.bands.slice(0, 24)));
}

function persistFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites.slice(0, 30)));
}

function loadVersionStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VERSIONS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function persistVersionStore() {
  localStorage.setItem(VERSIONS_KEY, JSON.stringify(state.versionStore));
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

function snapshot(slots) {
  const copy = blankSlots();
  ROLE_IDS.forEach((role) => {
    const person = slots[role];
    if (!person) return;
    copy[role] = person.custom
      ? createCustomMusician({
        name: person.name,
        role: person.roles[0],
        genres: person.genres,
        tempoMin: person.tempoMin,
        tempoMax: person.tempoMax,
        swing: person.swing,
        density: person.density,
        weight: person.weight,
        brightness: person.brightness,
        drive: person.drive,
      })
      : person;
  });
  return copy;
}

function isStale() {
  return Boolean(state.song && slotSignature(state.slots) !== state.song.signature);
}

function updateChrome() {
  const count = filledCount();
  const stale = isStale();
  imagineEl.disabled = count < 2;
  imagineEl.textContent = stale ? "Imagine again" : "Imagine a song";
  hintEl.textContent = count < 2
    ? `${count} of 8 chairs filled. Add at least 2. Keys, Horns, DJ, and Strings are optional.`
    : `${count} of 8 chairs filled. Keys, Horns, DJ, and Strings are optional.`;
  const banner = document.querySelector("#stale");
  if (banner) banner.hidden = !stale;
  const play = document.querySelector("#play");
  if (play) play.disabled = stale;
  if (stale && !wasStale) player.stop();
  wasStale = stale;
  const showMini = Boolean(state.song) && !stale && window.matchMedia("(max-width: 800px)").matches;
  mini.hidden = !showMini;
  document.body.classList.toggle("has-mini", showMini);
  if (state.song) {
    const miniTitle = document.querySelector("#mini-title");
    if (miniTitle) miniTitle.textContent = `${state.song.bandName} — ${state.song.title}`;
  }
}

function renderSlots() {
  const swap = state.swapFrom;
  slotsEl.innerHTML = ROLE_IDS.map((role) => {
    const person = state.slots[role];
    const selected = state.selected === role;
    const optional = role === "keys" || role === "horns" || role === "dj" || role === "strings";
    const emptyHint = optional ? "Optional" : "Open chair";
    const body = person
      ? `<strong>${esc(person.name)}</strong><span>${esc(person.genres.map((genre) => GENRE_LABEL[genre]).join(" · "))}</span>`
      : `<strong>${emptyHint}</strong><span>${optional ? (role === "dj" ? "Turntables. Leave empty if you want" : "Leave this empty if you want") : "Pick someone from the pool"}</span>`;
    const actions = person
      ? `<div class="slot-actions">
          <button type="button" data-swap="${role}" aria-label="Swap ${esc(person.name)}">${swap === role ? "Cancel" : "Swap"}</button>
          <button type="button" data-remove="${role}" aria-label="Remove ${esc(person.name)}">Remove</button>
        </div>`
      : "";
    return `<article class="slot${selected ? " is-selected" : ""}${person ? " is-filled" : ""}" data-slot="${role}">
      <button type="button" class="slot-select" data-select="${role}" aria-pressed="${selected}">
        <span class="slot-kicker"><span>${esc(ROLE_LABEL[role])}</span>${optional ? "<em>Optional</em>" : ""}</span>
        <span class="slot-body">${body}</span>
      </button>
      ${actions}
    </article>`;
  }).join("");
  const note = document.querySelector("#swap-note");
  if (note) {
    note.hidden = !swap;
    if (swap) note.textContent = `Choose another chair for ${state.slots[swap].name}, or cancel.`;
  }
}

function poolPeople() {
  const query = norm(state.query.trim());
  return MUSICIANS.filter((person) => {
    if (state.roleFilter !== "all" && !person.roles.includes(state.roleFilter)) return false;
    if (!query) return true;
    return norm(person.name).includes(query);
  });
}

function renderPool() {
  const people = poolPeople();
  const label = state.roleFilter === "all" ? "All roles" : ROLE_LABEL[state.roleFilter];
  document.querySelector("#pool-count").textContent = `${people.length} ${label.toLowerCase()}`;
  if (!people.length) {
    poolEl.innerHTML = `<p class="empty">No musicians match. Try another role, or add a custom player.</p>`;
    return;
  }
  poolEl.innerHTML = people.map((person) => {
    const placed = ROLE_IDS.find((role) => state.slots[role]?.id === person.id);
    const canPlay = person.roles.includes(state.selected);
    let status = "";
    let disabled = false;
    if (placed === state.selected) {
      status = "In this chair";
      disabled = true;
    } else if (!canPlay) {
      status = `Doesn't play ${roleLabel(state.selected).toLowerCase()}`;
      disabled = true;
    } else if (placed) {
      status = "Move here";
    }
    return `<button type="button" class="musician" data-id="${esc(person.id)}" ${disabled ? "disabled" : ""}>
      <span class="musician-top">
        <strong>${esc(person.name)}</strong>
        <span>${esc(person.roles.map((role) => ROLE_LABEL[role]).join(" · "))}</span>
      </span>
      <span class="musician-meta">${esc(person.genres.map((genre) => GENRE_LABEL[genre]).join(" · "))} · ${esc(person.feel.join(" · "))}</span>
      ${status ? `<span class="status">${esc(status)}</span>` : ""}
    </button>`;
  }).join("");
}

function renderFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const on = button.dataset.filter === state.roleFilter;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

function renderFavorites() {
  if (!state.favorites.length) {
    favoritesEl.innerHTML = `<p class="empty">Saved songs stay on this device.</p>`;
    return;
  }
  favoritesEl.innerHTML = state.favorites.map((favorite, index) => `
    <article class="favorite">
      <div>
        <strong>${esc(favorite.title)}</strong>
        <span>${esc(favorite.band)} · ${esc(favorite.detail)}</span>
      </div>
      <div class="favorite-actions">
        <button type="button" data-load="${index}">Load</button>
        <button type="button" data-delete="${index}" aria-label="Delete ${esc(favorite.title)}">Delete</button>
      </div>
    </article>
  `).join("");
}

function formatClock(seconds) {
  const rounded = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function renderSong() {
  const song = state.song;
  if (!song) {
    songSection.hidden = true;
    return;
  }
  songSection.hidden = false;
  const duration = song.duration || song.arrangement.duration;
  const lyrics = song.structure.filter((section) => section.lines?.length).map((section) => `
    <div class="lyric-block" data-section="${section.index}">
      <h3>${esc(section.name)}</h3>
      ${section.lines.map((line) => `<p>${esc(line)}</p>`).join("")}
    </div>`).join("");
  const markers = song.structure.map((section) => {
    const left = duration ? (section.startTime / duration) * 100 : 0;
    return `<button type="button" class="marker" style="left:${left}%" data-seek-section="${section.index}" data-section="${section.index}" aria-label="Jump to ${esc(section.name)}"></button>`;
  }).join("");
  const parts = [
    ["drums", "Drums"],
    ["bass", "Bass"],
    ["chords", "Chords"],
    ["lead", "Lead"],
  ];
  if (song.roster.some((entry) => entry.role === "horns")) parts.push(["horns", "Horns"]);
  if (song.roster.some((entry) => entry.role === "dj")) parts.push(["dj", "DJ"]);
  if (song.roster.some((entry) => entry.role === "strings")) parts.push(["strings", "Strings"]);
  songSection.innerHTML = `
    <div class="sheet" id="song-sheet">
      <div class="sheet-hero">
        <div>
          <p class="eyebrow">Imagined band</p>
          <p class="band-name">${esc(song.bandName)}</p>
          <h2 id="song-title" tabindex="-1">${esc(song.title)}</h2>
          <p class="genre">${esc(song.genreLabel)}</p>
          <p class="blend">${esc(song.blend || "")}</p>
          <p class="pocket">${esc(song.pocket)}</p>
        </div>
        <figure class="cover">
          <canvas id="cover" width="800" height="800" aria-label="Imagined album cover for ${esc(song.title)}"></canvas>
          <button type="button" class="btn" id="download-cover">Download cover</button>
        </figure>
      </div>
      <p id="stale" class="banner" ${isStale() ? "" : "hidden"}>The lineup changed. Imagine again to match this group. Playback stays off until you do.</p>
      <dl class="meta">
        <div><dt>Tempo</dt><dd id="meta-tempo">${song.tempo} BPM</dd></div>
        <div><dt>Key</dt><dd id="meta-key">${esc(song.key)}</dd></div>
        <div><dt>Meter</dt><dd id="meta-meter">${esc(song.timeSignature)}</dd></div>
        <div><dt>Length</dt><dd id="meta-length">${esc(song.durationLabel)}</dd></div>
        <div><dt>Seed</dt><dd><code>${esc(song.seed)}</code></dd></div>
      </dl>
      ${editorMarkup(song)}
      <div class="roster">
        ${song.roster.map((entry) => `<span><em>${esc(ROLE_LABEL[entry.role])}</em> ${esc(entry.name)}</span>`).join("")}
      </div>
      <h3>Structure <span id="structure-length">${esc(song.durationLabel)} · ${song.bars} bars</span></h3>
      <div class="sections">
        ${song.structure.map((section) => `<button type="button" data-seek-section="${section.index}" data-section="${section.index}"><strong>${esc(section.name)}</strong><span>${section.bars}</span></button>`).join("")}
      </div>
      <h3>Chord progression</h3>
      <div class="chords">
        ${song.progression.map((chord) => `<span>${esc(chord.symbol)}</span>`).join("")}
      </div>
      <h3>Bridge progression</h3>
      <div class="chords">
        ${song.bridge.map((chord) => `<span>${esc(chord.symbol)}</span>`).join("")}
      </div>
      <h3>Original lyrics</h3>
      <p class="fine">Each block lines up with a section. Built from an original phrase bank, not taken from real songs, and not sung.</p>
      <div class="lyrics">${lyrics}</div>
      <h3>Liner notes</h3>
      <p class="fine">Parts are imagined. The singer's chair is a melody only — the demo uses a synthesizer, not a voice, and the named artists are not involved.</p>
      <div class="notes">
        ${song.notes.map((note) => `<article><h4>${esc(ROLE_LABEL[note.role])} · ${esc(note.name)}</h4><p>${esc(note.text)}</p></article>`).join("")}
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn" id="reroll">Reroll</button>
        <button type="button" class="btn" id="save">Save on this device</button>
        <button type="button" class="btn" id="share">Copy share link</button>
        <button type="button" class="btn" id="download-midi">Download MIDI</button>
        <button type="button" class="btn" id="download-wav">Download WAV</button>
        <button type="button" class="btn" id="open-band">Band page</button>
      </div>
    </div>
    <div class="player" id="player">
      <div class="player-top">
        <div>
          <p class="eyebrow">Demo</p>
          <h3>Play the arrangement</h3>
          <p class="fine">The full song, synthesized in the browser. The lead stands in for the vocal. Horns, turntables, and strings play only when someone sits in that chair. No singing voice and no imitation of a real artist.</p>
        </div>
        <canvas id="meter" width="280" height="36" aria-hidden="true"></canvas>
      </div>
      <div class="timeline">
        <div class="timeline-times">
          <span id="time-now">0:00</span>
          <span id="time-end">${esc(song.durationLabel)}</span>
        </div>
        <div class="timeline-bar" id="timeline" role="slider" tabindex="0" aria-label="Song position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0:00">
          <span class="timeline-fill" id="timeline-fill"></span>
          ${markers}
        </div>
      </div>
      <div class="transport">
        <button type="button" class="btn btn-primary" id="play">Play</button>
        <button type="button" class="btn" id="stop">Stop</button>
        <label class="check loop-toggle"><input type="checkbox" id="loop-section"> Loop section</label>
        <span class="transport-meta">${song.tempo} BPM · ${esc(song.key)} · ${esc(song.timeSignature)}</span>
      </div>
      <div class="mutes" role="group" aria-label="Mute parts">
        ${parts.map(([part, label]) => {
          const on = !partIsMuted(song.mixer, part);
          return `<button type="button" class="mute${on ? " is-on" : ""}" data-mute="${part}" aria-pressed="${on}">${label}</button>`;
        }).join("")}
      </div>
      ${mixerMarkup(song)}
      <p class="fine">Click the bar or a section to jump. Loop section repeats whichever section the playhead is in. Lead is a synthesizer, not a vocal. Empty chairs still get a generic part shaped by the lineup.</p>
    </div>`;
  player.load(song.arrangement);
  player.setMixer(song.mixer);
  player.attachMeter(document.querySelector("#meter"));
  drawCover(document.querySelector("#cover"), song);
  document.querySelector("#play").disabled = isStale();
  document.querySelector("#reroll").addEventListener("click", () => imagine(makeSeed()));
  document.querySelector("#save").addEventListener("click", saveSong);
  document.querySelector("#share").addEventListener("click", shareSong);
  document.querySelector("#download-cover").addEventListener("click", downloadCover);
  document.querySelector("#download-midi").addEventListener("click", downloadMidi);
  document.querySelector("#download-wav").addEventListener("click", downloadWav);
  document.querySelector("#open-band").addEventListener("click", () => openBand(song.slots, song.seed, null));
  document.querySelector("#play").addEventListener("click", () => {
    player.play().catch(() => toast("This browser couldn't start audio."));
  });
  document.querySelector("#stop").addEventListener("click", () => {
    state.playAll = false;
    player.stop();
  });
  document.querySelector("#loop-section").addEventListener("change", (event) => {
    player.setLoopSection(event.target.checked);
  });
  document.querySelectorAll("[data-seek-section]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      player.seekSection(Number(button.dataset.seekSection));
    });
  });
  bindScrub(document.querySelector("#timeline"));
  document.querySelectorAll("[data-mute]").forEach((button) => {
    button.addEventListener("click", () => {
      const part = button.dataset.mute;
      const next = !partIsMuted(state.song.mixer, part);
      setPartMuted(state.song.mixer, part, next);
      state.mutes[part] = next;
      player.setMixer(state.song.mixer);
      refreshMixButtons();
      rememberMix();
    });
  });
  bindMixer();
  bindEditor();
}

function mixerMarkup(song) {
  const mixer = song.mixer;
  const strips = channelOrder(mixer).map((id) => {
    const channel = mixer.channels[id];
    const name = CHANNEL_LABEL[id] || id;
    return `<div class="strip" data-channel="${id}">
      <span class="strip-name">${esc(name)}</span>
      <label>Vol <input type="range" data-mix="volume" min="0" max="1" step="0.01" value="${channel.volume}" aria-label="${esc(name)} volume"></label>
      <label>Pan <input type="range" data-mix="pan" min="-1" max="1" step="0.01" value="${channel.pan}" aria-label="${esc(name)} pan"></label>
      <label>Tone <input type="range" data-mix="tone" min="0" max="1" step="0.01" value="${channel.tone}" aria-label="${esc(name)} tone"></label>
      <label>Verb <input type="range" data-mix="reverb" min="0" max="1" step="0.01" value="${channel.reverb}" aria-label="${esc(name)} reverb"></label>
      <div class="strip-flags">
        <button type="button" class="mute${channel.mute ? " is-on" : ""}" data-mix-mute="${id}" aria-pressed="${channel.mute}">Mute</button>
        <button type="button" class="mute${channel.solo ? " is-on" : ""}" data-mix-solo="${id}" aria-pressed="${channel.solo}">Solo</button>
      </div>
    </div>`;
  }).join("");
  return `<section class="mixer" aria-label="Mixer">
    <div class="mixer-head">
      <h3>Mixer</h3>
      <label class="master-fader">Master <input type="range" id="mix-master" min="0" max="1" step="0.01" value="${mixer.master}" aria-label="Master volume"></label>
    </div>
    <p class="fine">One channel for each filled chair. Empty core parts share Backing. Tone darkens or drives the channel. Reverb is a shared synthesized room, and a limiter sits on the master. Volume and pan are written into the MIDI; the WAV uses this mix.</p>
    <div class="strips">${strips}</div>
  </section>`;
}

function currentVersions() {
  if (!state.song) return [];
  return listVersions(state.versionStore, versionKey(state.song.signature, state.song.seed));
}

function versionsMarkup(song) {
  const versions = currentVersions();
  const options = [`<option value="">Original imagined song</option>`]
    .concat(versions.map((version) => `<option value="${esc(version.id)}">${esc(version.name)}</option>`))
    .join("");
  const items = versions.length
    ? versions.map((version) => `<li>
        <strong>${esc(version.name)}</strong>
        <button type="button" class="btn" data-version-open="${esc(version.id)}">Switch</button>
        <button type="button" class="btn" data-version-share="${esc(version.id)}">Share</button>
        <button type="button" class="text-btn" data-version-forget="${esc(version.id)}">Remove</button>
      </li>`).join("")
    : `<li class="fine">No named versions yet.</li>`;
  const opened = state.versionName ? `<p class="fine">This sheet is the shared version “${esc(state.versionName)}”.</p>` : "";
  return `<div class="versions">
    <h3>Versions</h3>
    <p class="fine">Save named copies of this edited sheet on this device. Share keeps that one edit in a link. The original imagined song stays available.</p>
    ${opened}
    <form class="version-form" id="version-form">
      <label>Name <input id="version-name" maxlength="40" placeholder="Slower chorus" aria-label="Version name" required></label>
      <button type="submit" class="btn">Save version</button>
    </form>
    <ul class="version-list">${items}</ul>
    <div class="version-compare">
      <label>Compare <select id="compare-a" aria-label="First version">${options}</select></label>
      <label>with <select id="compare-b" aria-label="Second version">${options}</select></label>
      <button type="button" class="btn" id="compare-versions">Compare</button>
    </div>
    <div id="compare-out"></div>
  </div>`;
}

function editorMarkup(song) {
  const spellOf = (name) => (name.includes("b") ? "flat" : "sharp");
  const keyChoices = KEY_OPTIONS.map((name) => {
    const chord = parseChord(name);
    return { name, pc: chord.pc, spell: spellOf(name) };
  });
  const exactKey = keyChoices.some((choice) => choice.pc === song.keyPc && choice.spell === song.spell);
  const keys = keyChoices.map((choice) => {
    const selected = exactKey
      ? choice.pc === song.keyPc && choice.spell === song.spell
      : choice.pc === song.keyPc && choice.spell === "sharp";
    return `<option value="${choice.pc}:${choice.spell}"${selected ? " selected" : ""}>${choice.name}</option>`;
  }).join("");
  const meters = ["4/4", "3/4", "6/8", "7/8"].map((meter) => (
    `<option value="${meter}"${meter === song.timeSignature ? " selected" : ""}>${meter}</option>`
  )).join("");
  const cards = song.structure.map((section, index) => {
    const roles = SECTION_ROLES.map(([role, label]) => (
      `<option value="${role}"${role === section.role ? " selected" : ""}>${label}</option>`
    )).join("");
    return `<article class="edit-card">
      <div class="edit-card-top">
        <label>Name <input data-edit="name" data-index="${index}" value="${esc(section.name)}" maxlength="40" aria-label="Section ${index + 1} name"></label>
        <label>Role <select data-edit="role" data-index="${index}" aria-label="Section ${index + 1} role">${roles}</select></label>
        <label>Bars <input data-edit="bars" data-index="${index}" type="number" min="1" max="48" value="${section.bars}" aria-label="Section ${index + 1} bars"></label>
      </div>
      <div class="edit-card-moves">
        <button type="button" data-move="up" data-index="${index}" ${index === 0 ? "disabled" : ""}>Up</button>
        <button type="button" data-move="down" data-index="${index}" ${index === song.structure.length - 1 ? "disabled" : ""}>Down</button>
        <button type="button" data-move="duplicate" data-index="${index}">Duplicate</button>
        <button type="button" data-move="remove" data-index="${index}" ${song.structure.length < 2 ? "disabled" : ""}>Remove</button>
      </div>
      <label>Chords <input class="chord-field" data-edit="chords" data-index="${index}" value="${esc(formatProgression(section.chords, song.spell))}" aria-label="Section ${index + 1} chords" spellcheck="false"></label>
      <label>Lyrics <textarea data-edit="lyrics" data-index="${index}" rows="${Math.max(2, (section.lines || []).length || 2)}" aria-label="Section ${index + 1} lyrics">${esc((section.lines || []).join("\n"))}</textarea></label>
    </article>`;
  }).join("");
  const addRoles = SECTION_ROLES.map(([role, label]) => `<option value="${role}">${label}</option>`).join("");
  return `<section class="editor" aria-label="Edit this song">
    <div class="edit-head">
      <h3>Edit this song</h3>
      <div class="edit-history">
        <button type="button" class="btn" id="undo" ${state.history.length ? "" : "disabled"}>Undo</button>
        <button type="button" class="btn" id="redo" ${state.future.length ? "" : "disabled"}>Redo</button>
        <button type="button" class="btn" id="reset-song">Reset to the original imagined song</button>
      </div>
    </div>
    <p class="fine">Changes play right away. Chords are written as symbols, like Am7 D G. Reset puts back the song Bandmatch first imagined for this lineup and seed.</p>
    ${versionsMarkup(song)}
    <div class="edit-bar">
      <label>Tempo <input id="edit-tempo" type="number" min="40" max="220" value="${song.tempo}" aria-label="Tempo"></label>
      <label>Key <select id="edit-key" aria-label="Key">${keys}</select></label>
      <label>Mode <select id="edit-mode" aria-label="Mode"><option value="major"${song.mode === "major" ? " selected" : ""}>Major</option><option value="minor"${song.mode === "minor" ? " selected" : ""}>Minor</option></select></label>
      <label>Meter <select id="edit-meter" aria-label="Time signature">${meters}</select></label>
    </div>
    <div class="edit-add">
      <label>Add a section <select id="add-role" aria-label="Section to add">${addRoles}</select></label>
      <button type="button" class="btn" id="add-section">Add</button>
    </div>
    ${cards}
  </section>`;
}

function cloneSong(song) {
  return JSON.parse(JSON.stringify(song));
}

function refreshHistoryButtons() {
  const undo = document.querySelector("#undo");
  const redo = document.querySelector("#redo");
  if (undo) undo.disabled = state.history.length === 0;
  if (redo) redo.disabled = state.future.length === 0;
}

function noteEdit() {
  if (state.editMarked || !state.song) return;
  state.versionName = "";
  state.history.push(cloneSong(state.song));
  if (state.history.length > 30) state.history.shift();
  state.future = [];
  state.editMarked = true;
  refreshHistoryButtons();
}

function shareExtra(song) {
  return {
    mixer: song.mixer,
    edit: state.originSong ? compactEdit(song, state.originSong) : null,
    versionName: state.versionName || "",
  };
}

function patchReadout() {
  const song = state.song;
  if (!song) return;
  const tempo = document.querySelector("#meta-tempo");
  if (tempo) tempo.textContent = `${song.tempo} BPM`;
  const key = document.querySelector("#meta-key");
  if (key) key.textContent = song.key;
  const meter = document.querySelector("#meta-meter");
  if (meter) meter.textContent = song.timeSignature;
  const length = document.querySelector("#meta-length");
  if (length) length.textContent = song.durationLabel;
  const structure = document.querySelector("#structure-length");
  if (structure) structure.textContent = `${song.durationLabel} · ${song.bars} bars`;
  const end = document.querySelector("#time-end");
  if (end) end.textContent = song.durationLabel;
  const transport = document.querySelector(".transport-meta");
  if (transport) transport.textContent = `${song.tempo} BPM · ${song.key} · ${song.timeSignature}`;
  const pocket = document.querySelector(".pocket");
  if (pocket) pocket.textContent = song.pocket;
  const duration = song.duration || 1;
  document.querySelectorAll(".marker").forEach((marker) => {
    const section = song.structure[Number(marker.dataset.seekSection)];
    if (section) marker.style.left = `${(section.startTime / duration) * 100}%`;
  });
}

function installSong(song) {
  const ratio = player.duration ? player.currentTime() / player.duration : 0;
  const was = player.playing;
  state.song = song;
  renderSong();
  const at = Math.max(0, Math.min(song.duration || 0, ratio * (song.duration || 0)));
  player.seekTo(at);
  if (was && !isStale()) player.play().catch(() => toast("This browser couldn't start audio."));
  state.editMarked = false;
  refreshHistoryButtons();
  rememberMix();
}

function applyDraft(draft, rerender) {
  const ratio = player.duration ? player.currentTime() / player.duration : 0;
  const was = player.playing;
  const song = performSong(state.song, draft);
  state.song = song;
  if (rerender) {
    renderSong();
    state.editMarked = false;
  } else {
    player.load(song.arrangement);
    player.setMixer(song.mixer);
    patchReadout();
  }
  const at = Math.max(0, Math.min(song.duration || 0, ratio * (song.duration || 0)));
  player.seekTo(at);
  if (was && !isStale()) player.play().catch(() => toast("This browser couldn't start audio."));
  refreshHistoryButtons();
  rememberMix();
}

function paintLyrics() {
  const root = document.querySelector(".lyrics");
  if (!root || !state.song) return;
  root.innerHTML = state.song.structure.filter((section) => (section.lines || []).some((line) => line.trim())).map((section) => `
    <div class="lyric-block" data-section="${section.index}">
      <h3>${esc(section.name)}</h3>
      ${(section.lines || []).filter((line) => line.trim()).map((line) => `<p>${esc(line)}</p>`).join("")}
    </div>`).join("");
}

function bindEditor() {
  const tempo = document.querySelector("#edit-tempo");
  if (!tempo) return;
  let tempoTimer = 0;
  tempo.addEventListener("input", () => {
    noteEdit();
    window.clearTimeout(tempoTimer);
    tempoTimer = window.setTimeout(() => {
      const draft = draftFromSong(state.song);
      draft.tempo = Number(tempo.value);
      applyDraft(draft, false);
    }, 140);
  });
  tempo.addEventListener("change", () => {
    state.editMarked = false;
  });
  document.querySelector("#edit-key").addEventListener("change", (event) => {
    const [pc, spell] = event.target.value.split(":");
    noteEdit();
    const draft = draftFromSong(state.song);
    transposeDraft(draft, Number(pc), spell);
    applyDraft(draft, true);
  });
  document.querySelector("#edit-mode").addEventListener("change", (event) => {
    noteEdit();
    const draft = draftFromSong(state.song);
    setMode(draft, event.target.value);
    applyDraft(draft, true);
  });
  document.querySelector("#edit-meter").addEventListener("change", (event) => {
    noteEdit();
    const draft = draftFromSong(state.song);
    draft.timeSignature = event.target.value;
    applyDraft(draft, true);
  });
  document.querySelector("#undo").addEventListener("click", () => {
    if (!state.history.length) return;
    state.future.push(cloneSong(state.song));
    installSong(state.history.pop());
  });
  document.querySelector("#redo").addEventListener("click", () => {
    if (!state.future.length) return;
    state.history.push(cloneSong(state.song));
    installSong(state.future.pop());
  });
  document.querySelector("#reset-song").addEventListener("click", () => {
    if (!state.originSong) return;
    noteEdit();
    installSong(cloneSong(state.originSong));
  });
  document.querySelector("#add-section").addEventListener("click", () => {
    const draft = draftFromSong(state.song);
    const role = document.querySelector("#add-role").value;
    noteEdit();
    draft.sections.push(blankSection(role, draft.sections.at(-1)?.chords || draft.sections[0].chords));
    applyDraft(draft, true);
  });
  document.querySelectorAll("[data-edit='name']").forEach((input) => {
    input.addEventListener("change", () => {
      noteEdit();
      const draft = draftFromSong(state.song);
      draft.sections[Number(input.dataset.index)].name = input.value;
      applyDraft(draft, true);
    });
  });
  document.querySelectorAll("[data-edit='role']").forEach((input) => {
    input.addEventListener("change", () => {
      noteEdit();
      const draft = draftFromSong(state.song);
      const section = draft.sections[Number(input.dataset.index)];
      const previous = SECTION_ROLES.find((entry) => entry[0] === section.role)?.[1];
      section.role = input.value;
      const next = SECTION_ROLES.find((entry) => entry[0] === input.value)?.[1];
      if (section.name === previous) section.name = next;
      applyDraft(draft, true);
    });
  });
  document.querySelectorAll("[data-edit='bars']").forEach((input) => {
    input.addEventListener("change", () => {
      noteEdit();
      const draft = draftFromSong(state.song);
      draft.sections[Number(input.dataset.index)].bars = Number(input.value);
      applyDraft(draft, true);
    });
  });
  document.querySelectorAll("[data-edit='chords']").forEach((input) => {
    input.addEventListener("change", () => {
      const chords = parseProgression(input.value);
      if (!chords) {
        input.classList.add("is-bad");
        toast("Use chord symbols separated by spaces, such as Am7 D G.");
        return;
      }
      input.classList.remove("is-bad");
      noteEdit();
      const draft = draftFromSong(state.song);
      draft.sections[Number(input.dataset.index)].chords = chords;
      applyDraft(draft, true);
    });
  });
  document.querySelectorAll("[data-edit='lyrics']").forEach((input) => {
    input.addEventListener("focus", () => noteEdit());
    input.addEventListener("input", () => {
      const index = Number(input.dataset.index);
      state.song.structure[index].lines = input.value.split("\n").slice(0, 8);
      paintLyrics();
    });
    input.addEventListener("blur", () => {
      state.editMarked = false;
      rememberMix();
    });
  });
  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const draft = draftFromSong(state.song);
      const [section] = draft.sections.splice(index, 1);
      if (button.dataset.move === "remove") {
        if (!draft.sections.length) return;
      } else if (button.dataset.move === "duplicate") {
        draft.sections.splice(index, 0, section, JSON.parse(JSON.stringify(section)));
      } else if (button.dataset.move === "up") {
        draft.sections.splice(Math.max(0, index - 1), 0, section);
      } else {
        draft.sections.splice(Math.min(draft.sections.length, index + 1), 0, section);
      }
      noteEdit();
      applyDraft(draft, true);
    });
  });
  bindVersions();
}

function draftForEdit(edit) {
  return expandEdit(state.originSong, edit || null);
}

function openVersion(edit, name) {
  if (!state.originSong) return;
  const song = performSong(state.originSong, draftForEdit(edit));
  song.mixer = state.song?.mixer || song.mixer;
  state.versionName = name || "";
  state.history = [];
  state.future = [];
  installSong(song);
  setHash(song);
  toast(name ? `Switched to ${name}.` : "Back to the original imagined song.");
}

async function copyText(link, message) {
  try {
    await navigator.clipboard.writeText(link);
    toast(message);
  } catch {
    const area = document.createElement("textarea");
    area.value = link;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    toast(message);
  }
}

function bindVersions() {
  const form = document.querySelector("#version-form");
  if (!form || !state.song) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.querySelector("#version-name").value;
    const edit = state.originSong ? compactEdit(state.song, state.originSong) : null;
    const key = versionKey(state.song.signature, state.song.seed);
    const result = saveVersion(state.versionStore, key, name, edit);
    if (result.error) {
      toast(result.error);
      return;
    }
    state.versionStore = result.store;
    state.versionName = result.version.name;
    try {
      persistVersionStore();
    } catch {
      toast("This browser couldn't store that version.");
      return;
    }
    setHash(state.song);
    renderSong();
    toast(`Saved version ${result.version.name}.`);
  });
  document.querySelectorAll("[data-version-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const version = currentVersions().find((item) => item.id === button.dataset.versionOpen);
      if (version) openVersion(version.edit, version.name);
    });
  });
  document.querySelectorAll("[data-version-share]").forEach((button) => {
    button.addEventListener("click", () => {
      const version = currentVersions().find((item) => item.id === button.dataset.versionShare);
      if (!version || !state.song) return;
      const encoded = encodeShare(state.song.slots, state.song.seed, {
        mixer: state.song.mixer,
        edit: version.edit,
        versionName: version.name,
      });
      const link = `${location.origin}${location.pathname}${location.search}#bm=${encoded}`;
      copyText(link, `Link copied for ${version.name}.`);
    });
  });
  document.querySelectorAll("[data-version-forget]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = versionKey(state.song.signature, state.song.seed);
      state.versionStore = forgetVersion(state.versionStore, key, button.dataset.versionForget);
      try {
        persistVersionStore();
      } catch {
        toast("This browser couldn't update versions.");
      }
      renderSong();
    });
  });
  document.querySelector("#compare-versions")?.addEventListener("click", () => {
    const versions = currentVersions();
    const pick = (id) => (id ? versions.find((item) => item.id === id)?.edit || null : null);
    const left = draftForEdit(pick(document.querySelector("#compare-a").value));
    const right = draftForEdit(pick(document.querySelector("#compare-b").value));
    const rows = compareDrafts(left, right);
    const out = document.querySelector("#compare-out");
    out.innerHTML = `<table class="compare-table">
      <thead><tr><th></th><th>${esc(document.querySelector("#compare-a").selectedOptions[0].textContent)}</th><th>${esc(document.querySelector("#compare-b").selectedOptions[0].textContent)}</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr class="${row.same ? "" : "is-different"}"><th>${esc(row.label)}</th><td>${esc(row.left)}</td><td>${esc(row.right)}</td></tr>`).join("")}
      </tbody>
    </table>`;
  });
}

function refreshMixButtons() {
  const mixer = state.song?.mixer;
  if (!mixer) return;
  document.querySelectorAll("[data-mute]").forEach((button) => {
    const on = !partIsMuted(mixer, button.dataset.mute);
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
    state.mutes[button.dataset.mute] = !on;
  });
  document.querySelectorAll("[data-mix-mute]").forEach((button) => {
    const muted = Boolean(mixer.channels[button.dataset.mixMute]?.mute);
    button.classList.toggle("is-on", muted);
    button.setAttribute("aria-pressed", String(muted));
  });
  document.querySelectorAll("[data-mix-solo]").forEach((button) => {
    const solo = Boolean(mixer.channels[button.dataset.mixSolo]?.solo);
    button.classList.toggle("is-on", solo);
    button.setAttribute("aria-pressed", String(solo));
  });
}

let shareTimer = 0;
function rememberMix() {
  window.clearTimeout(shareTimer);
  shareTimer = window.setTimeout(() => {
    if (state.song && !isStale()) setHash(state.song);
  }, 200);
}

function bindMixer() {
  const master = document.querySelector("#mix-master");
  if (!master || !state.song) return;
  master.addEventListener("input", () => {
    state.song.mixer.master = Number(master.value);
    player.setMixer(state.song.mixer);
    rememberMix();
  });
  document.querySelectorAll(".strip input[data-mix]").forEach((input) => {
    input.addEventListener("input", () => {
      const id = input.closest("[data-channel]")?.dataset.channel;
      const channel = state.song.mixer.channels[id];
      if (!channel) return;
      channel[input.dataset.mix] = Number(input.value);
      player.setMixer(state.song.mixer);
      rememberMix();
    });
  });
  document.querySelectorAll("[data-mix-mute]").forEach((button) => {
    button.addEventListener("click", () => {
      const channel = state.song.mixer.channels[button.dataset.mixMute];
      if (!channel) return;
      channel.mute = !channel.mute;
      player.setMixer(state.song.mixer);
      refreshMixButtons();
      rememberMix();
    });
  });
  document.querySelectorAll("[data-mix-solo]").forEach((button) => {
    button.addEventListener("click", () => {
      const channel = state.song.mixer.channels[button.dataset.mixSolo];
      if (!channel) return;
      channel.solo = !channel.solo;
      player.setMixer(state.song.mixer);
      refreshMixButtons();
      rememberMix();
    });
  });
}

function bindScrub(el) {
  if (!el) return;
  const scrub = (clientX) => {
    if (!state.song) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    player.seekRatio((clientX - rect.left) / rect.width);
  };
  el.addEventListener("click", (event) => {
    if (event.target.closest("[data-seek-section]")) return;
    scrub(event.clientX);
  });
  el.addEventListener("keydown", (event) => {
    const duration = state.song?.duration || 1;
    const current = player.currentTime() / duration;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      player.seekRatio(current + 5 / duration);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      player.seekRatio(current - 5 / duration);
    } else if (event.key === "Home") {
      event.preventDefault();
      player.seekRatio(0);
    } else if (event.key === "End") {
      event.preventDefault();
      player.seekRatio(1);
    }
  });
}

function renderSuggestions() {
  const root = document.querySelector("#suggestions");
  if (!root) return;
  const picks = suggestLineup(state.slots, MUSICIANS, 4);
  if (!picks.length) {
    root.innerHTML = `<section class="suggestions" aria-label="Lineup suggestions">
      <h3>Suggestions</h3>
      <p class="fine">Every chair is filled. Suggestions never change the lineup on their own.</p>
    </section>`;
    return;
  }
  root.innerHTML = `<section class="suggestions" aria-label="Lineup suggestions">
    <h3>Suggestions</h3>
    <p class="fine">Ideas from the pool. Nothing is seated until you choose it.</p>
    <ul>
      ${picks.map((pick) => `<li>
        <button type="button" class="suggestion" data-suggest="${esc(pick.id)}" data-suggest-role="${esc(pick.role)}">
          <strong>${esc(pick.name)}</strong>
          <span>${esc(ROLE_LABEL[pick.role])}</span>
          <em>${esc(pick.reason)}</em>
        </button>
      </li>`).join("")}
    </ul>
  </section>`;
}

function render() {
  renderSlots();
  renderPool();
  renderFilters();
  renderFavorites();
  renderSuggestions();
  updateChrome();
}

function selectSlot(role) {
  if (state.swapFrom && state.swapFrom !== role) {
    attemptSwap(state.swapFrom, role);
    return;
  }
  state.selected = role;
  state.roleFilter = role;
  render();
}

function attemptSwap(from, to) {
  const left = state.slots[from];
  const right = state.slots[to];
  if (left && !left.roles.includes(to)) {
    toast(`${left.name} doesn't play ${roleLabel(to).toLowerCase()}.`);
    return;
  }
  if (right && !right.roles.includes(from)) {
    toast(`${right.name} doesn't play ${roleLabel(from).toLowerCase()}.`);
    return;
  }
  state.slots[from] = right || null;
  state.slots[to] = left || null;
  state.swapFrom = null;
  state.selected = to;
  state.roleFilter = to;
  render();
}

function assign(person) {
  let role = state.selected;
  if (!person.roles.includes(role)) {
    if (person.roles.length === 1) role = person.roles[0];
    else return;
  }
  ROLE_IDS.forEach((slot) => {
    if (state.slots[slot]?.id === person.id) state.slots[slot] = null;
  });
  state.slots[role] = person;
  state.selected = role;
  state.roleFilter = role;
  state.swapFrom = null;
  render();
}

function clearLineup() {
  state.slots = blankSlots();
  state.swapFrom = null;
  state.selected = "singer";
  state.roleFilter = "singer";
  render();
}

function shuffleLineup() {
  const count = 3 + Math.floor(Math.random() * 6);
  const roles = ROLE_IDS.slice();
  for (let i = roles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  const chosen = roles.slice(0, count);
  const used = new Set();
  const next = blankSlots();
  chosen.forEach((role) => {
    const options = MUSICIANS.filter((person) => person.roles.includes(role) && !used.has(person.id));
    const person = options[Math.floor(Math.random() * options.length)];
    used.add(person.id);
    next[role] = person;
  });
  state.slots = next;
  state.swapFrom = null;
  state.selected = chosen.includes(state.selected) ? state.selected : chosen[0];
  state.roleFilter = state.selected;
  render();
}

function makeSeed() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function setHash(song) {
  const extra = shareExtra(song);
  const encoded = encodeShare(song.slots, song.seed, extra);
  if (extra.edit) {
    try {
      const decoded = decodeShare(encoded);
      if (decoded.editHash) localStorage.setItem(editStorageKey(decoded.editHash), JSON.stringify(extra.edit));
    } catch {
      /* the lineup link still works without the edit stash */
    }
  }
  if (state.band) writeBandHash();
  else history.replaceState(null, "", `#bm=${encoded}`);
  return encoded;
}

function imagine(forcedSeed) {
  const count = filledCount();
  if (count < 2) return;
  const seed = forcedSeed || state.song?.seed || makeSeed();
  const slots = snapshot(state.slots);
  if (state.song && state.song.seed === seed && state.song.signature === slotSignature(slots)) {
    document.querySelector("#song-sheet")?.scrollIntoView({ block: "start" });
    return;
  }
  player.stop();
  leaveLiveSet(false);
  state.playAll = false;
  state.versionName = "";
  hideGallery();
  state.band = null;
  state.bandTrack = null;
  if (bandSection) {
    bandSection.hidden = true;
    bandSection.innerHTML = "";
  }
  state.mutes = { drums: false, bass: false, chords: false, lead: false, horns: false, dj: false, strings: false };
  Object.keys(state.mutes).forEach((part) => player.setMute(part, false));
  const song = generateSong(slots, seed);
  state.song = song;
  state.originSong = cloneSong(song);
  state.history = [];
  state.future = [];
  state.editMarked = false;
  wasStale = false;
  renderSong();
  render();
  setHash(song);
  document.querySelector("#song-title")?.focus({ preventScroll: true });
  document.querySelector("#song-sheet")?.scrollIntoView({ block: "start" });
}

function fileStem(song) {
  const stem = `${song.bandName} - ${song.title}`.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, " ");
  return stem || "bandmatch";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadCover() {
  const canvas = document.querySelector("#cover");
  if (!canvas || !state.song) return;
  canvas.toBlob((blob) => {
    if (!blob) {
      toast("The cover could not be saved.");
      return;
    }
    downloadBlob(blob, `${fileStem(state.song)}.png`);
  }, "image/png");
}

function downloadMidi() {
  if (!state.song) return;
  const bytes = songToMidi(state.song);
  downloadBlob(new Blob([bytes], { type: "audio/midi" }), `${fileStem(state.song)}.mid`);
}

async function downloadWav() {
  if (!state.song || isStale()) return;
  const button = document.querySelector("#download-wav");
  if (button) {
    button.disabled = true;
    button.textContent = "Rendering WAV…";
  }
  try {
    const audio = await player.renderOffline();
    downloadBlob(encodeWav(audio), `${fileStem(state.song)}.wav`);
    toast("WAV ready.");
  } catch {
    toast("This browser couldn't render the WAV.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Download WAV";
    }
  }
}

function saveSong() {
  if (!state.song || isStale()) {
    toast("Imagine the current lineup before saving.");
    return;
  }
  const song = state.song;
  const entry = {
    key: `${song.seed}:${song.signature}`,
    encoded: encodeShare(song.slots, song.seed, shareExtra(song)),
    title: song.title,
    band: song.bandName,
    detail: `${song.tempo} BPM · ${song.key}`,
    savedAt: Date.now(),
  };
  state.favorites = [entry, ...state.favorites.filter((favorite) => favorite.key !== entry.key)].slice(0, 30);
  try {
    persistFavorites();
  } catch {
    toast("This browser couldn't store that song.");
    return;
  }
  renderFavorites();
  toast("Saved on this device.");
}

async function shareSong() {
  if (!state.song) return;
  const encoded = setHash(state.song);
  const link = `${location.origin}${location.pathname}${location.search}#bm=${encoded}`;
  try {
    await navigator.clipboard.writeText(link);
    toast("Share link copied.");
  } catch {
    const area = document.createElement("textarea");
    area.value = link;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    toast("Share link copied.");
  }
}

function applyShared(encoded) {
  const decoded = decodeShare(encoded);
  state.slots = decoded.slots;
  state.swapFrom = null;
  const first = ROLE_IDS.find((role) => state.slots[role]) || "singer";
  state.selected = first;
  state.roleFilter = first;
  state.song = null;
  player.stop();
  let song = withSharedMix(generateSong(snapshot(state.slots), decoded.seed), decoded.mix);
  state.originSong = cloneSong(song);
  state.history = [];
  state.future = [];
  state.editMarked = false;
  state.versionName = decoded.versionName || "";
  let sharedEdit = decoded.edit;
  if (!sharedEdit && decoded.editHash) {
    try {
      sharedEdit = JSON.parse(localStorage.getItem(editStorageKey(decoded.editHash)) || "null");
    } catch {
      sharedEdit = null;
    }
    if (!sharedEdit) toast("This link's edits were too long to carry on this device, so the original imagined song is open.");
  }
  if (sharedEdit) song = performSong(song, expandEdit(state.originSong, sharedEdit));
  state.song = song;
  wasStale = false;
  renderSong();
  render();
}

function openCustom() {
  document.querySelector("#custom-role").value = state.selected;
  dialog.showModal();
}

function saveCustom(event) {
  event.preventDefault();
  const name = document.querySelector("#custom-name").value;
  const role = document.querySelector("#custom-role").value;
  const genres = [...dialog.querySelectorAll('input[name="genre"]:checked')].map((input) => input.value);
  if (!name.trim()) {
    toast("Add a name for the custom player.");
    document.querySelector("#custom-name").focus();
    return;
  }
  if (!genres.length) {
    toast("Pick at least one genre.");
    return;
  }
  const person = createCustomMusician({
    name,
    role,
    genres,
    tempo: document.querySelector("#custom-tempo").value,
    feel: document.querySelector("#custom-feel").value,
    densityId: document.querySelector("#custom-density").value,
    weightId: document.querySelector("#custom-weight").value,
    tone: document.querySelector("#custom-tone").value,
  });
  ROLE_IDS.forEach((slot) => {
    if (state.slots[slot]?.id === person.id) state.slots[slot] = null;
  });
  state.slots[role] = person;
  state.selected = role;
  state.roleFilter = role;
  state.swapFrom = null;
  dialog.close();
  event.target.reset();
  render();
  toast(`${person.name} is in the ${roleLabel(role).toLowerCase()} chair.`);
}

player.onState((playing) => {
  document.querySelectorAll("#play, #mini-play").forEach((button) => {
    button.textContent = playing ? "Playing" : "Play";
    button.classList.toggle("is-playing", playing);
  });
  document.querySelector("#player")?.classList.toggle("is-playing", playing);
  if (!playing && state.liveSet && state.band && !state.between && player.position >= player.duration - 0.05) {
    beginTransition();
    return;
  }
  if (!playing && state.playAll && state.band && player.position >= player.duration - 0.05) {
    const next = (state.bandTrack ?? 0) + 1;
    if (next < state.band.tracks.length) openTrack(next, true);
    else state.playAll = false;
  }
});

player.onProgress((time, index) => {
  const duration = state.song?.duration || player.duration || 1;
  const ratio = Math.max(0, Math.min(1, duration ? time / duration : 0));
  document.querySelectorAll("#timeline-fill, #mini-fill").forEach((el) => {
    el.style.width = `${ratio * 100}%`;
  });
  const label = formatClock(time);
  const now = document.querySelector("#time-now");
  if (now) now.textContent = label;
  const liveClock = document.querySelector("#live-clock");
  if (liveClock && !state.between) liveClock.textContent = label;
  const liveFill = document.querySelector("#live-fill");
  if (liveFill && !state.between) liveFill.style.width = `${ratio * 100}%`;
  const miniTime = document.querySelector("#mini-time");
  if (miniTime) miniTime.textContent = label;
  document.querySelectorAll("[data-section]").forEach((el) => {
    el.classList.toggle("is-current", Number(el.dataset.section) === index);
  });
  document.querySelectorAll("#timeline, #mini-timeline").forEach((el) => {
    el.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    el.setAttribute("aria-valuetext", label);
  });
});

slotsEl.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove]");
  const swap = event.target.closest("[data-swap]");
  const slot = event.target.closest("[data-slot]");
  if (!slot) return;
  if (remove) {
    state.slots[remove.dataset.remove] = null;
    if (state.swapFrom === remove.dataset.remove) state.swapFrom = null;
    render();
    return;
  }
  if (swap) {
    const role = swap.dataset.swap;
    state.swapFrom = state.swapFrom === role ? null : role;
    renderSlots();
    updateChrome();
    const note = document.querySelector("#swap-note");
    if (note) {
      note.hidden = !state.swapFrom;
      if (state.swapFrom) note.textContent = `Choose another chair for ${state.slots[state.swapFrom].name}, or cancel.`;
    }
    return;
  }
  if (event.target.closest("[data-select]")) selectSlot(slot.dataset.slot);
});

document.querySelector("#suggestions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-suggest]");
  if (!button) return;
  const person = MUSICIANS.find((item) => item.id === button.dataset.suggest);
  const role = button.dataset.suggestRole;
  if (!person || !person.roles.includes(role) || state.slots[role]) return;
  state.selected = role;
  state.roleFilter = role;
  state.swapFrom = null;
  assign(person);
});

poolEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button || button.disabled) return;
  const person = MUSICIANS.find((item) => item.id === button.dataset.id);
  if (person) assign(person);
});

document.querySelector("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.roleFilter = button.dataset.filter;
  if (state.roleFilter !== "all") state.selected = state.roleFilter;
  state.swapFrom = null;
  render();
});

searchEl.addEventListener("input", () => {
  state.query = searchEl.value;
  renderPool();
});

imagineEl.addEventListener("click", () => imagine());
document.querySelector("#shuffle").addEventListener("click", shuffleLineup);
document.querySelector("#clear").addEventListener("click", clearLineup);
document.querySelector("#add-custom").addEventListener("click", openCustom);
document.querySelector("#custom-form").addEventListener("submit", saveCustom);
document.querySelector("#custom-cancel").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

favoritesEl.addEventListener("click", (event) => {
  const load = event.target.closest("[data-load]");
  const remove = event.target.closest("[data-delete]");
  if (load) {
    try {
      applyShared(state.favorites[Number(load.dataset.load)].encoded);
      setHash(state.song);
      document.querySelector("#song-sheet")?.scrollIntoView({ block: "start" });
    } catch {
      toast("That saved song could not be opened.");
    }
  }
  if (remove) {
    state.favorites.splice(Number(remove.dataset.remove), 1);
    try {
      persistFavorites();
    } catch {
      /* ignore quota */
    }
    renderFavorites();
  }
});

document.querySelector("#mini-play").addEventListener("click", () => {
  if (player.playing) player.stop();
  else player.play().catch(() => toast("This browser couldn't start audio."));
});
document.querySelector("#mini-stop").addEventListener("click", () => {
  state.playAll = false;
  player.stop();
});
bindScrub(document.querySelector("#mini-timeline"));

document.addEventListener("keydown", (event) => {
  if (event.key !== " " || event.repeat) return;
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;
  if (document.activeElement?.closest?.("[data-slot]")) return;
  if (dialog.open || !state.song || isStale()) return;
  event.preventDefault();
  if (player.playing) player.stop();
  else player.play().catch(() => toast("This browser couldn't start audio."));
});

window.addEventListener("resize", updateChrome);

function bandCode(album) {
  return encodeShare(album.tracks[0].slots, album.seed);
}

function writeBandHash() {
  if (!state.band) return;
  const track = Number.isInteger(state.bandTrack) ? `&t=${state.bandTrack}` : "";
  history.replaceState(null, "", `#band=${bandCode(state.band)}${track}`);
}

function leaveLiveSet(stopPlayer = true) {
  window.clearTimeout(state.transitionTimer);
  state.transitionTimer = 0;
  state.liveSet = false;
  state.between = false;
  state.nextIndex = null;
  player.setCrowd(false);
  if (stopPlayer) player.stop();
  const section = document.querySelector("#live-section");
  if (section) {
    section.hidden = true;
    section.innerHTML = "";
  }
}

function startLiveSet() {
  if (!state.band?.tracks?.length) return;
  state.liveSet = true;
  state.playAll = false;
  state.between = false;
  state.nextIndex = null;
  player.setCrowd(state.crowd);
  openTrack(state.bandTrack ?? 0, true);
  renderLive();
  document.querySelector("#live-set")?.scrollIntoView({ behavior: "instant", block: "start" });
}

function beginTransition() {
  if (!state.liveSet || !state.band) return;
  const next = nextTrack(state.bandTrack ?? 0, state.band.tracks.length);
  state.between = true;
  state.nextIndex = next;
  renderLive();
  window.clearTimeout(state.transitionTimer);
  state.transitionTimer = window.setTimeout(() => {
    state.between = false;
    if (!state.liveSet || !state.band) return;
    if (next == null) {
      leaveLiveSet(true);
      toast("End of the imagined set.");
      return;
    }
    openTrack(next, true);
    renderLive();
  }, TRANSITION_MS);
}

function renderLive() {
  const section = document.querySelector("#live-section");
  if (!section || !state.liveSet || !state.band) {
    if (section) {
      section.hidden = true;
      section.innerHTML = "";
    }
    return;
  }
  const album = state.band;
  const index = state.bandTrack ?? 0;
  const track = album.tracks[index];
  const upcoming = Number.isInteger(state.nextIndex) ? album.tracks[state.nextIndex] : null;
  const title = state.between ? (upcoming ? upcoming.title : "End of the set") : track?.title;
  const detail = state.between
    ? (upcoming ? `Next · ${index + 2} of ${album.tracks.length}` : "That was the last song")
    : `${index + 1} of ${album.tracks.length} · ${track.tempo} BPM · ${track.key}`;
  section.hidden = false;
  section.innerHTML = `<div class="live-set" id="live-set">
    <p class="ethics"><strong>Imagined concert.</strong> Not a real show. No voices, no real lyrics, and the crowd is synthesized noise, not a recording.</p>
    <p class="eyebrow">${esc(album.bandName)}</p>
    <p class="eyebrow" id="live-kicker">${esc(liveKicker(state.between))}</p>
    <h2>${esc(title || "")}</h2>
    <p id="live-detail">${esc(detail)}</p>
    <p id="live-clock">${state.between ? "Break" : esc(formatClock(player.currentTime()))}</p>
    <div class="live-meter" aria-hidden="true"><span id="live-fill"></span></div>
    <div class="live-actions">
      <button type="button" class="btn${state.crowd ? " is-on" : ""}" id="live-crowd" aria-pressed="${state.crowd}">Crowd ambience</button>
      <button type="button" class="btn" id="live-leave">Leave the set</button>
    </div>
  </div>`;
  document.querySelector("#live-crowd").addEventListener("click", () => {
    state.crowd = !state.crowd;
    player.setCrowd(state.crowd);
    const button = document.querySelector("#live-crowd");
    button.setAttribute("aria-pressed", String(state.crowd));
    button.classList.toggle("is-on", state.crowd);
  });
  document.querySelector("#live-leave").addEventListener("click", () => leaveLiveSet(true));
}

function openBand(slots, seed, track) {
  player.stop();
  leaveLiveSet(false);
  hideGallery();
  state.playAll = false;
  const album = planAlbum(snapshot(slots), seed);
  state.band = album;
  const index = Number.isInteger(track) && album.tracks[track] ? track : null;
  state.bandTrack = index;
  state.slots = snapshot(album.tracks[0].slots);
  if (index == null) {
    state.song = null;
    songSection.hidden = true;
    player.load(null);
  } else {
    const song = album.tracks[index];
    state.song = song;
    state.originSong = cloneSong(song);
    state.history = [];
    state.future = [];
    state.editMarked = false;
  }
  const first = ROLE_IDS.find((role) => state.slots[role]) || "singer";
  state.selected = first;
  state.roleFilter = first;
  writeBandHash();
  render();
  renderBand();
  if (index != null) renderSong();
  document.querySelector("#band-page")?.scrollIntoView({ behavior: "instant", block: "start" });
}

function openTrack(index, autoplay) {
  if (!state.band?.tracks[index]) return;
  state.bandTrack = index;
  const song = state.band.tracks[index];
  state.song = song;
  state.originSong = cloneSong(song);
  state.history = [];
  state.future = [];
  state.editMarked = false;
  writeBandHash();
  renderBand();
  renderSong();
  if (autoplay && !isStale()) player.play().catch(() => toast("This browser couldn't start audio."));
  document.querySelector("#song-title")?.focus({ preventScroll: true });
}

function renderBand() {
  const album = state.band;
  if (!album) {
    bandSection.hidden = true;
    bandSection.innerHTML = "";
    return;
  }
  bandSection.hidden = false;
  const song = album.tracks[0];
  const tracks = album.tracks.map((track, index) => `
    <li class="${index === state.bandTrack ? "is-current" : ""}">
      <button type="button" data-track="${index}"><strong>${index + 1}. ${esc(track.title)}</strong><span>${track.tempo} BPM · ${esc(track.key)} · ${esc(track.durationLabel)}</span></button>
      <button type="button" data-track-midi="${index}">MIDI</button>
    </li>`).join("");
  bandSection.innerHTML = `
    <div class="band-page" id="band-page">
      <p class="ethics"><strong>Imagined and original.</strong> This supergroup is not a real band. Named artists are not involved. Bandmatch never imitates a real voice and never uses real lyrics or melodies.</p>
      <div class="band-hero">
        <figure class="cover">
          <canvas id="band-logo" width="800" height="800" aria-label="Imagined logo for ${esc(album.bandName)}"></canvas>
          <figcaption>Logo</figcaption>
        </figure>
        <div>
          <p class="eyebrow">Imagined supergroup</p>
          <h2>${esc(album.bandName)}</h2>
          <p class="genre">${esc(song.genreLabel)}</p>
          <p class="blend">${esc(song.blend || "")}</p>
          <div class="roster">
            ${song.roster.map((entry) => `<span><em>${esc(ROLE_LABEL[entry.role])}</em> ${esc(entry.name)}</span>`).join("")}
          </div>
          <h3>${esc(album.albumTitle)}</h3>
          <p>${esc(imaginedBio(album))}</p>
        </div>
        <figure class="cover">
          <canvas id="album-cover" width="800" height="800" aria-label="Imagined album cover for ${esc(album.albumTitle)}"></canvas>
          <button type="button" class="btn" id="download-album-cover">Download album cover</button>
        </figure>
      </div>
      <div class="band-actions">
        <button type="button" class="btn btn-primary" id="play-all">Play all</button>
        <button type="button" class="btn" id="start-live">Live set</button>
        <button type="button" class="btn" id="copy-band">Copy link</button>
        <button type="button" class="btn" id="save-band">Save to My bands</button>
        <button type="button" class="btn" id="download-album">Download album ZIP</button>
        <button type="button" class="btn" id="close-band">Back to the lineup</button>
      </div>
      <p class="fine" id="album-status">The ZIP is built in the browser: one WAV and one MIDI for each track. It can take a while.</p>
      <ol class="tracklist">${tracks}</ol>
    </div>`;
  drawMark(document.querySelector("#band-logo"), song);
  drawCover(document.querySelector("#album-cover"), { ...song, title: album.albumTitle });
  document.querySelector("#play-all").addEventListener("click", () => {
    leaveLiveSet(false);
    state.playAll = true;
    openTrack(0, true);
  });
  document.querySelector("#start-live").addEventListener("click", startLiveSet);
  document.querySelector("#copy-band").addEventListener("click", copyBandLink);
  document.querySelector("#save-band").addEventListener("click", saveCurrentBand);
  document.querySelector("#download-album").addEventListener("click", downloadAlbum);
  document.querySelector("#download-album-cover").addEventListener("click", () => {
    document.querySelector("#album-cover").toBlob((blob) => {
      if (blob) downloadBlob(blob, `${fileStem({ bandName: album.bandName, title: album.albumTitle })}.png`);
    }, "image/png");
  });
  document.querySelector("#close-band").addEventListener("click", () => {
    state.playAll = false;
    player.stop();
    leaveLiveSet(false);
    state.band = null;
    state.bandTrack = null;
    bandSection.hidden = true;
    bandSection.innerHTML = "";
    history.replaceState(null, "", location.pathname + location.search);
  });
  document.querySelectorAll("[data-track]").forEach((button) => {
    button.addEventListener("click", () => {
      state.playAll = false;
      openTrack(Number(button.dataset.track), false);
    });
  });
  document.querySelectorAll("[data-track-midi]").forEach((button) => {
    button.addEventListener("click", () => {
      const track = album.tracks[Number(button.dataset.trackMidi)];
      downloadBlob(new Blob([songToMidi(track)], { type: "audio/midi" }), `${fileStem(track)}.mid`);
    });
  });
}

async function copyBandLink() {
  if (!state.band) return;
  writeBandHash();
  const link = `${location.origin}${location.pathname}${location.search}${location.hash}`;
  try {
    await navigator.clipboard.writeText(link);
    toast("Band link copied.");
  } catch {
    toast(link);
  }
}

async function downloadAlbum() {
  const album = state.band;
  const button = document.querySelector("#download-album");
  const status = document.querySelector("#album-status");
  if (!album || !button) return;
  state.playAll = false;
  player.stop();
  button.disabled = true;
  const files = [];
  try {
    for (let index = 0; index < album.tracks.length; index += 1) {
      const track = album.tracks[index];
      if (status) status.textContent = `Rendering track ${index + 1} of ${album.tracks.length}…`;
      player.load(track.arrangement);
      player.setMixer(track.mixer);
      const audio = await player.renderOffline();
      const wav = new Uint8Array(await encodeWav(audio).arrayBuffer());
      const stem = `${String(index + 1).padStart(2, "0")} ${fileStem(track)}`;
      files.push({ name: `${stem}.wav`, data: wav });
      files.push({ name: `${stem}.mid`, data: songToMidi(track) });
    }
    downloadBlob(new Blob([zipStore(files)], { type: "application/zip" }), `${fileStem({ bandName: album.bandName, title: album.albumTitle })}.zip`);
    if (status) status.textContent = "Album ZIP ready.";
  } catch {
    if (status) status.textContent = "This browser couldn't build the album ZIP. Each track can still be downloaded from its page.";
    toast("The album ZIP could not be built.");
  } finally {
    button.disabled = false;
    if (state.song) {
      player.load(state.song.arrangement);
      player.setMixer(state.song.mixer);
    }
  }
}

function hideGallery() {
  state.gallery = false;
  document.body.classList.remove("is-gallery");
  const section = document.querySelector("#gallery-section");
  if (!section) return;
  section.hidden = true;
  section.innerHTML = "";
}

function galleryCard(card, index) {
  const album = card.album;
  const song = album.tracks[0];
  const tracks = album.tracks.slice(0, 3).map((track) => esc(track.title)).join(" · ");
  const more = album.tracks.length > 3 ? ` · +${album.tracks.length - 3}` : "";
  return `<article class="gallery-card">
    <canvas id="gallery-mark-${index}" width="800" height="800" aria-label="Imagined logo for ${esc(album.bandName)}"></canvas>
    <div>
      <p class="eyebrow">${card.sample ? "Sample" : "Saved on this device"}</p>
      <h3>${esc(album.bandName)}</h3>
      <p class="genre">${esc(album.albumTitle)} · ${album.tracks.length} imagined tracks</p>
      <p>${esc(card.note || song.blend || "")}</p>
      <div class="roster">
        ${song.roster.map((entry) => `<span><em>${esc(ROLE_LABEL[entry.role])}</em> ${esc(entry.name)}</span>`).join("")}
      </div>
      <p class="fine">${tracks}${more}</p>
      <div class="gallery-actions">
        <button type="button" class="btn btn-primary" data-open-gallery="${index}">Open band page</button>
        <button type="button" class="btn" data-copy-gallery="${index}">Copy link</button>
        ${card.sample ? "" : `<button type="button" class="btn" data-forget-gallery="${index}">Remove</button>`}
      </div>
    </div>
  </article>`;
}

function renderGallery() {
  const section = document.querySelector("#gallery-section");
  if (!section) return;
  const samples = featuredBands();
  const saved = [];
  state.bands.forEach((record) => {
    try {
      const decoded = decodeShare(record.encoded);
      const album = planAlbum(decoded.slots, decoded.seed);
      saved.push({
        sample: false,
        note: "Saved in this browser. Someone else opens it with the share link, not an account.",
        album,
        encoded: record.encoded,
      });
    } catch {
      /* drop a band this browser can no longer read */
    }
  });
  state.galleryCards = [...samples, ...saved];
  const sampleMarkup = samples.map((card, index) => galleryCard(card, index)).join("");
  const savedMarkup = saved.length
    ? saved.map((card, index) => galleryCard(card, samples.length + index)).join("")
    : `<p class="empty">No saved bands yet. Open a band page and choose Save to My bands. It stays on this device.</p>`;
  section.hidden = false;
  section.innerHTML = `<div class="gallery-page" id="gallery-page">
    <div class="section-head">
      <h2>Gallery</h2>
      <button type="button" class="text-btn" id="close-gallery">Back to the lineup</button>
    </div>
    <p class="ethics"><strong>Imagined and original.</strong> Sample bands are not real groups. Named artists are not involved. Bandmatch never imitates a real voice and never uses real lyrics or melodies. Sharing a band is still a link.</p>
    <h3>Sample bands</h3>
    <div class="gallery-grid">${sampleMarkup}</div>
    <h3>My bands</h3>
    <p class="fine">Albums you save from a band page. There is no account and no server.</p>
    <div class="gallery-grid">${savedMarkup}</div>
  </div>`;
  state.galleryCards.forEach((card, index) => {
    const canvas = document.querySelector(`#gallery-mark-${index}`);
    if (canvas) drawMark(canvas, card.album.tracks[0]);
  });
  document.querySelector("#close-gallery").addEventListener("click", leaveGallery);
  section.querySelectorAll("[data-open-gallery]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = state.galleryCards[Number(button.dataset.openGallery)];
      if (!card) return;
      const decoded = decodeShare(card.encoded);
      openBand(decoded.slots, decoded.seed, null);
    });
  });
  section.querySelectorAll("[data-copy-gallery]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = state.galleryCards[Number(button.dataset.copyGallery)];
      if (!card) return;
      const link = `${location.origin}${location.pathname}${location.search}#band=${card.encoded}`;
      try {
        await navigator.clipboard.writeText(link);
        toast("Band link copied.");
      } catch {
        toast(link);
      }
    });
  });
  section.querySelectorAll("[data-forget-gallery]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = state.galleryCards[Number(button.dataset.forgetGallery)];
      if (!card) return;
      state.bands = forgetBand(state.bands, card.encoded);
      try {
        persistBands();
      } catch {
        toast("This browser couldn't update My bands.");
      }
      renderGallery();
    });
  });
}

function showGallery() {
  state.gallery = true;
  document.body.classList.add("is-gallery");
  renderGallery();
  document.querySelector("#gallery-page")?.scrollIntoView({ behavior: "instant", block: "start" });
}

function leaveGallery() {
  hideGallery();
  if (state.band) writeBandHash();
  else if (state.song) setHash(state.song);
  else history.pushState(null, "", location.pathname + location.search);
}

function saveCurrentBand() {
  if (!state.band) return;
  const encoded = bandCode(state.band);
  state.bands = rememberBand(state.bands, bandRecord(state.band, encoded));
  try {
    persistBands();
  } catch {
    toast("This browser couldn't store that band.");
    return;
  }
  toast("Saved in My bands on this device.");
}

function readRoute() {
  const hash = location.hash;
  if (hash === "#gallery") {
    render();
    showGallery();
    return;
  }
  hideGallery();
  const band = hash.match(/(?:^#|[?&])band=([^&]+)/);
  const track = hash.match(/(?:^#|&)t=(\d+)/);
  const song = hash.match(/(?:^#|[?&])bm=([^&]+)/);
  if (band) {
    try {
      const decoded = decodeShare(decodeURIComponent(band[1]));
      const index = track ? Number(track[1]) : null;
      openBand(decoded.slots, decoded.seed, index);
      if (decoded.edit) {
        /* album tracks are the imagined songs; a band link does not carry sheet edits */
      }
    } catch {
      render();
      toast("That band link could not be read.");
    }
    return;
  }
  if (song) {
    try {
      applyShared(decodeURIComponent(song[1]));
    } catch {
      render();
      toast("That share link could not be read.");
    }
    return;
  }
  render();
}

readRoute();
window.addEventListener("hashchange", () => readRoute());

document.querySelector("#custom-genres").innerHTML = GENRE_IDS.map((genre) => `
  <label class="check"><input type="checkbox" name="genre" value="${genre}"><span>${esc(GENRE_LABEL[genre])}</span></label>
`).join("");
document.querySelector("#custom-genres").addEventListener("change", (event) => {
  const checked = dialog.querySelectorAll('input[name="genre"]:checked');
  if (checked.length > 3 && event.target.checked) {
    event.target.checked = false;
    toast("Pick up to three genres.");
  }
});
