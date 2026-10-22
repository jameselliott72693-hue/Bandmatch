import { BAND_LIMIT, featuredBands, forgetBand, rememberBand } from "../js/gallery.js";
import { GENRE_IDS, MUSICIANS, ROLE_IDS } from "../js/musicians.js";
import { createCustomMusician } from "../js/musicians.js";
import { addTrack, albumPayload, buildAlbum, freshTrackSeed, moveTrack, removeTrack, renameAlbum } from "../js/album.js";
import { imaginedBio, planAlbum } from "../js/band.js";
import { compactEdit, draftFromSong, expandEdit, performSong } from "../js/edit.js";
import { compareDrafts, forgetVersion, listVersions, saveVersion, versionKey } from "../js/versions.js";
import { styleFor } from "../js/styles.js";
import { zipStore } from "../js/zip.js";
import { compactMixer, defaultMixer } from "../js/mixer.js";
import { songToMidi } from "../js/midi.js";
import { TRANSITION_MS, liveKicker, nextTrack } from "../js/set.js";
import { decodeShare, encodeShare, generateSong, slotSignature, withSharedMix } from "../js/song.js";
import { mixerForStem, stemList } from "../js/stems.js";
import { battleCall, battleSongs, decodeBattle, encodeBattle, rivalLineup, roomScore } from "../js/battle.js";
import { lyricBlocks, lyricText } from "../js/lyrics.js";
import { energiesFromBins, videoModel } from "../js/video.js";
import { suggestLineup } from "../js/suggest.js";

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

if (MUSICIANS.length !== 94) fail(`expected 94 musicians, found ${MUSICIANS.length}`);
if (MUSICIANS[0].id !== "freddie-mercury" || MUSICIANS[79].id !== "alison-krauss") {
  fail("existing musicians were reordered or re-keyed");
}

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
  if (!song.structure.length || !song.progression.length || !song.bridge.length || !song.lyrics.verse.length || !song.notes.length) {
    fail(`${name} sheet incomplete`);
  }
  const names = song.structure.map((section) => section.name);
  for (const required of ["Intro", "Verse", "Chorus", "Bridge", "Final chorus", "Outro"]) {
    if (!names.includes(required)) fail(`${name} missing section ${required}`);
  }
  const duration = song.arrangement.duration;
  if (duration < 119 || duration > 241) fail(`${name} duration ${duration.toFixed(1)}s is outside 2–4 minutes`);
  if (Math.abs(song.duration - duration) > 0.001) fail(`${name} duration mismatch`);
  const total = song.arrangement.totalSteps;
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
    if (event.step < 0 || event.step >= total) fail(`${name} step ${event.step} outside ${total}`);
    if (typeof event.time !== "number" || event.time < 0 || event.time > duration + 0.05) {
      fail(`${name} event time ${event.time}`);
    }
  }
  let cursor = 0;
  for (const section of song.structure) {
    if (section.startStep !== cursor) fail(`${name} ${section.name} does not follow the previous section`);
    cursor = section.endStep;
    if (section.role === "intro" || section.role === "outro") {
      if (section.lines.length) fail(`${name} ${section.name} should not have lyrics`);
    } else if (!section.lines.length) fail(`${name} ${section.name} is missing lyrics`);
  }
  if (cursor !== total) fail(`${name} sections do not cover the song`);
  const verse = song.structure.find((section) => section.role === "verse");
  const chorus = song.structure.find((section) => section.role === "chorus");
  const perBar = (section, list) => list.filter((event) => event.step >= section.startStep && event.step < section.endStep).length / section.bars;
  if (perBar(chorus, song.arrangement.kick) <= perBar(verse, song.arrangement.kick)) {
    fail(`${name} chorus is not fuller than the verse`);
  }
  const leadAvg = (section) => {
    const notes = song.arrangement.lead.filter((event) => event.step >= section.startStep && event.step < section.endStep);
    if (!notes.length) return null;
    return notes.reduce((sum, event) => sum + event.midi, 0) / notes.length;
  };
  const verseLead = leadAvg(verse);
  const chorusLead = leadAvg(chorus);
  if (verseLead == null || chorusLead == null || chorusLead < verseLead + 1) {
    fail(`${name} melody does not rise in the chorus (${verseLead} vs ${chorusLead})`);
  }
  const bridgeSymbols = song.bridge.map((chord) => chord.symbol).join(" ");
  const mainSymbols = song.progression.map((chord) => chord.symbol).join(" ");
  if (bridgeSymbols === mainSymbols) fail(`${name} bridge matches the main progression`);
  if (song.tempo < 72 || song.tempo > 156) fail(`${name} tempo ${song.tempo}`);
}

const pop = lineup({ singer: "beyonce", guitar: "johnny-marr" });
const popSong = generateSong(pop, "daylight");
if (!popSong.structure.some((section) => section.name === "Pre-chorus")) fail("pop song skipped the pre-chorus");

