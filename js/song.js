import { arrangeFull, bridgePattern, planSections } from "./arrange.js";
import { applyCompactMix, compactMixer, defaultMixer } from "./mixer.js";
import {
  GENRE_LABEL,
  ROLE_IDS,
  createCustomMusician,
  getMusician,
  roleLabel,
} from "./musicians.js";

const BAND_NAMES = [
  "Paper Assembly",
  "North Lantern",
  "Glass Relay",
  "Kind Weather",
  "Salt Avenue",
  "Inner Orchard",
  "Low Fountain",
  "Morning Circuit",
  "Quiet Cabinet",
  "Honey Signal",
  "Copper Library",
  "Neon Witness",
  "Dust Parade",
  "Willow Mirror",
  "Amber Garden",
  "Rapid Fountain",
  "Satin Relay",
  "Moon Department",
  "Pocket Lantern",
  "Silver Weather",
  "Open Cabinet",
  "Night Orchard",
  "Sugar Avenue",
  "Broken Signal",
  "Highway Library",
  "Velvet Circuit",
  "Little Mirror",
  "Red Weather",
  "Wild Relay",
  "Static Garden",
  "Golden Cabinet",
  "Blue Assembly",
  "Wire Orchard",
  "Slow Fountain",
  "After Lantern",
  "Inner Parade",
  "Glass Department",
  "Salt Witness",
  "Morning Library",
  "Copper Signal",
  "Neon Garden",
  "Quiet Avenue",
  "Honey Mirror",
  "Dust Circuit",
  "Willow Cabinet",
  "Amber Relay",
  "Rapid Orchard",
  "Satin Fountain",
  "Moon Assembly",
  "Pocket Weather",
  "Silver Parade",
  "Open Lantern",
  "Night Library",
  "Sugar Cabinet",
  "Kind Relay",
  "Low Signal",
  "North Mirror",
  "Paper Witness",
  "Wild Garden",
  "Static Avenue",
  "Golden Orchard",
  "Blue Fountain",
  "Wire Department",
  "Slow Circuit",
];

const TITLES = [
  "Lantern Weather",
  "Maps for the Quiet",
  "Gravel Hours",
  "A Window in the Signal",
  "Marigold Engines",
  "Letters after Midnight",
  "Carbon Voices",
  "The Slow Frequency",
  "Harbor Maps",
  "Clock in the Orchard",
  "Satellite Rooms",
  "Velvet Frequencies",
  "Thunder Letters",
  "Mirror Hours",
  "Paper Bridges",
  "Static Gardens",
  "Honey on the Dashboard",
  "Wire and Weather",
  "Northbound Quiet",
  "Salt on the Downbeat",
  "Inner Lights",
  "A Borrowed Streetlight",
  "Evening Arithmetic",
  "Soft Alarms",
  "The Room Kept Time",
  "Glovebox Constellation",
  "Second Opinion",
  "Porch Light Theory",
  "Low End Arrival",
  "Diner Minute",
  "Exit Count",
  "Jacket Weather",
  "One Light Left",
  "Honest Floorboards",
  "Cracked Window Hymn",
  "Brighter on the Turn",
  "Signal Coming Around",
  "Lock on the Door",
  "Lights Settle Down",
  "Saved for the Chorus",
  "Lean Toward the Light",
  "Echo Landing",
  "Play Through the Break",
  "Heart and Drum",
  "Room Tone",
  "Night Bus",
  "Folded Map",
  "Amplifier Hymn",
  "River Radio",
  "Stairwell Match",
  "Missing Minute",
  "Shape of the Room",
  "Stay for Another",
  "Shoes by the Door",
  "Streetlight Name",
  "Radios in the Quiet",
  "Edges for the Quiet",
  "Ceiling Fan Answer",
  "Morning in the Car",
  "Doorway Dark",
  "The Part We Remember",
  "Borrowed Jacket",
  "Skyline Blink",
  "Last Bus Home",
];

