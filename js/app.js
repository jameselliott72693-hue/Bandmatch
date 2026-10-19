import {
  GENRE_IDS,
  GENRE_LABEL,
  MUSICIANS,
  ROLE_IDS,
  ROLE_LABEL,
  createCustomMusician,
  roleLabel,
} from "./musicians.js";
import { drawCover } from "./cover.js";
import { CHANNEL_LABEL, channelOrder, partIsMuted, setPartMuted } from "./mixer.js";
import { songToMidi } from "./midi.js";
import { createPlayer, encodeWav } from "./player.js";
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
};

const slotsEl = document.querySelector("#slots");
const poolEl = document.querySelector("#pool");
const searchEl = document.querySelector("#search");
const imagineEl = document.querySelector("#imagine");
const hintEl = document.querySelector("#lineup-hint");
const songSection = document.querySelector("#song-section");
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

function persistFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites.slice(0, 30)));
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
          <p class="pocket">${esc(song.pocket)}</p>
        </div>
        <figure class="cover">
          <canvas id="cover" width="800" height="800" aria-label="Imagined album cover for ${esc(song.title)}"></canvas>
          <button type="button" class="btn" id="download-cover">Download cover</button>
        </figure>
      </div>
      <p id="stale" class="banner" ${isStale() ? "" : "hidden"}>The lineup changed. Imagine again to match this group. Playback stays off until you do.</p>
      <dl class="meta">
        <div><dt>Tempo</dt><dd>${song.tempo} BPM</dd></div>
        <div><dt>Key</dt><dd>${esc(song.key)}</dd></div>
        <div><dt>Meter</dt><dd>${esc(song.timeSignature)}</dd></div>
        <div><dt>Length</dt><dd>${esc(song.durationLabel)}</dd></div>
        <div><dt>Seed</dt><dd><code>${esc(song.seed)}</code></dd></div>
      </dl>
      <div class="roster">
        ${song.roster.map((entry) => `<span><em>${esc(ROLE_LABEL[entry.role])}</em> ${esc(entry.name)}</span>`).join("")}
      </div>
      <h3>Structure <span>${esc(song.durationLabel)} · ${song.bars} bars</span></h3>
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
          <span>${esc(song.durationLabel)}</span>
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
  document.querySelector("#play").addEventListener("click", () => {
    player.play().catch(() => toast("This browser couldn't start audio."));
  });
  document.querySelector("#stop").addEventListener("click", () => player.stop());
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

function render() {
  renderSlots();
  renderPool();
  renderFilters();
  renderFavorites();
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
  const encoded = encodeShare(song.slots, song.seed, { mixer: song.mixer });
  history.replaceState(null, "", `#bm=${encoded}`);
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
  state.mutes = { drums: false, bass: false, chords: false, lead: false, horns: false, dj: false, strings: false };
  Object.keys(state.mutes).forEach((part) => player.setMute(part, false));
  const song = generateSong(slots, seed);
  state.song = song;
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
    encoded: encodeShare(song.slots, song.seed, { mixer: song.mixer }),
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
  const song = withSharedMix(generateSong(snapshot(state.slots), decoded.seed), decoded.mix);
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
document.querySelector("#mini-stop").addEventListener("click", () => player.stop());
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

const shared = location.hash.match(/(?:^#|[?&])bm=([^&]+)/);
if (shared) {
  try {
    applyShared(decodeURIComponent(shared[1]));
  } catch {
    render();
    toast("That share link could not be read.");
  }
} else {
  render();
}

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