const punkSlots = lineup({});
punkSlots.guitar = createCustomMusician({
  name: "Fast Guest",
  role: "guitar",
  genres: ["punk"],
  tempo: "fast",
  feel: "straight",
  densityId: "balanced",
  weightId: "heavy",
  tone: "driven",
});
punkSlots.drums = createCustomMusician({
  name: "Backbeat Guest",
  role: "drums",
  genres: ["punk"],
  tempo: "fast",
  feel: "straight",
  densityId: "busy",
  weightId: "heavy",
  tone: "driven",
});
const punkSong = generateSong(punkSlots, "fast99");
if (punkSong.bank !== "punk") fail(`expected punk bank, got ${punkSong.bank}`);
if (punkSong.structure.some((section) => section.role === "pre")) fail("punk song included a pre-chorus");
if (punkSong.arrangement.duration < 119 || punkSong.arrangement.duration > 241) {
  fail(`punk duration ${punkSong.arrangement.duration}`);
}

const bluesSlots = lineup({});
bluesSlots.guitar = createCustomMusician({
  name: "Blues Guest",
  role: "guitar",
  genres: ["blues"],
  tempo: "slow",
  feel: "straight",
  densityId: "sparse",
  weightId: "medium",
  tone: "warm",
});
bluesSlots.bass = createCustomMusician({
  name: "Blues Bass",
  role: "bass",
  genres: ["blues"],
  tempo: "slow",
  feel: "swing",
  densityId: "sparse",
  weightId: "medium",
  tone: "warm",
});
const bluesSong = generateSong(bluesSlots, "slow12");
if (bluesSong.bank !== "blues") fail(`expected blues bank, got ${bluesSong.bank}`);
const bluesVerse = bluesSong.structure.find((section) => section.role === "verse");
if (!bluesVerse || bluesVerse.bars < 12) fail(`blues verse is ${bluesVerse?.bars} bars`);
if (bluesSong.structure.some((section) => section.role === "pre")) fail("blues song included a pre-chorus");

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
if (decoded.mix) fail("default mix should stay out of the share link");
const oldPayload = JSON.parse(Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
if (oldPayload.v !== 1 || oldPayload.mix) fail("share payload grew a mix field");
const mixed = generateSong(fixed, "k3m9qx");
mixed.mixer.channels.guitar.volume = 0.4;
mixed.mixer.channels.guitar.pan = -0.5;
mixed.mixer.channels.lead.mute = true;
mixed.mixer.master = 0.6;
const mixedEncoded = encodeShare(fixed, "k3m9qx", { mixer: mixed.mixer });
const mixedDecoded = decodeShare(mixedEncoded);
const restored = withSharedMix(generateSong(mixedDecoded.slots, mixedDecoded.seed), mixedDecoded.mix);
if (restored.mixer.channels.guitar.volume !== 0.4 || restored.mixer.channels.guitar.pan !== -0.5) {
  fail("mixer settings did not survive the share link");
}
if (!restored.mixer.channels.lead.mute || restored.mixer.master !== 0.6) fail("mute or master did not survive the share link");
if (compactMixer(defaultMixer(a.roster))) fail("default mixer should compact to nothing");
const legacy = decodeShare(encoded);
if (legacy.mix) fail("legacy share should have no mix");
const legacySong = withSharedMix(generateSong(legacy.slots, legacy.seed), legacy.mix);
if (JSON.stringify(legacySong.mixer) !== JSON.stringify(defaultMixer(legacySong.roster))) {
  fail("missing mix did not fall back to the default mixer");
}

const banned = ["yesterday, all my", "is this the real life", "smells like teen spirit", "stairway to heaven"];
const blob = `${left.lyrics.verse.join(" ")} ${left.lyrics.chorus.join(" ")} ${a.lyrics.verse.join(" ")}`.toLowerCase();
for (const phrase of banned) if (blob.includes(phrase)) fail(`lyric collided with ${phrase}`);

const octet = lineup({
  singer: "aretha-franklin",
  guitar: "nile-rodgers",
  bass: "james-jamerson",
  drums: "clyde-stubblefield",
  keys: "stevie-wonder",
});
octet.horns = MUSICIANS.find((person) => person.id === "miles-davis");
octet.dj = MUSICIANS.find((person) => person.id === "j-dilla");
octet.strings = MUSICIANS.find((person) => person.id === "yo-yo-ma");
const wide = generateSong(octet, "octet1");
const wideAgain = generateSong(octet, "octet1");
if (view(wide) !== view(wideAgain)) fail("full lineup was not deterministic");
if (wide.roster.length !== 8) fail(`expected 8 chairs, found ${wide.roster.length}`);
if (!wide.arrangement.horns.length || !wide.arrangement.dj.length || !wide.arrangement.strings.length) {
  fail("horns, DJ, or strings did not play");
}
if (a.arrangement.horns.length || a.arrangement.dj.length || a.arrangement.strings.length) {
  fail("empty extra chairs produced notes");
}

function midiTracks(bytes) {
  if (bytes[0] !== 0x4d || bytes[1] !== 0x54 || bytes[2] !== 0x68 || bytes[3] !== 0x64) {
    throw new Error("missing MThd");
  }
  const division = (bytes[12] << 8) | bytes[13];
  const tracks = (bytes[10] << 8) | bytes[11];
  let pos = 14;
  const noteOns = [];
  for (let track = 0; track < tracks; track += 1) {
    if (bytes[pos] !== 0x4d || bytes[pos + 1] !== 0x54 || bytes[pos + 2] !== 0x72 || bytes[pos + 3] !== 0x6b) {
      throw new Error("missing MTrk");
    }
    const length = (bytes[pos + 4] << 24) | (bytes[pos + 5] << 16) | (bytes[pos + 6] << 8) | bytes[pos + 7];
    let i = pos + 8;
    const end = i + length;
    let running = 0;
    let ons = 0;
    while (i < end) {
      let byte = 0;
      do {
        byte = bytes[i];
        i += 1;
      } while (byte & 0x80);
      let status = bytes[i];
      if (status < 0x80) status = running;
      else {
        running = status;
        i += 1;
      }
      if (status === 0xff) {
        i += 1;
        let size = 0;
        do {
          byte = bytes[i];
          i += 1;
          size = (size << 7) | (byte & 0x7f);
        } while (byte & 0x80);
        i += size;
      } else if ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0) i += 1;
      else {
        if ((status & 0xf0) === 0x90 && bytes[i + 1] > 0) ons += 1;
        i += 2;
      }
    }
    if (i !== end) throw new Error("track length mismatch");
    noteOns.push(ons);
    pos = end;
  }
  if (pos !== bytes.length) throw new Error("trailing midi bytes");
  return { division, tracks, noteOns };
}

