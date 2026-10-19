import { GENRE_IDS, MUSICIANS, ROLE_IDS } from "../js/musicians.js";
import { createCustomMusician } from "../js/musicians.js";
import { decodeShare, encodeShare, generateSong, slotSignature } from "../js/song.js";

const feelOk = {
  swing: (person) => person.swing >= 0.45,
  straight: (person) => person.swing < 0.5,
  sparse: (person) => person.density <= 0.42,
  heavy: (person) => person.weight >= 0.58,
};

const failures = [];
function fail(message) {
  failures.push(message);
}

if (MUSICIANS.length < 40 || MUSICIANS.length > 45) fail(`expected about 40 musicians, found ${MUSICIANS.length}`);

const ids = new Set();
for (const person of MUSICIANS) {
  if (ids.has(person.id)) fail(`duplicate id ${person.id}`);
  ids.add(person.id);
  if (!person.roles.length) fail(`${person.name} has no role`);
  for (const role of person.roles) if (!ROLE_IDS.includes(role)) fail(`${person.name} bad role ${role}`);
  for (const genre of person.genres) if (!GENRE_IDS.includes(genre)) fail(`${person.name} bad genre ${genre}`);
  if (person.tempoMin >= person.tempoMax) fail(`${person.name} tempo range`);
  for (const key of ["swing", "density", "weight", "brightness", "drive"]) {
    if (person[key] < 0 || person[key] > 1) fail(`${person.name} ${key} out of range`);
  }
  if (person.tendencies.length < 2) fail(`${person.name} needs tendencies`);
  if (person.feel.includes("swing") && person.feel.includes("straight")) fail(`${person.name} mixed feel`);
  for (const tag of person.feel) {
    if (feelOk[tag] && !feelOk[tag](person)) fail(`${person.name} tag ${tag} disagrees with numbers`);
  }
}

for (const role of ROLE_IDS) {
  const count = MUSICIANS.filter((person) => person.roles.includes(role)).length;
  if (count < 6) fail(`${role} only has ${count} players`);
}

const needed = ["rock", "soul", "r&b", "jazz", "funk", "metal", "pop", "hip-hop", "country", "punk"];
for (const genre of needed) {
  if (!MUSICIANS.some((person) => person.genres.includes(genre))) fail(`missing genre ${genre}`);
}

function lineup(idsByRole) {
  const slots = { singer: null, guitar: null, bass: null, drums: null, keys: null };
  for (const [role, id] of Object.entries(idsByRole)) {
    slots[role] = MUSICIANS.find((person) => person.id === id);
  }
  return slots;
}

const fixed = lineup({
  singer: "aretha-franklin",
  guitar: "nile-rodgers",
  bass: "james-jamerson",
  drums: "clyde-stubblefield",
  keys: "stevie-wonder",
});
const a = generateSong(fixed, "k3m9qx");
const b = generateSong(fixed, "k3m9qx");
const view = (song) => JSON.stringify({
  title: song.title,
  band: song.bandName,
  tempo: song.tempo,
  key: song.key,
  meter: song.timeSignature,
  chords: song.progression.map((chord) => chord.symbol),
  lyrics: song.lyrics,
  notes: song.notes,
  arrangement: song.arrangement,
});
if (view(a) !== view(b)) fail("same seed and lineup were not deterministic");
const reroll = generateSong(fixed, "aa22zz");
if (reroll.title === a.title && reroll.seed === a.seed) fail("reroll seed did not change the song inputs");
if (reroll.signature !== a.signature) fail("signature should ignore seed");

const duo = lineup({ singer: "billie-holiday", drums: "max-roach" });
const metal = lineup({
  guitar: "tony-iommi",
  bass: "cliff-burton",
  drums: "dave-grohl",
  singer: "kurt-cobain",
});
for (const [name, slots, seed] of [["fixed", fixed, "k3m9qx"], ["duo", duo, "blue88"], ["metal", metal, "iron01"]]) {
  const song = generateSong(slots, seed);
  for (const field of ["bandName", "title", "genreLabel", "tempo", "key", "timeSignature", "pocket"]) {
    if (!song[field]) fail(`${name} missing ${field}`);
  }
  if (!song.structure.length || !song.progression.length || !song.lyrics.verse.length || !song.notes.length) {
    fail(`${name} sheet incomplete`);
  }
  const loop = song.arrangement.loopSteps;
  const events = [
    ...song.arrangement.kick,
    ...song.arrangement.snare,
    ...song.arrangement.hat,
    ...song.arrangement.bass,
    ...song.arrangement.chords,
    ...song.arrangement.lead,
  ];
  if (!song.arrangement.kick.length || !song.arrangement.bass.length || !song.arrangement.chords.length || !song.arrangement.lead.length) {
    fail(`${name} arrangement missing a part`);
  }
  for (const event of events) {
    if (event.step < 0 || event.step >= loop) fail(`${name} step ${event.step} outside ${loop}`);
  }
  if (song.tempo < 72 || song.tempo > 156) fail(`${name} tempo ${song.tempo}`);
}

const custom = createCustomMusician({
  name: "Studio Guest",
  role: "keys",
  genres: ["jazz", "soul"],
  tempo: "slow",
  feel: "swing",
  densityId: "sparse",
  weightId: "light",
  tone: "clean",
});
const customSlots = lineup({ singer: "dolly-parton", bass: "carol-kaye" });
customSlots.keys = custom;
const encoded = encodeShare(customSlots, "guest1");
const decoded = decodeShare(encoded);
if (slotSignature(decoded.slots) !== slotSignature(customSlots)) fail("share roundtrip changed the lineup");
const left = generateSong(customSlots, "guest1");
const right = generateSong(decoded.slots, decoded.seed);
if (left.title !== right.title || left.tempo !== right.tempo || left.lyrics.chorus.join("|") !== right.lyrics.chorus.join("|")) {
  fail("shared song did not rebuild");
}

const banned = ["yesterday, all my", "is this the real life", "smells like teen spirit", "stairway to heaven"];
const blob = `${left.lyrics.verse.join(" ")} ${left.lyrics.chorus.join(" ")} ${a.lyrics.verse.join(" ")}`.toLowerCase();
for (const phrase of banned) if (blob.includes(phrase)) fail(`lyric collided with ${phrase}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`ok ${MUSICIANS.length} musicians, deterministic song "${a.title}" by ${a.bandName} at ${a.tempo} BPM`);