const LYRICS = {
  night: {
    verse: [
      "We left the porch light burning over the gravel",
      "The room kept the shape of the last conversation",
      "You tapped the window in time with the weather",
      "I wrote your name where the streetlight could find it",
      "The river was loud and the radios were quiet",
      "We counted the exits and stayed for another",
      "Your shoes by the door knew the way without asking",
      "The clock on the diner was missing its minute",
      "A match in the stairwell was all of the color",
      "The map in the glovebox was folded on purpose",
      "We stood in the doorway and borrowed the dark",
      "The last bus sighed and decided to stay",
    ],
    hook: [
      "Stay for the part where the lights settle down",
      "The night has room for another line",
      "Leave a space where the echo can land",
      "We are still in the room",
    ],
    chorus: [
      "Keep the window cracked for the weather",
      "Say it once and let it carry",
      "Soft on the edges, sure in the middle",
      "This is the sound we were saving",
      "Turn it over, let it ring",
      "Again, a little quieter",
      "Call across the room and wait",
      "Hold the last word in the air",
    ],
  },
  bright: {
    verse: [
      "The morning put a shine on the kitchen table",
      "We took the long way just to see the water",
      "Your laugh arrived before you reached the chorus",
      "The radio preferred the windows down",
      "We split an orange and a bright idea",
      "The highway drew a clean line through the day",
      "You hummed the hook before the verse was finished",
      "Sun on the dashboard, dust in the melody",
      "We waved at a train that did not slow",
      "The bridge was mostly sky and a good tempo",
      "I kept the easy part and gave you the lift",
      "Every green light felt like a downbeat",
    ],
    hook: [
      "Brighter on the turn, brighter on the turn",
      "We can sing it plain and let it glow",
      "Open the door, the day fits",
      "This hook was made for daylight",
    ],
    chorus: [
      "Everybody lean toward the light",
      "Keep it simple, keep it kind",
      "Hands on the wheel, hearts in the chorus",
      "Let the high note find the room",
      "We are early and that is fine",
      "Say the sunny line again",
      "A little gold along the edge",
      "Dance it once around the table",
    ],
  },
  groove: {
    verse: [
      "The kick said one and the room agreed",
      "You stepped in late and landed early",
      "Hips found the pocket before the words did",
      "We left a rest where the snare could answer",
      "The bass drew a circle and we stood inside it",
      "Lights low, hats bright, nobody rushing",
      "You clapped the and-of-two like a secret",
      "The floor kept better time than the clock",
      "A chord stabbed once and the night leaned in",
      "We tuned the silence between the hits",
      "Your shoulder found the backbeat and stayed",
      "The groove was small and it held everybody",
    ],
    hook: [
      "Bring it back to the one",
      "Stay in the pocket, stay in the pocket",
      "Let the space do the talking",
      "On the one, we move",
    ],
    chorus: [
      "Lock it in and leave it loose",
      "Call and response, heart and drum",
      "Don't fill the bar, feel the bar",
      "We are louder in the gaps",
      "Step, then wait, then step",
      "The hook is just the pocket talking",
      "Keep your hands inside the rhythm",
      "Again, right on the one",
    ],
  },
  heavy: {
    verse: [
      "The wall took the hit and gave it back",
      "We kept the riff and let the rest fall quiet",
      "Iron in the doorway, soft in the throat",
      "Turn the lamp down and leave the low end on",
      "A long note held against the dark",
      "Boots on the stair, then the room exhaled",
      "We did not rush the heavy part",
      "Static on the line, steady in the chest",
      "The chorus arrived in one heavy color",
      "Say less, hit the downbeat, stay",
      "Gravel in the tone, gold in the harmony",
      "We leaned into the loud and kept it honest",
    ],
    hook: [
      "Hit it once and let it ring",
      "We stay for the heavy light",
      "Low and sure, low and sure",
      "Leave the amp in the room",
    ],
    chorus: [
      "If it breaks, we play through",
      "Hold the low note, trust the crash",
      "One color, all the way",
      "We can be heavy and still be clear",
      "Stand in it, don't decorate it",
      "The riff comes back unchanged",
      "Breathe, then the downbeat",
      "Quiet hands, loud truth",
    ],
  },
};

const SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

const MAJOR_KEYS = [
  { name: "C", pc: 0, spell: "sharp" },
  { name: "G", pc: 7, spell: "sharp" },
  { name: "D", pc: 2, spell: "sharp" },
  { name: "A", pc: 9, spell: "sharp" },
  { name: "F", pc: 5, spell: "flat" },
  { name: "B♭", pc: 10, spell: "flat" },
  { name: "E♭", pc: 3, spell: "flat" },
];

const MINOR_KEYS = [
  { name: "A", pc: 9, spell: "sharp" },
  { name: "E", pc: 4, spell: "sharp" },
  { name: "D", pc: 2, spell: "flat" },
  { name: "B", pc: 11, spell: "sharp" },
  { name: "F♯", pc: 6, spell: "sharp" },
  { name: "C", pc: 0, spell: "flat" },
  { name: "G", pc: 7, spell: "flat" },
];

const BANKS = {
  pop: {
    major: [
      [c(0, "maj"), c(7, "maj"), c(9, "min"), c(5, "maj")],
      [c(0, "maj"), c(9, "min"), c(5, "maj"), c(7, "maj")],
    ],
    minor: [
      [c(0, "min"), c(8, "maj"), c(3, "maj"), c(10, "maj")],
      [c(0, "min"), c(10, "maj"), c(5, "min"), c(7, "min")],
    ],
  },
  rock: {
    major: [
      [c(0, "maj"), c(10, "maj"), c(5, "maj"), c(0, "maj")],
      [c(0, "maj"), c(5, "maj"), c(7, "maj"), c(5, "maj")],
    ],
    minor: [
      [c(0, "min"), c(10, "maj"), c(8, "maj"), c(10, "maj")],
      [c(0, "min"), c(5, "min"), c(0, "min"), c(7, "maj")],
    ],
  },
  soul: {
    major: [
      [c(0, "maj7"), c(9, "min7"), c(2, "min7"), c(7, "dom7")],
      [c(0, "dom7"), c(5, "dom7"), c(0, "dom7"), c(7, "dom7")],
    ],
    minor: [
      [c(0, "min7"), c(5, "min7"), c(10, "dom7"), c(0, "min7")],
      [c(0, "min7"), c(3, "maj7"), c(8, "maj7"), c(7, "dom7")],
    ],
  },
  jazz: {
    major: [
      [c(2, "min7"), c(7, "dom7"), c(0, "maj7"), c(9, "min7")],
      [c(0, "maj7"), c(9, "min7"), c(2, "min7"), c(7, "dom7")],
    ],
    minor: [
      [c(0, "min7"), c(5, "min7"), c(10, "dom7"), c(0, "min7")],
      [c(0, "min7"), c(3, "maj7"), c(8, "dom7"), c(7, "dom7")],
    ],
  },
  funk: {
    major: [
      [c(0, "dom7"), c(0, "dom7"), c(5, "dom7"), c(0, "dom7")],
      [c(0, "dom7"), c(10, "dom7"), c(0, "dom7"), c(5, "dom7")],
    ],
    minor: [
      [c(0, "min7"), c(0, "min7"), c(5, "dom7"), c(0, "min7")],
      [c(0, "min7"), c(10, "dom7"), c(0, "min7"), c(5, "dom7")],
    ],
  },
  metal: {
    major: [
      [c(0, "min"), c(10, "maj"), c(8, "maj"), c(10, "maj")],
      [c(0, "min"), c(8, "maj"), c(3, "maj"), c(10, "maj")],
    ],
    minor: [
      [c(0, "min"), c(10, "maj"), c(8, "maj"), c(10, "maj")],
      [c(0, "min"), c(8, "maj"), c(3, "maj"), c(10, "maj")],
    ],
  },
  hiphop: {
    major: [
      [c(0, "min7"), c(10, "maj7"), c(8, "maj7"), c(10, "maj7")],
      [c(0, "min"), c(0, "min"), c(10, "maj"), c(5, "min")],
    ],
    minor: [
      [c(0, "min7"), c(10, "maj7"), c(8, "maj7"), c(10, "maj7")],
      [c(0, "min"), c(5, "min"), c(8, "maj"), c(7, "min")],
    ],
  },
  country: {
    major: [
      [c(0, "maj"), c(5, "maj"), c(7, "maj"), c(0, "maj")],
      [c(0, "maj"), c(7, "maj"), c(9, "min"), c(5, "maj")],
    ],
    minor: [
      [c(0, "min"), c(5, "min"), c(7, "maj"), c(0, "min")],
      [c(0, "min"), c(3, "maj"), c(7, "maj"), c(0, "min")],
    ],
  },
  punk: {
    major: [
      [c(0, "maj"), c(5, "maj"), c(7, "maj"), c(7, "maj")],
      [c(0, "maj"), c(10, "maj"), c(5, "maj"), c(0, "maj")],
    ],
    minor: [
      [c(0, "min"), c(5, "min"), c(7, "maj"), c(0, "min")],
      [c(0, "min"), c(10, "maj"), c(5, "min"), c(0, "min")],
    ],
  },
  blues: {
    major: [
      [
        c(0, "dom7"), c(0, "dom7"), c(0, "dom7"), c(0, "dom7"),
        c(5, "dom7"), c(5, "dom7"), c(0, "dom7"), c(0, "dom7"),
        c(7, "dom7"), c(5, "dom7"), c(0, "dom7"), c(7, "dom7"),
      ],
    ],
    minor: [
      [
        c(0, "min7"), c(0, "min7"), c(0, "min7"), c(0, "min7"),
        c(5, "min7"), c(5, "min7"), c(0, "min7"), c(0, "min7"),
        c(8, "dom7"), c(7, "dom7"), c(0, "min7"), c(7, "dom7"),
      ],
    ],
  },
};