try {
  const full = midiTracks(songToMidi(wide));
  const core = midiTracks(songToMidi(a));
  if (full.division !== 480) fail(`midi division ${full.division}`);
  if (full.tracks !== 9) fail(`octet midi has ${full.tracks} tracks`);
  if (core.tracks !== 6) fail(`core midi has ${core.tracks} tracks`);
  if (full.noteOns.slice(1).some((count) => count < 1)) fail(`midi track missing notes ${full.noteOns.join(",")}`);
  if (core.noteOns[0] !== 0) fail("tempo track should not contain notes");
  const raw = songToMidi(a);
  let sawVolume = false;
  let sawPan = false;
  for (let i = 0; i < raw.length - 2; i += 1) {
    if ((raw[i] & 0xf0) === 0xb0 && raw[i + 1] === 7) sawVolume = true;
    if ((raw[i] & 0xf0) === 0xb0 && raw[i + 1] === 10) sawPan = true;
  }
  if (!sawVolume || !sawPan) fail("midi is missing volume or pan controllers");
  if (!a.arrangement.tom?.length || !a.arrangement.crash?.length) fail("arrangement is missing toms or cymbals");
} catch (error) {
  fail(`midi parse: ${error.message}`);
}

const slowed = performSong(a, { ...draftFromSong(a), tempo: 90 });
if (slowed.tempo !== 90) fail(`edited tempo ${slowed.tempo}`);
if (slowed.title !== a.title) fail("edit changed the imagined title");
const slowedAgain = performSong(a, draftFromSong(slowed));
if (JSON.stringify(slowedAgain.arrangement.bass) !== JSON.stringify(slowed.arrangement.bass)) {
  fail("the same edit did not replay the same bass");
}
const lyricDraft = draftFromSong(a);
lyricDraft.sections.find((section) => section.lines.length).lines[0] = "A brand new imagined line";
const lyricSong = performSong(a, lyricDraft);
if (!lyricSong.structure.some((section) => section.lines[0] === "A brand new imagined line")) fail("lyric edit did not stick");
if (JSON.stringify(lyricSong.arrangement.lead) !== JSON.stringify(performSong(a, lyricDraft).arrangement.lead)) {
  fail("lyric edit changed the lead");
}
const chordDraft = draftFromSong(a);
const targetPc = (chordDraft.sections[0].chords[0].pc + 3) % 12;
chordDraft.sections[0].chords[0] = { pc: targetPc, quality: chordDraft.sections[0].chords[0].quality };
const retuned = performSong(a, chordDraft);
const heard = retuned.arrangement.chords[0]?.midis?.[0];
if (heard == null || ((heard % 12) + 12) % 12 !== targetPc) fail(`section chord did not reach the arrangement (${heard})`);
const editPacked = encodeShare(fixed, "k3m9qx", { edit: compactEdit(slowed, a) });
const editDecoded = decodeShare(editPacked);
if (!editDecoded.edit) fail("compact edit missing from share");
const editSong = performSong(generateSong(editDecoded.slots, editDecoded.seed), expandEdit(a, editDecoded.edit));
if (editSong.tempo !== 90) fail("shared edit did not restore tempo");
function noisyLine(index) {
  let value = index + 17;
  let text = "";
  for (let i = 0; i < 90; i += 1) {
    value = (Math.imul(value, 1103515245) + 12345) >>> 0;
    text += "abcdefghij"[value % 10];
  }
  return text;
}
const fat = {
  t: 100,
  S: Array.from({ length: 24 }, (_, index) => ({
    r: "v",
    b: 8,
    c: "0.maj,5.maj,7.maj,0.maj",
    l: [0, 1, 2, 3, 4, 5].map((line) => noisyLine(index * 6 + line)),
  })),
};
const fatPacked = encodeShare(fixed, "k3m9qx", { edit: fat });
const fatDecoded = decodeShare(fatPacked);
if (fatDecoded.edit || !fatDecoded.editHash) fail("overlong edit should fall back to a hash");
if (fatPacked.length > 2500) fail(`fallback link is still long (${fatPacked.length})`);
const medium = {
  t: 88,
  S: Array.from({ length: 8 }, (_, index) => ({
    r: index % 2 ? "c" : "v",
    b: 8,
    c: "2.min,7.maj,9.min,0.maj",
    l: [`Imagined line ${index}`, "Second line of the section", "Third line stays original", "Fourth line closes it"],
  })),
};
const mediumPacked = encodeShare(fixed, "k3m9qx", { edit: medium });
const mediumDecoded = decodeShare(mediumPacked);
if (!a.blend || !a.blend.endsWith(".")) fail("song sheet is missing the blend sentence");
const funkMetal = lineup({});
funkMetal.guitar = createCustomMusician({
  name: "Riff Guest",
  role: "guitar",
  genres: ["funk", "metal"],
  tempo: "medium",
  feel: "straight",
  densityId: "busy",
  weightId: "heavy",
  tone: "driven",
});
funkMetal.drums = createCustomMusician({
  name: "Pocket Guest",
  role: "drums",
  genres: ["metal", "funk"],
  tempo: "medium",
  feel: "straight",
  densityId: "busy",
  weightId: "heavy",
  tone: "driven",
});
const hybrid = generateSong(funkMetal, "fmblend");
if (hybrid.style.groove !== "sync-heavy") fail(`funk-metal groove ${hybrid.style.groove}`);
if (!hybrid.blend.toLowerCase().includes("funk") || !hybrid.blend.toLowerCase().includes("metal")) {
  fail(`blend sentence missed a genre: ${hybrid.blend}`);
}
const chorus = hybrid.structure.find((section) => section.role === "chorus");
const chorusKicks = hybrid.arrangement.kick.filter((event) => event.step >= chorus.startStep && event.step < chorus.startStep + hybrid.arrangement.sixteenthsPerBar);
if (!chorusKicks.some((event) => (event.step - chorus.startStep) % 16 === 6)) fail("funk-metal chorus lost the syncopated kick");
if (chorusKicks.length < 4) fail(`funk-metal chorus is not heavy enough (${chorusKicks.length} kicks)`);
const reggaeSlots = lineup({});
reggaeSlots.bass = createCustomMusician({
  name: "Drop Guest",
  role: "bass",
  genres: ["reggae"],
  tempo: "slow",
  feel: "straight",
  densityId: "sparse",
  weightId: "medium",
  tone: "warm",
});
reggaeSlots.guitar = createCustomMusician({
  name: "Skank Guest",
  role: "guitar",
  genres: ["reggae"],
  tempo: "slow",
  feel: "straight",
  densityId: "sparse",
  weightId: "light",
  tone: "clean",
});
const reggaeSong = generateSong(reggaeSlots, "onedrop");
if (reggaeSong.style.groove !== "one-drop" || reggaeSong.style.comp !== "skank") {
  fail(`reggae profile ${reggaeSong.style.groove}/${reggaeSong.style.comp}`);
}
const reggaeBar = reggaeSong.arrangement.bass.filter((event) => event.step < reggaeSong.arrangement.sixteenthsPerBar);
if (reggaeBar.some((event) => event.step === 0)) fail("reggae bass landed on the downbeat");
const skank = reggaeSong.arrangement.chords.filter((event) => event.step < reggaeSong.arrangement.sixteenthsPerBar);
if (!skank.length || skank.some((event) => event.step % 4 === 0)) fail("reggae chords are not an offbeat skank");
const profileIds = ["rock", "funk", "soul", "r&b", "jazz", "metal", "punk", "pop", "hip-hop", "country", "blues", "reggae"];
for (const id of profileIds) {
  const profile = styleFor([id]);
  if (!profile.groove || !profile.bass || !profile.comp || !profile.sentence) fail(`profile ${id} is incomplete`);
}

