import {
  GENRE_IDS,
  GENRE_LABEL,
  MUSICIANS,
  ROLE_IDS,
  ROLE_LABEL,
  createCustomMusician,
  roleLabel,
} from "./musicians.js";
import { createPlayer } from "./player.js";
import { blankSlots, decodeShare, encodeShare, generateSong, slotSignature } from "./song.js";

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
  mutes: { drums: false, bass: false, chords: false, lead: false },
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
    ? `${count} of 5 chairs filled. Add at least 2. Keys is optional.`
    : `${count} of 5 chairs filled. Keys is optional.`;
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
    const emptyHint = role === "keys" ? "Optional" : "Open chair";
    const body = person
      ? `<strong>${esc(person.name)}</strong><span>${esc(person.genres.map((genre) => GENRE_LABEL[genre]).join(" · "))}</span>`
      : `<strong>${emptyHint}</strong><span>${role === "keys" ? "Leave this empty if you want" : "Pick someone from the pool"}</span>`;
    const actions = person
      ? `<div class="slot-actions">
          <button type="button" data-swap="${role}" aria-label="Swap ${esc(person.name)}">${swap === role ? "Cancel" : "Swap"}</button>
          <button type="button" data-remove="${role}" aria-label="Remove ${esc(person.name)}">Remove</button>
        </div>`
      : "";
    return `<article class="slot${selected ? " is-selected" : ""}${person ? " is-filled" : ""}" data-slot="${role}">
      <button type="button" class="slot-select" data-select="${role}" aria-pressed="${selected}">
        <span class="slot-kicker"><span>${esc(ROLE_LABEL[role])}</span>${role === "keys" ? "<em>Optional</em>" : ""}</span>
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

function renderSong() {
  const song = state.song;
  if (!song) {
    songSection.hidden = true;
    return;
  }
  songSection.hidden = false;
  const lyrics = `
    <div class="lyric-block">
      <h3>Verse</h3>
      ${song.lyrics.verse.map((line) => `<p>${esc(line)}</p>`).join("")}
    </div>
    <div class="lyric-block">
      <h3>Chorus</h3>
      ${song.lyrics.chorus.map((line) => `<p>${esc(line)}</p>`).join("")}
    </div>`;
  songSection.innerHTML = `
    <div class="sheet" id="song-sheet">
      <p class="eyebrow">Imagined band</p>
      <p class="band-name">${esc(song.bandName)}</p>
      <h2 id="song-title" tabindex="-1">${esc(song.title)}</h2>
      <p class="genre">${esc(song.genreLabel)}</p>
      <p class="pocket">${esc(song.pocket)}</p>
      <p id="stale" class="banner" ${isStale() ? "" : "hidden"}>The lineup changed. Imagine again to match this group. Playback stays off until you do.</p>
      <dl class="meta">
        <div><dt>Tempo</dt><dd>${song.tempo} BPM</dd></div>
        <div><dt>Key</dt><dd>${esc(song.key)}</dd></div>
        <div><dt>Meter</dt><dd>${esc(song.timeSignature)}</dd></div>
        <div><dt>Seed</dt><dd><code>${esc(song.seed)}</code></dd></div>
      </dl>
      <div class="roster">
        ${song.roster.map((entry) => `<span><em>${esc(ROLE_LABEL[entry.role])}</em> ${esc(entry.name)}</span>`).join("")}
      </div>
      <h3>Structure <span>${song.bars} bars on the sheet</span></h3>
      <ol class="sections">
        ${song.structure.map((section) => `<li><strong>${esc(section.name)}</strong><span>${section.bars}</span></li>`).join("")}
      </ol>
      <h3>Chord progression <span>${esc(song.loopLabel)} in the demo</span></h3>
      <div class="chords">
        ${song.progression.map((chord) => `<span>${esc(chord.symbol)}</span>`).join("")}
      </div>
      <h3>Original lyrics</h3>
      <p class="fine">Built from an original phrase bank. Not taken from real songs, and not sung in the demo.</p>
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
      </div>
    </div>
    <div class="player" id="player">
      <div class="player-top">
        <div>
          <p class="eyebrow">Demo</p>
          <h3>Play the arrangement</h3>
          <p class="fine">Drums, bass, chords, and a lead melody standing in for the vocal. No singing voice and no imitation of a real artist.</p>
        </div>
        <canvas id="meter" width="280" height="36" aria-hidden="true"></canvas>
      </div>
      <div class="transport">
        <button type="button" class="btn btn-primary" id="play">Play</button>
        <button type="button" class="btn" id="stop">Stop</button>
        <span class="transport-meta">${song.tempo} BPM · ${esc(song.key)} · ${esc(song.timeSignature)}</span>
      </div>
      <div class="mutes" role="group" aria-label="Mute parts">
        ${["drums", "bass", "chords", "lead"].map((part) => {
          const on = !state.mutes[part];
          const label = part === "lead" ? "Lead" : part[0].toUpperCase() + part.slice(1);
          return `<button type="button" class="mute${on ? " is-on" : ""}" data-mute="${part}" aria-pressed="${on}">${label}</button>`;
        }).join("")}
      </div>
      <p class="fine">Lead is a synthesizer melody, not a vocal. Empty chairs are filled by a generic part shaped by the rest of the lineup.</p>
    </div>`;
  player.load(song.arrangement);
  player.attachMeter(document.querySelector("#meter"));
  document.querySelector("#play").disabled = isStale();
  document.querySelector("#reroll").addEventListener("click", () => imagine(makeSeed()));
  document.querySelector("#save").addEventListener("click", saveSong);
  document.querySelector("#share").addEventListener("click", shareSong);
  document.querySelector("#play").addEventListener("click", () => {
    player.play().catch(() => toast("This browser couldn't start audio."));
  });
  document.querySelector("#stop").addEventListener("click", () => player.stop());
  document.querySelectorAll("[data-mute]").forEach((button) => {
    button.addEventListener("click", () => {
      const part = button.dataset.mute;
      state.mutes[part] = !state.mutes[part];
      player.setMute(part, state.mutes[part]);
      button.classList.toggle("is-on", !state.mutes[part]);
      button.setAttribute("aria-pressed", String(!state.mutes[part]));
    });
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
  const count = 3 + Math.floor(Math.random() * 3);
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
  const encoded = encodeShare(song.slots, song.seed);
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
  state.mutes = { drums: false, bass: false, chords: false, lead: false };
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

function saveSong() {
  if (!state.song || isStale()) {
    toast("Imagine the current lineup before saving.");
    return;
  }
  const song = state.song;
  const entry = {
    key: `${song.seed}:${song.signature}`,
    encoded: encodeShare(song.slots, song.seed),
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
  const song = generateSong(snapshot(state.slots), decoded.seed);
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
