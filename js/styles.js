/** Style profiles. A lineup's genres blend these instead of borrowing only the top label. */

const PROFILES = {
  rock: { swing: 0.06, tempo: 118, density: 0.62, groove: "backbeat", bass: "roots", comp: "chug", fill: "snare", blurb: "backbeat drums, root-note bass, and a driving guitar figure" },
  funk: { swing: 0.16, tempo: 104, density: 0.8, groove: "syncopated", bass: "sync", comp: "stab", fill: "snare", blurb: "syncopated kicks, ghosted snares, and clipped chord stabs" },
  soul: { swing: 0.22, tempo: 96, density: 0.55, groove: "pocket", bass: "bounce", comp: "chop", fill: "sparse", blurb: "a laid-back pocket, bouncing bass, and warm chord chops" },
  "r&b": { swing: 0.2, tempo: 92, density: 0.52, groove: "pocket", bass: "bounce", comp: "chop", fill: "sparse", blurb: "a soft backbeat, melodic bass, and sustained chords" },
  jazz: { swing: 0.66, tempo: 132, density: 0.48, groove: "ride", bass: "walk", comp: "pad", fill: "sparse", blurb: "a riding cymbal, a walking bass line, and open comping" },
  metal: { swing: 0.02, tempo: 138, density: 0.84, groove: "double", bass: "chug", comp: "chug", fill: "snare", blurb: "double-time kicks and palm-muted riffs" },
  punk: { swing: 0.02, tempo: 156, density: 0.74, groove: "drive", bass: "drive", comp: "chug", fill: "snare", blurb: "a fast straight backbeat and short, loud chords" },
  pop: { swing: 0.08, tempo: 112, density: 0.58, groove: "backbeat", bass: "roots", comp: "chop", fill: "snare", blurb: "a clean backbeat and chords that lift in the chorus" },
  "hip-hop": { swing: 0.18, tempo: 90, density: 0.46, groove: "boom-bap", bass: "hold", comp: "stab", fill: "sparse", blurb: "a boom-bap kick, a late snare, and held bass" },
  country: { swing: 0.12, tempo: 108, density: 0.5, groove: "train", bass: "roots", comp: "chop", fill: "snare", blurb: "a train beat, alternating bass, and offbeat chops" },
  blues: { swing: 0.48, tempo: 88, density: 0.42, groove: "shuffle", bass: "walk", comp: "chop", fill: "sparse", blurb: "a shuffle, a walking bass, and a slow turnaround" },
  reggae: { swing: 0.08, tempo: 84, density: 0.4, groove: "one-drop", bass: "drop", comp: "skank", fill: "sparse", blurb: "a one-drop, bass that skips the downbeat, and offbeat skanks" },
};

const ALIAS = {
  "r&b": "r&b",
  "hip-hop": "hip-hop",
  disco: "funk",
  folk: "country",
  prog: "rock",
  latin: "funk",
  electronic: "hip-hop",
  classical: "jazz",
};

export function profileFor(genre) {
  return PROFILES[ALIAS[genre] || genre] || PROFILES.pop;
}

function has(ids, name) {
  return ids.includes(name);
}

const PRETTY = {
  rock: "rock", funk: "funk", soul: "soul", "r&b": "R&B", jazz: "jazz", metal: "metal", punk: "punk",
  pop: "pop", "hip-hop": "hip-hop", country: "country", blues: "blues", reggae: "reggae", folk: "folk",
  disco: "disco", prog: "prog", latin: "Latin", electronic: "electronic", classical: "classical",
};

function joinNames(names) {
  if (names.length < 2) return names[0] || "pop";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function styleFor(genres) {
  const source = (genres.length ? genres : ["pop"]).slice(0, 3);
  const known = source.map((genre) => {
    const id = ALIAS[genre] || genre;
    return PROFILES[id] ? id : "pop";
  });
  const primary = PROFILES[known[0]] || PROFILES.pop;
  let groove = primary.groove;
  let bass = primary.bass;
  let comp = primary.comp;
  let fill = primary.fill;
  let blurb = primary.blurb;
  if (has(known, "funk") && has(known, "metal")) {
    groove = "sync-heavy";
    bass = "sync-chug";
    comp = "chug";
    fill = "snare";
    blurb = "syncopated kicks under heavy, palm-muted riffs";
  } else if (has(known, "funk") && has(known, "rock")) {
    groove = "syncopated";
    bass = "sync";
    comp = "chug";
    blurb = "funk syncopation with rock weight on the guitars";
  } else if (has(known, "funk") && has(known, "punk")) {
    groove = "sync-heavy";
    bass = "sync";
    comp = "chug";
    blurb = "a punk attack with funk pushes on the offbeats";
  } else if (has(known, "reggae") && (has(known, "punk") || has(known, "rock") || has(known, "metal"))) {
    groove = "one-drop";
    bass = "drop";
    comp = "skank";
    blurb = "reggae skank and one-drop against a harder backbeat";
  } else if (has(known, "jazz") && has(known, "hip-hop")) {
    groove = "boom-bap";
    bass = "walk";
    comp = "stab";
    blurb = "boom-bap drums with a walking, jazzy bass";
  } else if (has(known, "blues") && has(known, "rock")) {
    groove = "shuffle";
    bass = "walk";
    comp = "chug";
    blurb = "a blues shuffle thickened with rock chords";
  } else if ((has(known, "country") || has(known, "folk")) && has(known, "soul")) {
    groove = "train";
    bass = "bounce";
    comp = "chop";
    blurb = "a train beat with soul chord color";
  } else if (known.length > 1 && known[1] !== known[0]) {
    const second = PROFILES[known[1]];
    bass = second.bass;
    blurb = `${primary.blurb}, crossed with ${second.blurb}`;
  }
  const tempos = known.map((id) => PROFILES[id].tempo);
  const swings = known.map((id) => PROFILES[id].swing);
  const densities = known.map((id) => PROFILES[id].density);
  const avg = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const names = source.map((id) => PRETTY[id] || id);
  const sentence = names.length > 1
    ? `A ${joinNames(names)} blend: ${blurb}.`
    : `A ${names[0]} arrangement: ${blurb}.`;
  return {
    ids: known,
    groove,
    bass,
    comp,
    fill,
    tempo: avg(tempos),
    swing: avg(swings),
    density: avg(densities),
    sentence,
  };
}