if (mediumDecoded.edit?.t !== 88) fail("medium edit did not round-trip");
if (!mediumDecoded.edit.S || mediumDecoded.edit.S.length !== 8) fail("medium edit dropped sections");

const album = planAlbum(fixed, "k3m9qx");
const albumAgain = planAlbum(fixed, "k3m9qx");
if (album.tracks.length < 3 || album.tracks.length > 6) fail(`album has ${album.tracks.length} tracks`);
if (album.tracks.map((track) => track.title).join("|") !== albumAgain.tracks.map((track) => track.title).join("|")) {
  fail("album seeds were not deterministic");
}
if (album.tracks[0].seed !== "k3m9qx") fail("album should open with the band seed");
const bio = imaginedBio(album);
if (!bio.startsWith("Imagined bio")) fail("band bio is not labeled as imagined");
if (!bio.includes(album.bandName)) fail("band bio is missing the band name");
const packed = zipStore([
  { name: "notes.txt", data: new TextEncoder().encode("imagined") },
  { name: "second.txt", data: new TextEncoder().encode("room") },
]);
if (packed[0] !== 0x50 || packed[1] !== 0x4b) fail("zip is missing its header");
const zipText = new TextDecoder().decode(packed);
if (!zipText.includes("notes.txt") || !zipText.includes("imagined") || !zipText.includes("second.txt")) {
  fail("zip is missing a stored file");
}