const BANK_OF = {
  rock: "rock",
  pop: "pop",
  soul: "soul",
  "r&b": "soul",
  jazz: "jazz",
  funk: "funk",
  metal: "metal",
  "hip-hop": "hiphop",
  country: "country",
  punk: "punk",
  blues: "blues",
  disco: "funk",
  folk: "country",
  prog: "rock",
  latin: "funk",
  electronic: "hiphop",
  classical: "jazz",
};

function c(off, quality) {
  return { off, quality };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function slotSignature(slots) {
  return ROLE_IDS.map((role) => {
    const person = slots?.[role];
    if (!person) return `${role}:`;
    if (person.custom) {
      return [
        role,
        "c",
        person.name,
        person.genres.join("+"),
        person.tempoMin,
        person.tempoMax,
        person.swing.toFixed(2),
        person.density.toFixed(2),
        person.weight.toFixed(2),
        person.brightness.toFixed(2),
        person.drive.toFixed(2),
      ].join(":");
    }
    return `${role}:${person.id}`;
  }).join("|");
}

function membersOf(slots) {
  return ROLE_IDS.filter((role) => slots[role]).map((role) => ({ role, person: slots[role] }));
}

function average(list, key) {
  return list.reduce((sum, item) => sum + item[key], 0) / list.length;
}

function spell(pc, mode) {
  const names = mode === "flat" ? FLAT : SHARP;
  return names[((pc % 12) + 12) % 12];
}

function chordSymbol(pc, quality, mode) {
  const suffix = {
    maj: "",
    min: "m",
    dom7: "7",
    maj7: "maj7",
    min7: "m7",
    power: "5",
  };
  return `${spell(pc, mode)}${suffix[quality] || ""}`;
}

function absoluteChord(tonic, chord) {
  return { pc: (tonic + chord.off) % 12, quality: chord.quality };
}

function sameChords(a, b) {
  if (a.length !== b.length) return false;
  return a.every((chord, index) => chord.pc === b[index].pc && chord.quality === b[index].quality);
}

export function generateSong(slots, seed) {
  const members = membersOf(slots);
  if (members.length < 2 || members.length > 8) {
    throw new Error("A song needs 2 to 8 musicians.");
  }
  const signature = slotSignature(slots);
  const rng = mulberry32(hashString(`${seed}::${signature}`));
  const people = members.map((entry) => entry.person);
  const byRole = Object.fromEntries(members.map((entry) => [entry.role, entry.person]));

  const scores = {};
  people.forEach((person) => {
    person.genres.forEach((genre, index) => {
      scores[genre] = (scores[genre] || 0) + (1.15 - index * 0.25);
    });
  });
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const genres = ranked.filter((entry) => entry[1] > 0.45).slice(0, 3).map((entry) => entry[0]);
  if (!genres.length) genres.push(ranked[0][0]);
  const primary = genres[0];
  const bank = BANK_OF[primary] || "pop";

  const swingRaw = byRole.drums ? byRole.drums.swing * 0.7 + average(people, "swing") * 0.3 : average(people, "swing");
  const density = average(people, "density");
  const weight = average(people, "weight");
  const brightness = average(people, "brightness");
  const tonal = [byRole.guitar, byRole.bass, byRole.keys].filter(Boolean);
  const drive = tonal.length ? average(tonal, "drive") : average(people, "drive") * 0.4;

  let tempo = people.reduce((sum, person) => sum + (person.tempoMin + person.tempoMax) / 2, 0) / people.length;
  if (bank === "punk") tempo += 14;
  if (bank === "metal") tempo += 8;
  if (bank === "hiphop") tempo -= 8;
  if (bank === "jazz" && swingRaw > 0.55) tempo -= 6;
  tempo += Math.round((rng() - 0.5) * 8);
  tempo = Math.max(72, Math.min(156, Math.round(tempo)));

  let mode = "major";
  if (bank === "metal" || bank === "hiphop" || weight > 0.67) mode = "minor";
  else if (bank === "blues") mode = rng() < 0.45 ? "minor" : "major";
  else if (bank === "punk" && weight > 0.55) mode = "minor";
  else if (bank === "jazz" && rng() < 0.4) mode = "minor";

  const key = pick(rng, mode === "minor" ? MINOR_KEYS : MAJOR_KEYS);
  const progression = pick(rng, BANKS[bank][mode]).map((chord) => absoluteChord(key.pc, chord));

  let timeSignature = "4/4";
  const flexible = !["metal", "punk", "hiphop", "blues", "funk"].includes(bank);
  if (flexible && (scores.prog || 0) >= 0.8 && rng() < 0.55) timeSignature = "7/8";
  else if (flexible && ((scores.country || 0) >= 1 || (scores.folk || 0) >= 1) && tempo < 112 && rng() < 0.3) {
    timeSignature = "3/4";
  } else if (flexible && swingRaw > 0.55 && tempo < 100 && weight < 0.5 && rng() < 0.22) {
    timeSignature = "6/8";
  }

  const sixteenthsPerBar = { "4/4": 16, "3/4": 12, "6/8": 12, "7/8": 14 }[timeSignature];
  const swing = timeSignature === "4/4" || timeSignature === "3/4" ? swingRaw : 0;
  const planned = planSections({ bank, tempo, sixteenthsPerBar });
  const bridgePick = bridgePattern(mode, rng);
  let bridge = bridgePick.chosen.map((chord) => absoluteChord(key.pc, chord));
  const bridgeAlt = bridgePick.alternate.map((chord) => absoluteChord(key.pc, chord));
  if (sameChords(bridge, progression)) bridge = bridgeAlt;
  const lyrics = buildLyrics(songMood(bank, weight, brightness, swingRaw), rng);
  const notes = members.map((entry) => ({
    role: entry.role,
    name: entry.person.name,
    text: liner(entry, tempo, density, swingRaw, rng),
  }));

  const arrangement = arrangeFull({
    rng,
    bank,
    byRole,
    progression,
    bridge,
    sections: planned,
    sixteenthsPerBar,
    timeSignature,
    tempo,
    swing,
    density,
    weight,
    brightness,
    drive,
    mode,
    tonic: key.pc,
  });
  const structure = withLyrics(arrangement.sections, lyrics);

  const genreLabel = genres.map((genre) => GENRE_LABEL[genre] || genre).join(" · ");
  const keyLabel = `${key.name} ${mode}`;
  const pocket = pocketSentence({ swing: swingRaw, weight, density, brightness, drive, tempo });
  const roster = members.map((entry) => ({ role: entry.role, name: entry.person.name }));

  return {
    seed,
    signature,
    slots,
    bandName: pick(rng, BAND_NAMES),
    title: pick(rng, TITLES),
    genres,
    genreLabel,
    tempo,
    key: keyLabel,
    keyPc: key.pc,
    mode,
    spell: key.spell,
    timeSignature,
    swing: round2(swingRaw),
    density: round2(density),
    weight: round2(weight),
    brightness: round2(brightness),
    drive: round2(drive),
    bank,
    pocket,
    structure,
    bars: structure.reduce((sum, section) => sum + section.bars, 0),
    progression: progression.map((chord) => ({
      ...chord,
      symbol: chordSymbol(chord.pc, chord.quality, key.spell),
    })),
    bridge: bridge.map((chord) => ({
      ...chord,
      symbol: chordSymbol(chord.pc, chord.quality, key.spell),
    })),
    duration: arrangement.duration,
    durationLabel: clock(arrangement.duration),
    lyrics,
    notes,
    roster,
    mixer: defaultMixer(roster),
    arrangement,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function songMood(bank, weight, brightness, swing) {
  if (weight > 0.68 || bank === "metal" || bank === "punk") return "heavy";
  if (swing > 0.5 || bank === "jazz") return "night";
  if (bank === "funk" || bank === "hiphop" || bank === "soul") return "groove";
  if (brightness > 0.62 || bank === "pop" || bank === "country") return "bright";
  return "night";
}

function clock(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function take(rng, pool, count) {
  const out = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    const index = Math.floor(rng() * pool.length);
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function buildLyrics(mood, rng) {
  const bank = LYRICS[mood] || LYRICS.night;
  const versePool = bank.verse.slice();
  const chorusPool = bank.chorus.slice();
  const verse = take(rng, versePool, 4);
  const verseB = take(rng, versePool, 4);
  const hook = pick(rng, bank.hook);
  const middle = take(rng, chorusPool, 2);
  const pre = take(rng, chorusPool, 2);
  const bridge = take(rng, versePool, 4);
  return {
    mood,
    verse,
    verseB,
    pre,
    bridge,
    chorus: [hook, middle[0], middle[1], hook],
  };
}

function withLyrics(sections, lyrics) {
  let verse = 0;
  return sections.map((section, index) => {
    let lines = [];
    if (section.role === "verse") {
      lines = verse === 0 ? lyrics.verse : lyrics.verseB;
      verse += 1;
    } else if (section.role === "pre") lines = lyrics.pre;
    else if (section.role === "chorus" || section.role === "final") lines = lyrics.chorus;
    else if (section.role === "bridge") lines = lyrics.bridge;
    return { ...section, index, lines };
  });
}

function liner(entry, tempo, density, swing, rng) {
  const tendency = pick(rng, entry.person.tendencies);
  const densityWord = density > 0.66 ? "busy and forward" : density < 0.38 ? "sparse, with room around it" : "in a steady middle pocket";
  const feel = swing > 0.45 ? "a swung pulse" : "a straight pulse";
  const chair = roleLabel(entry.role).toLowerCase();
  if (entry.person.custom) {
    return `In this imagined arrangement, ${entry.person.name} takes the ${chair} chair using the traits you set. The part leans on ${tendency}. It sits ${densityWord}, locked to ${feel} at ${tempo} BPM.`;
  }
  return `In this imagined arrangement, ${entry.person.name} takes the ${chair} chair. The part leans on a widely heard side of their style: ${tendency}. It sits ${densityWord}, locked to ${feel} at ${tempo} BPM.`;
}

function pocketSentence(song) {
  const feel = song.swing > 0.45 ? "swung" : "straight";
  const weight = song.weight > 0.66 ? "heavy" : song.weight < 0.35 ? "light" : "mid-weight";
  const density = song.density > 0.66 ? "busy" : song.density < 0.38 ? "sparse" : "balanced";
  const tone = song.brightness > 0.66 ? "bright" : song.brightness < 0.4 ? "dark" : "warm";
  const drive = song.drive > 0.6 ? "a driven edge" : song.drive > 0.35 ? "a little grit" : "a mostly clean tone";
  return `A ${feel}, ${weight}, ${density} pocket at ${song.tempo} BPM, with a ${tone} color and ${drive}.`;
}


function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

function stringToBytes(text) {
  return new TextEncoder().encode(text);
}

export function encodeShare(slots, seed, extra) {
  const payload = { v: 1, seed, slots: {} };
  ROLE_IDS.forEach((role) => {
    const person = slots?.[role];
    if (!person) return;
    if (person.custom) {
      payload.slots[role] = {
        n: person.name,
        g: person.genres,
        t: [person.tempoMin, person.tempoMax],
        p: [person.swing, person.density, person.weight, person.brightness, person.drive],
      };
    } else {
      payload.slots[role] = { id: person.id };
    }
  });
  const mix = extra?.mix || (extra?.mixer ? compactMixer(extra.mixer) : null);
  if (mix) payload.mix = mix;
  const bytes = stringToBytes(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeShare(encoded) {
  let text = String(encoded || "").replace(/-/g, "+").replace(/_/g, "/");
  while (text.length % 4) text += "=";
  const binary = atob(text);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const payload = JSON.parse(bytesToString(bytes));
  if (!payload || payload.v !== 1 || typeof payload.seed !== "string" || !payload.slots) {
    throw new Error("Unrecognized share link.");
  }
  const slots = blankSlots();
  ROLE_IDS.forEach((role) => {
    const entry = payload.slots[role];
    if (!entry) return;
    if (entry.id) {
      const person = getMusician(entry.id);
      if (!person || !person.roles.includes(role)) throw new Error("That lineup could not be restored.");
      slots[role] = person;
      return;
    }
    if (!entry.n || !Array.isArray(entry.p) || entry.p.length < 5) {
      throw new Error("That lineup could not be restored.");
    }
    slots[role] = createCustomMusician({
      name: entry.n,
      role,
      genres: entry.g,
      tempoMin: entry.t?.[0],
      tempoMax: entry.t?.[1],
      swing: entry.p[0],
      density: entry.p[1],
      weight: entry.p[2],
      brightness: entry.p[3],
      drive: entry.p[4],
    });
  });
  const count = ROLE_IDS.filter((role) => slots[role]).length;
  if (count < 2) throw new Error("That lineup could not be restored.");
  return { seed: payload.seed.slice(0, 24), slots, mix: payload.mix || null };
}

export function withSharedMix(song, mix) {
  song.mixer = applyCompactMix(song.mixer || defaultMixer(song.roster), mix);
  return song;
}

export function blankSlots() {
  return {
    singer: null,
    guitar: null,
    bass: null,
    drums: null,
    keys: null,
    horns: null,
    dj: null,
    strings: null,
  };
}