const newcomers = [
  { id: "fred-durst", roles: ["singer"], genres: ["metal", "hip-hop", "rock"] },
  { id: "jimmy-chamberlin", roles: ["drums"], genres: ["rock"] },
  { id: "bono", roles: ["singer"], genres: ["rock"] },
  { id: "david-lee-roth", roles: ["singer"], genres: ["rock"] },
  { id: "joe-jonas", roles: ["singer"], genres: ["pop"] },
  { id: "billy-corgan", roles: ["singer", "guitar"], genres: ["rock"] },
  { id: "danny-carey", roles: ["drums"], genres: ["metal", "prog"] },
  { id: "the-edge", roles: ["guitar"], genres: ["rock"] },
  { id: "tom-scholz", roles: ["guitar", "keys"], genres: ["rock"] },
  { id: "tom-petty", roles: ["singer", "guitar"], genres: ["rock"] },
  { id: "brad-delp", roles: ["singer"], genres: ["rock"] },
  { id: "wes-borland", roles: ["guitar"], genres: ["metal", "rock"] },
  { id: "joe-satriani", roles: ["guitar"], genres: ["rock"] },
  { id: "chuck-mangione", roles: ["horns"], genres: ["jazz"] },
];
for (const spec of newcomers) {
  const person = MUSICIANS.find((item) => item.id === spec.id);
  if (!person) {
    fail(`missing ${spec.id}`);
    continue;
  }
  if (person.roles.join(",") !== spec.roles.join(",")) fail(`${spec.id} roles ${person.roles}`);
  if (person.genres.join(",") !== spec.genres.join(",")) fail(`${spec.id} genres ${person.genres}`);
  for (const role of person.roles) {
    const slots = {
      singer: null, guitar: null, bass: null, drums: null, keys: null, horns: null, dj: null, strings: null,
    };
    slots[role] = person;
    const partnerRole = role === "drums" ? "singer" : "drums";
    slots[partnerRole] = MUSICIANS.find((item) => item.id === (partnerRole === "singer" ? "dolly-parton" : "ringo-starr"));
    const song = generateSong(slots, `new-${spec.id}-${role}`);
    const seated = song.roster.find((entry) => entry.role === role);
    if (!seated || seated.name !== person.name) fail(`${person.name} was not seated on ${role}`);
    if (!song.notes.some((note) => note.name === person.name)) fail(`${person.name} missing a liner note`);
    if (song.arrangement.duration < 119 || song.arrangement.duration > 241) {
      fail(`${person.name} on ${role} duration ${song.arrangement.duration.toFixed(1)}`);
    }
    if (!song.arrangement.kick.length || !song.arrangement.lead.length || !song.arrangement.chords.length) {
      fail(`${person.name} on ${role} did not generate a playable arrangement`);
    }
    if (role === "horns" && !song.arrangement.horns.length) fail(`${person.name} horns did not play`);
    if (role === "keys" && !song.arrangement.chords.length) fail(`${person.name} keys did not play`);
  }
}

const progMetal = lineup({ guitar: "tony-iommi", drums: "danny-carey" });
let oddMeters = 0;
for (let n = 0; n < 24; n += 1) {
  const song = generateSong(progMetal, `progmetal${n}`);
  if (song.bank !== "metal") fail(`progressive metal bank was ${song.bank}`);
  if (!song.genres.includes("prog") || !song.genres.includes("metal")) fail(`progressive metal genres ${song.genres}`);
  if (song.timeSignature === "7/8") {
    oddMeters += 1;
    if (song.arrangement.duration < 119 || song.arrangement.duration > 241) {
      fail(`odd-meter duration ${song.arrangement.duration.toFixed(1)}`);
    }
    if (!song.arrangement.kick.length) fail("odd-meter drums were empty");
  }
}
if (!oddMeters) fail("progressive metal lineup never used 7/8");

const classicShare = "eyJ2IjoxLCJzZWVkIjoidXl1YXJ6Iiwic2xvdHMiOnsic2luZ2VyIjp7ImlkIjoiYXJldGhhLWZyYW5rbGluIn0sImd1aXRhciI6eyJpZCI6Im5pbGUtcm9kZ2VycyJ9LCJiYXNzIjp7ImlkIjoiYm9vdHN5LWNvbGxpbnMifSwiZHJ1bXMiOnsiaWQiOiJxdWVzdGxvdmUifX19";
const classic = decodeShare(classicShare);
if (classic.slots.singer?.name !== "Aretha Franklin" || classic.slots.guitar?.name !== "Nile Rodgers") {
  fail("an older share link no longer restored its musicians");
}
if (classic.slots.bass?.id !== "bootsy-collins" || classic.slots.drums?.id !== "questlove") {
  fail("an older share link changed a musician id");
}

if (TRANSITION_MS < 2000 || TRANSITION_MS > 5000) fail(`transition is ${TRANSITION_MS}ms`);
if (nextTrack(0, 4) !== 1 || nextTrack(2, 3) !== null || nextTrack(3, 4) !== null) fail("live set order");
if (liveKicker(false) !== "Now playing" || liveKicker(true) !== "Between songs") fail("live set label");

const before = JSON.stringify(fixed);
const ideas = suggestLineup(fixed, MUSICIANS, 4);
if (JSON.stringify(fixed) !== before) fail("suggestions changed the lineup");
if (!ideas.length) fail("expected suggestions for an open chair");
const seatedIds = new Set(Object.values(fixed).filter(Boolean).map((person) => person.id));
ideas.forEach((idea) => {
  if (seatedIds.has(idea.id)) fail(`suggested ${idea.name}, who is already seated`);
  if (fixed[idea.role]) fail(`suggested the filled ${idea.role} chair`);
  if (!idea.reason || idea.reason.includes("\n")) fail(`suggestion reason was not one line: ${idea.reason}`);
  const person = MUSICIANS.find((item) => item.id === idea.id);
  if (!person?.roles.includes(idea.role)) fail(`${idea.name} was suggested for ${idea.role}`);
});
const ideasAgain = suggestLineup(fixed, MUSICIANS, 4);
if (ideas.map((idea) => idea.id).join() !== ideasAgain.map((idea) => idea.id).join()) fail("suggestions were not deterministic");
const starters = suggestLineup(lineup({}), MUSICIANS, 4);
if (starters.length !== 4) fail(`empty lineup returned ${starters.length} suggestions`);
const full = lineup({
  singer: "aretha-franklin",
  guitar: "nile-rodgers",
  bass: "james-jamerson",
  drums: "clyde-stubblefield",
  keys: "stevie-wonder",
});
full.horns = MUSICIANS.find((person) => person.id === "miles-davis");
full.dj = MUSICIANS.find((person) => person.id === "j-dilla");
full.strings = MUSICIANS.find((person) => person.id === "yo-yo-ma");
if (suggestLineup(full, MUSICIANS, 4).length !== 0) fail("a full lineup was still offered a chair");
const heavy = suggestLineup(lineup({ guitar: "tony-iommi", bass: "cliff-burton" }), MUSICIANS, 4);
const drumIdea = heavy.find((idea) => idea.role === "drums");
if (!drumIdea || !drumIdea.reason.toLowerCase().includes("metal")) fail(`metal lineup suggestion was ${drumIdea?.reason}`);

const versionOrigin = generateSong(fixed, "k3m9qx");
const slowerSong = performSong(versionOrigin, { ...draftFromSong(versionOrigin), tempo: 90 });
const fasterDraft = draftFromSong(versionOrigin);
fasterDraft.tempo = 140;
fasterDraft.timeSignature = "7/8";
const fasterSong = performSong(versionOrigin, fasterDraft);
const slowerEdit = compactEdit(slowerSong, versionOrigin);
const fasterEdit = compactEdit(fasterSong, versionOrigin);
const vkey = versionKey(versionOrigin.signature, versionOrigin.seed);
let versionStore = saveVersion({}, vkey, "Slower", slowerEdit).store;
versionStore = saveVersion(versionStore, vkey, "Slower", slowerEdit).store;
if (listVersions(versionStore, vkey).length !== 1) fail("a version name did not replace the older copy");
versionStore = saveVersion(versionStore, vkey, "Faster", fasterEdit).store;
if (listVersions(versionStore, vkey).map((item) => item.name).join(",") !== "Faster,Slower") fail("versions were not listed newest first");
const compared = compareDrafts(expandEdit(versionOrigin, slowerEdit), expandEdit(versionOrigin, fasterEdit));
const tempoRow = compared.find((row) => row.label === "Tempo");
const meterRow = compared.find((row) => row.label === "Meter");
if (!tempoRow || tempoRow.same || tempoRow.left !== "90 BPM" || tempoRow.right !== "140 BPM") fail("version compare missed the tempo");
if (!meterRow || meterRow.same) fail("version compare missed the meter");
if (compared.some((row) => row.label.includes("\n"))) fail("version compare was not one line per row");
versionStore = forgetVersion(versionStore, vkey, listVersions(versionStore, vkey)[0].id);
if (listVersions(versionStore, vkey).some((item) => item.name === "Faster")) fail("version was not removed");
const named = encodeShare(fixed, "k3m9qx", { edit: slowerEdit, versionName: "Slower" });
const namedDecoded = decodeShare(named);
if (namedDecoded.versionName !== "Slower" || namedDecoded.edit?.t !== 90) fail("a shared version did not keep its name and edit");
const played = performSong(versionOrigin, expandEdit(versionOrigin, namedDecoded.edit));
if (played.tempo !== 90) fail("a shared version did not play back at its tempo");
if (decodeShare(encodeShare(fixed, "k3m9qx")).versionName) fail("an edit-free share grew a version name");
let crowded = {};
for (let n = 0; n < 14; n += 1) crowded = saveVersion(crowded, vkey, `Take ${n}`, slowerEdit).store;
if (listVersions(crowded, vkey).length !== 12) fail("version list did not cap at 12");

const samples = featuredBands();
const samplesAgain = featuredBands();
if (samples.length < 4) fail(`expected sample bands, found ${samples.length}`);
samples.forEach((card, index) => {
  if (!card.album?.bandName || card.album.tracks.length < 3 || card.album.tracks.length > 6) {
    fail(`sample ${card.id} is not an album`);
  }
  if (card.album.bandName !== samplesAgain[index].album.bandName || card.album.albumTitle !== samplesAgain[index].album.albumTitle) {
    fail(`sample ${card.id} was not deterministic`);
  }
  const restored = decodeShare(card.encoded);
  if (restored.seed !== card.album.seed) fail(`sample ${card.id} seed changed`);
  const again = planAlbum(restored.slots, restored.seed);
  if (again.bandName !== card.album.bandName || again.tracks[0].title !== card.album.tracks[0].title) {
    fail(`sample ${card.id} link did not restore the band`);
  }
});
let savedBands = rememberBand([], {
  bandName: samples[0].album.bandName,
  albumTitle: samples[0].album.albumTitle,
  encoded: samples[0].encoded,
  savedAt: 1,
});
savedBands = rememberBand(savedBands, {
  bandName: "Other Room",
  albumTitle: "Paper",
  encoded: "other-band",
  savedAt: 2,
});
savedBands = rememberBand(savedBands, {
  bandName: samples[0].album.bandName,
  albumTitle: samples[0].album.albumTitle,
  encoded: samples[0].encoded,
  savedAt: 3,
});
if (savedBands.length !== 2 || savedBands[0].encoded !== samples[0].encoded) fail("My bands did not keep a single copy");
savedBands = forgetBand(savedBands, samples[0].encoded);
if (savedBands.some((item) => item.encoded === samples[0].encoded)) fail("saved band was not removed");
let capped = [];
for (let n = 0; n < 40; n += 1) {
  capped = rememberBand(capped, { bandName: `Band ${n}`, albumTitle: "Album", encoded: `enc${n}`, savedAt: n });
}
if (capped.length !== BAND_LIMIT) fail(`My bands kept ${capped.length}`);

const stems = stemList(a.mixer);
if (!stems.some((stem) => stem.id === "lead" && stem.label === "Lead")) fail("song parts missed the lead");
if (!stems.some((stem) => stem.id === "drums")) fail("song parts missed the drums");
const bassOnly = mixerForStem(a.mixer, "bass");
if (bassOnly.channels.bass.mute || bassOnly.channels.bass.solo) fail("the bass part was not left open");
if (Object.entries(bassOnly.channels).some(([id, channel]) => id !== "bass" && !channel.mute)) fail("a song part did not mute the others");
if (a.mixer.channels.bass.mute) fail("isolating a part changed the song mix");
const duoSong = generateSong(lineup({ singer: "aretha-franklin", guitar: "nile-rodgers" }), "parts1");
const duoStems = stemList(duoSong.mixer);
if (!duoStems.some((stem) => stem.id === "backing")) fail("empty chairs did not keep a backing part");

function rngFrom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
const rivalA = rivalLineup(fixed, MUSICIANS, rngFrom(9));
const rivalB = rivalLineup(fixed, MUSICIANS, rngFrom(9));
if (fixed.singer.id !== "aretha-franklin") fail("a rivalry mutated the home lineup");
ROLE_IDS.forEach((role) => {
  const home = fixed[role];
  const away = rivalA[role];
  if (Boolean(home) !== Boolean(away)) fail(`rival chair ${role} did not match`);
  if (home && away.id === home.id) fail(`rival kept ${home.name}`);
  if (rivalB[role]?.id !== away?.id) fail("rival lineup was not deterministic");
});
const homeSong = generateSong(fixed, "k3m9qx");
const awaySong = generateSong(rivalA, "rival1");
const call = battleCall(homeSong, awaySong);
if (call.home !== roomScore(homeSong) || call.away < 0 || call.away > 100) fail("room score was out of range");
if (!["home", "away", "even"].includes(call.call)) fail("battle call was missing");
const battleDecoded = decodeBattle(encodeBattle(homeSong, awaySong));
const battleAgain = battleSongs(battleDecoded.home.slots, battleDecoded.home.seed, battleDecoded.away.slots, battleDecoded.away.seed);
if (battleAgain.home.title !== homeSong.title || battleAgain.away.title !== awaySong.title) fail("rivalry link did not restore both songs");
if (battleAgain.home.roster.map((entry) => entry.name).join("|") !== homeSong.roster.map((entry) => entry.name).join("|")) {
  fail("rivalry link changed the home musicians");
}

const plannedAlbum = buildAlbum(fixed, "k3m9qx");
const plannedDirect = planAlbum(fixed, "k3m9qx");
if (plannedAlbum.custom || albumPayload(plannedAlbum)) fail("an untouched album was treated as edited");
if (plannedAlbum.albumTitle !== plannedDirect.albumTitle || plannedAlbum.tracks.map((track) => track.seed).join() !== plannedDirect.tracks.map((track) => track.seed).join()) {
  fail("the default album no longer matches the planned one");
}
if (decodeShare(encodeShare(fixed, "k3m9qx")).album) fail("a song share grew an album");
const renamedAlbum = renameAlbum(plannedAlbum, "  Paper <Room>  ");
if (renamedAlbum.albumTitle !== "Paper Room" || renamedAlbum.bandName !== plannedAlbum.bandName || !renamedAlbum.custom) fail("album rename failed");
const movedAlbum = moveTrack(renamedAlbum, 0, 1);
if (movedAlbum.tracks[1].seed !== renamedAlbum.tracks[0].seed || movedAlbum.tracks[0].seed !== renamedAlbum.tracks[1].seed) fail("album move failed");
const shorterAlbum = removeTrack(movedAlbum, 0);
if (shorterAlbum.tracks.length !== movedAlbum.tracks.length - 1) fail("album track was not removed");
if (removeTrack({ ...shorterAlbum, tracks: [shorterAlbum.tracks[0]] }, 0).tracks.length !== 1) fail("the last album track was removed");
let n = 0;
const extraSeed = freshTrackSeed(shorterAlbum, () => {
  n += 1;
  return ((n * 17) % 97) / 97;
});
const longerAlbum = addTrack(shorterAlbum, generateSong(fixed, extraSeed));
if (!longerAlbum.tracks.some((track) => track.seed === extraSeed)) fail("album track was not added");
if (addTrack(longerAlbum, longerAlbum.tracks[0]).tracks.length !== longerAlbum.tracks.length) fail("a duplicate track was added");
let cappedAlbum = plannedAlbum;
for (let i = 0; i < 12; i += 1) {
  const seed = freshTrackSeed(cappedAlbum, () => {
    n += 1;
    return ((n * 13) % 89) / 89;
  });
  if (seed) cappedAlbum = addTrack(cappedAlbum, generateSong(fixed, seed));
}
if (cappedAlbum.tracks.length !== 8) fail(`album cap was ${cappedAlbum.tracks.length}`);
const albumPacked = encodeShare(fixed, plannedAlbum.seed, { album: albumPayload(renamedAlbum) });
const albumDecoded = decodeShare(albumPacked);
const albumRestored = buildAlbum(albumDecoded.slots, albumDecoded.seed, albumDecoded.album);
if (albumDecoded.slots.singer?.id !== "aretha-franklin" || albumRestored.albumTitle !== "Paper Room") fail("album share lost the lineup or title");
if (albumRestored.tracks.map((track) => track.title).join("|") !== renamedAlbum.tracks.map((track) => track.title).join("|")) {
  fail("album share did not restore the tracklist");
}
if (renameAlbum(renamedAlbum, plannedAlbum.albumTitle).custom) fail("restoring the original title left the album edited");
const classicAlbum = buildAlbum(classic.slots, classic.seed, classic.album);
const classicPlan = planAlbum(classic.slots, classic.seed);
if (classic.album || classicAlbum.bandName !== classicPlan.bandName || classicAlbum.tracks[0].title !== classicPlan.tracks[0].title) {
  fail("an old share no longer opens the same album");
}
const messyAlbum = buildAlbum(fixed, "k3m9qx", { at: "Room", tr: ["nope!", "abc123", "abc123", "zzzzzz"] });
if (messyAlbum.albumTitle !== "Room" || messyAlbum.tracks.map((track) => track.seed).join() !== "abc123,zzzzzz") {
  fail("album codes kept a bad or repeated seed");
}

const sheet = lyricBlocks(a);
const sung = sheet.filter((block) => block.lines.length);
if (sheet.length < 4) fail(`lyric sheet had ${sheet.length} sections`);
if (sung.length < 3) fail("lyric sheet dropped the original lines");
if (sung.some((block) => !block.chords)) fail("a lyric section lost its chords");
const sheetText = lyricText(a);
if (!sheetText.startsWith(a.title) || !sheetText.includes(a.bandName) || !sheetText.includes("not taken from a real song")) {
  fail("lyric sheet text missed the song or the disclaimer");
}
if (sheetText !== lyricText(b)) fail("lyric sheet was not deterministic");
if (sheet.some((block) => block.lines.join(" ").includes("\n"))) fail("a lyric line broke the sheet");

const quietVideo = energiesFromBins(new Uint8Array(32));
if (quietVideo.low !== 0 || quietVideo.mid !== 0 || quietVideo.high !== 0 || quietVideo.bars.length !== 16) {
  fail("a silent spectrum was not quiet");
}
const loudVideo = energiesFromBins(new Uint8Array(32).fill(255));
if (Math.abs(loudVideo.low - 1) > 0.001 || loudVideo.bars.some((bar) => Math.abs(bar - 1) > 0.001)) {
  fail("a full spectrum did not fill the video");
}
const still = videoModel({ genres: ["soul"], sectionIndex: 0, time: 2, bins: null });
const nextScene = videoModel({ genres: ["soul"], sectionIndex: 4, time: 2, bins: null });
if (still.spin === nextScene.spin || still.palette[0] === "#ffffff") fail("the video did not follow the section");
if (still.energy.bars.length !== 16) fail("the video lost its bars");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`ok ${MUSICIANS.length} musicians, deterministic song "${a.title}" by ${a.bandName} at ${a.tempo} BPM`);
