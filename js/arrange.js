/** Full-song arrangement. Same inputs always produce the same timeline. */

const SCALES = {
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

const TONE_PCS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  power: [0, 7],
};

function rel(off, quality) {
  return { off, quality };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function stepTime(step, tempo, swing) {
  const sixteenth = 60 / tempo / 4;
  const ratio = 0.5 + Math.max(0, Math.min(1, swing)) * 0.17;
  const pair = Math.floor(step / 2);
  const start = pair * sixteenth * 2;
  return step % 2 === 0 ? start : start + sixteenth * 2 * ratio;
}

function noteSeconds(step, dur, tempo, swing) {
  const start = stepTime(step, tempo, swing);
  const end = stepTime(step + Math.max(1, dur), tempo, swing);
  return Math.max(0.05, end - start);
}

export function bridgePattern(mode, rng) {
  const major = [
    [rel(5, "maj"), rel(7, "maj"), rel(9, "min"), rel(5, "maj")],
    [rel(8, "maj"), rel(10, "maj"), rel(5, "maj"), rel(0, "maj")],
  ];
  const minor = [
    [rel(8, "maj"), rel(10, "maj"), rel(0, "min"), rel(5, "min")],
    [rel(5, "min"), rel(8, "maj"), rel(3, "maj"), rel(7, "min")],
  ];
  const options = mode === "minor" ? minor : major;
  const index = Math.floor(rng() * options.length);
  return { chosen: options[index], alternate: options[1 - index] };
}

function secondsFor(bars, sixteenthsPerBar, tempo) {
  return bars * sixteenthsPerBar * (60 / tempo / 4);
}

export function planSections({ bank, tempo, sixteenthsPerBar }) {
  const skipPre = bank === "punk" || bank === "blues";
  const verseBars = bank === "blues" ? 12 : 8;
  const outroBars = bank === "metal" ? 8 : 4;
  const sections = [{ role: "intro", name: "Intro", bars: 4 }];
  sections.push({ role: "verse", name: "Verse", bars: verseBars });
  if (!skipPre) sections.push({ role: "pre", name: "Pre-chorus", bars: 4 });
  sections.push({ role: "chorus", name: "Chorus", bars: 8 });
  sections.push({ role: "verse", name: "Verse", bars: verseBars });
  if (!skipPre) sections.push({ role: "pre", name: "Pre-chorus", bars: 4 });
  sections.push({ role: "chorus", name: "Chorus", bars: 8 });
  sections.push({ role: "bridge", name: "Bridge", bars: 8 });
  sections.push({ role: "final", name: "Final chorus", bars: 8 });
  sections.push({ role: "outro", name: "Outro", bars: outroBars });

  const totalBars = () => sections.reduce((sum, section) => sum + section.bars, 0);
  const growable = () => sections.filter((section) => section.role === "verse" || section.role === "chorus" || section.role === "final");
  let guard = 0;
  while (secondsFor(totalBars(), sixteenthsPerBar, tempo) < 120 && guard < 12) {
    growable().forEach((section) => {
      section.bars += 4;
    });
    guard += 1;
  }
  guard = 0;
  while (secondsFor(totalBars(), sixteenthsPerBar, tempo) > 240 && guard < 12) {
    let changed = false;
    sections.forEach((section) => {
      const min = section.role === "intro" || section.role === "outro" || section.role === "pre" ? 4 : 8;
      if (section.role === "verse" && bank === "blues") {
        if (section.bars - 4 >= 12) {
          section.bars -= 4;
          changed = true;
        }
        return;
      }
      if (section.bars - 4 >= min) {
        section.bars -= 4;
        changed = true;
      }
    });
    if (!changed) break;
    guard += 1;
  }
  return sections;
}

function chooseScale(bank, mode) {
  if (bank === "blues" || bank === "rock" || bank === "metal" || bank === "punk") return "blues";
  if (bank === "funk" || bank === "hiphop" || bank === "jazz" || bank === "soul") {
    return mode === "major" ? "mixolydian" : "dorian";
  }
  if (mode === "minor") return "minorPent";
  return "majorPent";
}

function energyFor(role) {
  if (role === "chorus" || role === "final") return "full";
  if (role === "pre") return "build";
  if (role === "bridge") return "bridge";
  if (role === "intro") return "intro";
  if (role === "outro") return "outro";
  return "thin";
}

export function arrangeFull(ctx) {
  const sections = ctx.sections.map((section) => ({ ...section }));
  const spb = ctx.sixteenthsPerBar;
  let step = 0;
  const sixteenth = 60 / ctx.tempo / 4;
  sections.forEach((section) => {
    section.startStep = step;
    section.startTime = step * sixteenth;
    step += section.bars * spb;
    section.endStep = step;
    section.endTime = step * sixteenth;
  });
  const totalSteps = step;
  const kick = [];
  const snare = [];
  const hat = [];
  const bass = [];
  const chords = [];
  const timbre = chooseTimbres(ctx);

  let bar = 0;
  sections.forEach((section) => {
    for (let local = 0; local < section.bars; local += 1) {
      const chordAt = (localBar, absoluteBar) => {
        if (section.chords?.length) {
          const index = ((localBar % section.chords.length) + section.chords.length) % section.chords.length;
          return section.chords[index];
        }
        return chordFor(ctx, section.role, localBar, absoluteBar);
      };
      const nextChord = chordAt(local + 1, bar + 1);
      writeBar({
        kick,
        snare,
        hat,
        bass,
        chords,
        base: section.startStep + local * spb,
        spb,
        chord: chordAt(local, bar),
        nextChord,
        role: section.role,
        energy: energyFor(section.role),
        local,
        sectionBars: section.bars,
        fill: section.role !== "outro" && local === section.bars - 1,
        ctx,
        timbre,
      });
      bar += 1;
    }
  });

  const lead = writeLead({
    sections,
    spb,
    ctx,
    scale: SCALES[chooseScale(ctx.bank, ctx.mode)],
    bridgeScale: ctx.mode === "minor" ? SCALES.dorian : SCALES.mixolydian,
  });
  const horns = [];
  const dj = [];
  const strings = [];
  writeHorns({ sections, spb, ctx, horns });
  writeDj({ sections, spb, ctx, dj });
  writeStrings({ sections, spb, ctx, strings });
  const tom = [];
  const crash = [];
  addDrumColor(sections, spb, tom, crash);

  const stamp = (list, withDur) => {
    list.forEach((event) => {
      event.time = stepTime(event.step, ctx.tempo, ctx.swing);
      if (withDur) event.seconds = noteSeconds(event.step, event.dur, ctx.tempo, ctx.swing);
    });
  };
  stamp(kick, false);
  stamp(snare, false);
  stamp(hat, false);
  stamp(tom, false);
  stamp(crash, false);
  stamp(bass, true);
  stamp(chords, true);
  stamp(lead, true);
  stamp(horns, true);
  stamp(strings, true);
  dj.forEach((event) => {
    event.time = stepTime(event.step, ctx.tempo, ctx.swing);
    event.seconds = noteSeconds(event.step, event.dur || 1, ctx.tempo, ctx.swing);
  });

  return {
    tempo: ctx.tempo,
    swing: Math.round(ctx.swing * 100) / 100,
    totalSteps,
    sixteenthsPerBar: spb,
    timeSignature: ctx.timeSignature,
    duration: totalSteps * sixteenth,
    brightness: Math.round((ctx.byRole.singer ? ctx.byRole.singer.brightness * 0.6 + ctx.brightness * 0.4 : ctx.brightness) * 100) / 100,
    drive: Math.round(ctx.drive * 100) / 100,
    chordTimbre: timbre.chordTimbre,
    bassTimbre: timbre.bassTimbre,
    keysVoice: keysVoiceFor(ctx),
    sections,
    kick,
    snare,
    hat,
    tom,
    crash,
    bass,
    chords,
    lead,
    horns,
    dj,
    strings,
  };
}

function writeHorns({ sections, spb, ctx, horns }) {
  if (!ctx.byRole.horns) return;
  const density = ctx.byRole.horns.density;
  sections.forEach((section) => {
    const energy = energyFor(section.role);
    for (let local = 0; local < section.bars; local += 1) {
      const base = section.startStep + local * spb;
      const chord = chordFor(ctx, section.role, local, Math.floor(section.startStep / spb) + local);
      const voice = voiceChord(chord, 58, 77).slice(0, 3);
      if (energy === "full") {
        [4, 12].filter((hit) => hit < spb).forEach((hit) => {
          horns.push({ step: base + hit, midis: voice, dur: 2 });
        });
        if (local % 2 === 0) {
          const midi = voice[Math.floor(ctx.rng() * voice.length)];
          horns.push({ step: base + (density > 0.6 ? 2 : 0), midis: [midi], dur: density > 0.6 ? 3 : 6 });
        }
      } else if (energy === "bridge") {
        horns.push({ step: base, midis: voice, dur: Math.max(4, spb - 2) });
      } else if ((energy === "thin" || energy === "build") && local % 2 === 0) {
        horns.push({ step: base, midis: [voice[0]], dur: Math.max(3, Math.floor(spb / 2)) });
      } else if (energy === "intro" && local === section.bars - 1) {
        horns.push({ step: base, midis: [voice[0]], dur: 4 });
      }
    }
  });
}

function writeDj({ sections, spb, ctx, dj }) {
  if (!ctx.byRole.dj) return;
  const density = ctx.byRole.dj.density;
  const swung = ctx.byRole.dj.swing > 0.45;
  sections.forEach((section) => {
    const energy = energyFor(section.role);
    for (let local = 0; local < section.bars; local += 1) {
      const base = section.startStep + local * spb;
      const root = 36 + (chordFor(ctx, section.role, local, Math.floor(section.startStep / spb) + local).pc % 12);
      dj.push({ kind: "sub", step: base, midi: root > 48 ? root - 12 : root, dur: 3, gain: energy === "full" ? 0.85 : 0.55 });
      if (energy === "full" || energy === "build") {
        dj.push({ kind: "scratch", step: base + (swung ? 6 : 7), dur: 2, gain: 0.55 });
        if (density > 0.5 && spb >= 16) dj.push({ kind: "scratch", step: base + 14, dur: 1, gain: 0.4 });
        if (ctx.rng() < density * 0.45 && spb >= 12) dj.push({ kind: "scratch", step: base + 10, dur: 1, gain: 0.32 });
      } else if (energy === "bridge") {
        if (local % 2 === 0) dj.push({ kind: "scratch", step: base + Math.floor(spb / 2), dur: 3, gain: 0.28 });
      } else if (local % 2 === 0 && energy !== "outro") {
        dj.push({ kind: "scratch", step: base + Math.min(8, spb - 2), dur: 2, gain: 0.26 });
      }
    }
  });
}

function writeStrings({ sections, spb, ctx, strings }) {
  if (!ctx.byRole.strings) return;
  const density = ctx.byRole.strings.density;
  sections.forEach((section) => {
    const energy = energyFor(section.role);
    for (let local = 0; local < section.bars; local += 1) {
      const base = section.startStep + local * spb;
      const chord = chordFor(ctx, section.role, local, Math.floor(section.startStep / spb) + local);
      const high = voiceChord(chord, 60, 81);
      if (energy === "full") {
        const midis = high.slice(0, 3);
        midis.push(midis[0] + 12);
        strings.push({ step: base, midis, dur: Math.max(4, spb - 1) });
      } else if (energy === "bridge") {
        const midi = high[Math.floor(ctx.rng() * high.length)];
        strings.push({ step: base, midis: [midi], dur: Math.max(4, spb - 2) });
      } else if (energy === "outro") {
        strings.push({ step: base, midis: high.slice(0, 2), dur: Math.max(4, spb - 1) });
      } else if (local % 2 === 0 || density > 0.55) {
        strings.push({ step: base, midis: high.slice(0, energy === "build" ? 3 : 2), dur: Math.max(4, spb - 2) });
      }
    }
  });
}

function chordFor(ctx, role, local, absoluteBar) {
  if (role === "bridge") return ctx.bridge[((local % ctx.bridge.length) + ctx.bridge.length) % ctx.bridge.length];
  return ctx.progression[((absoluteBar % ctx.progression.length) + ctx.progression.length) % ctx.progression.length];
}

function keysVoiceFor(ctx) {
  const bank = ctx.bank;
  const organBanks = bank === "soul" || bank === "rock" || bank === "jazz" || bank === "funk" || bank === "pop";
  if (ctx.byRole.keys && organBanks && ctx.brightness >= 0.42) return "organ";
  return "ep";
}

function addDrumColor(sections, spb, tom, crash) {
  sections.forEach((section) => {
    if (section.role === "chorus" || section.role === "final") {
      crash.push({ step: section.startStep, gain: 0.62 });
    }
    if (section.role === "outro") return;
    const start = section.endStep - Math.min(6, Math.floor(spb / 2));
    [50, 47, 43].forEach((midi, index) => {
      const step = start + index * 2;
      if (step >= section.startStep && step < section.endStep) tom.push({ step, midi, gain: 0.46 + index * 0.07 });
    });
  });
}

function chooseTimbres(ctx) {
  const { bank, byRole, drive } = ctx;
  const guitar = byRole.guitar;
  const keys = byRole.keys;
  const guitarDrive = guitar ? guitar.drive : drive;
  let chordTimbre = "piano";
  let chordRhythm = "sustain";
  if (bank === "metal" || bank === "punk" || guitarDrive > 0.66) {
    chordTimbre = "crunch";
    chordRhythm = "chug";
  } else if (bank === "funk") {
    chordTimbre = "stab";
    chordRhythm = "stab";
  } else if (bank === "jazz" || bank === "soul" || bank === "hiphop") {
    chordTimbre = "rhodes";
    chordRhythm = "sustain";
  } else if (bank === "country") {
    chordTimbre = "piano";
    chordRhythm = "backbeat";
  } else if (keys && !guitar) {
    chordTimbre = "piano";
    chordRhythm = "sustain";
  } else if (guitar && guitar.drive < 0.25) {
    chordTimbre = "clean";
    chordRhythm = "sustain";
  } else if (guitar) {
    chordTimbre = "crunch";
    chordRhythm = "chug";
  }
  const bassTimbre = (byRole.bass && byRole.bass.drive > 0.55) || drive > 0.62 || bank === "metal" ? "growl" : "round";
  return { chordTimbre, chordRhythm, bassTimbre };
}

function writeBar(state) {
  const {
    kick, snare, hat, bass, chords, base, spb, chord, nextChord, role, energy, local, sectionBars, fill, ctx, timbre,
  } = state;
  const drummer = ctx.byRole.drums;
  const bassist = ctx.byRole.bass;
  const drumDensity = drummer ? drummer.density : ctx.density;
  const bassDensity = bassist ? bassist.density : ctx.density;
  const gain = energy === "outro"
    ? 0.42 + (1 - local / Math.max(1, sectionBars - 1)) * 0.28
    : energy === "intro" ? 0.72 : energy === "thin" ? 0.86 : 1;

  const bucket = { kick: [], snare: [], hat: [] };
  drumsBase({
    kick: bucket.kick,
    snare: bucket.snare,
    hat: bucket.hat,
    base,
    spb,
    timeSignature: ctx.timeSignature,
    bank: ctx.bank,
    drumDensity: energy === "full" || (energy === "build" && local >= sectionBars - 2) ? Math.max(drumDensity, 0.7) : drumDensity,
    weight: energy === "full" ? Math.max(ctx.weight, 0.62) : ctx.weight,
  });
  let useKick = bucket.kick;
  let useSnare = bucket.snare;
  let useHat = bucket.hat;
  const late = energy === "build" && local >= Math.max(1, sectionBars - 2);
  if ((energy === "thin" || energy === "intro" || energy === "outro" || (energy === "build" && !late))) {
    useKick = useKick.slice(0, 1);
    useSnare = energy === "intro" ? [] : useSnare.slice(0, 1);
    useHat = useHat.filter((hit) => (hit.step - base) % 4 === 0);
  } else if (energy === "bridge") {
    useKick = useKick.slice(0, 1);
    useSnare = useSnare.filter((hit) => hit.step - base >= spb / 2).slice(0, 1);
    useHat = useHat.filter((hit) => (hit.step - base) % 4 === 0);
  }
  useKick.forEach((hit) => kick.push({ step: hit.step, gain: hit.gain * gain }));
  useSnare.forEach((hit) => snare.push({ step: hit.step, gain: hit.gain * gain }));
  useHat.forEach((hit) => hat.push({ step: hit.step, gain: hit.gain * gain, open: Boolean(hit.open) && energy === "full" }));
  if (role === "final" && ctx.timeSignature === "4/4") {
    kick.push({ step: base + 6, gain: 0.38 * gain });
  }
  if (fill) addFill(snare, base, spb, drumDensity);

  writeBass({
    bass, base, spb, chord, nextChord, energy, bank: ctx.bank, timeSignature: ctx.timeSignature, bassDensity, swing: ctx.swing,
  });
  writeChords({
    chords, base, spb, chord, energy, local, timeSignature: ctx.timeSignature, timbre, drumDensity,
  });
}

function addFill(snare, base, spb, drumDensity) {
  const start = base + Math.floor(spb / 2);
  for (let i = snare.length - 1; i >= 0; i -= 1) {
    if (snare[i].step < base) break;
    if (snare[i].step >= start) snare.splice(i, 1);
  }
  const step = drumDensity > 0.55 ? 1 : 2;
  const span = base + spb - start;
  for (let i = start; i < base + spb; i += step) {
    const accent = span <= 1 ? 1 : (i - start) / span;
    snare.push({ step: i, gain: 0.16 + accent * 0.3 });
  }
}

function drumsBase({ kick, snare, hat, base, spb, timeSignature, bank, drumDensity, weight }) {
  const hatsEvery = drumDensity > 0.62 ? 1 : 2;
  if (timeSignature === "3/4") {
    kick.push({ step: base, gain: 0.8 });
    snare.push({ step: base + 4, gain: 0.28 }, { step: base + 8, gain: 0.28 });
    for (let i = 0; i < spb; i += 2) hat.push({ step: base + i, gain: 0.1, open: false });
    return;
  }
  if (timeSignature === "6/8") {
    kick.push({ step: base, gain: 0.8 }, { step: base + 6, gain: 0.55 });
    snare.push({ step: base + 6, gain: 0.32 });
    for (let i = 0; i < spb; i += 2) hat.push({ step: base + i, gain: 0.1, open: false });
    return;
  }
  if (timeSignature === "7/8") {
    kick.push({ step: base, gain: 0.8 }, { step: base + 4, gain: 0.6 }, { step: base + 8, gain: 0.7 });
    snare.push({ step: base + 4, gain: 0.3 }, { step: base + 8, gain: 0.3 });
    for (let i = 0; i < spb; i += 2) hat.push({ step: base + i, gain: 0.1, open: false });
    return;
  }
  if (bank === "funk") {
    kick.push({ step: base, gain: 0.85 }, { step: base + 6, gain: 0.55 }, { step: base + 10, gain: 0.6 });
    if (drumDensity > 0.55) kick.push({ step: base + 14, gain: 0.4 });
    snare.push({ step: base + 4, gain: 0.4 }, { step: base + 12, gain: 0.4 });
    for (let i = 0; i < 16; i += hatsEvery) hat.push({ step: base + i, gain: hatsEvery === 1 ? 0.07 : 0.1, open: false });
    return;
  }
  if (bank === "hiphop") {
    kick.push({ step: base, gain: 0.9 }, { step: base + 7, gain: 0.45 }, { step: base + 10, gain: 0.55 });
    snare.push({ step: base + 8, gain: 0.42 });
    for (let i = 0; i < 16; i += drumDensity > 0.5 ? 2 : 4) hat.push({ step: base + i, gain: 0.09, open: false });
    return;
  }
  if (bank === "jazz") {
    kick.push({ step: base, gain: 0.35 }, { step: base + 10, gain: 0.22 });
    snare.push({ step: base + 4, gain: 0.14 }, { step: base + 12, gain: 0.14 });
    for (let i = 0; i < 16; i += 2) hat.push({ step: base + i, gain: 0.11, open: false });
    return;
  }
  if (bank === "metal") {
    const hit = weight > 0.72 ? 1 : 2;
    for (let i = 0; i < 16; i += hit) kick.push({ step: base + i, gain: hit === 1 ? 0.42 : 0.7 });
    snare.push({ step: base + 4, gain: 0.4 }, { step: base + 12, gain: 0.4 });
    for (let i = 0; i < 16; i += 2) hat.push({ step: base + i, gain: 0.08, open: false });
    return;
  }
  kick.push({ step: base, gain: 0.85 }, { step: base + 8, gain: 0.72 });
  if (drumDensity > 0.48) kick.push({ step: base + 10, gain: 0.4 });
  if (weight > 0.7) kick.push({ step: base + 14, gain: 0.48 });
  snare.push({ step: base + 4, gain: 0.4 }, { step: base + 12, gain: 0.4 });
  for (let i = 0; i < 16; i += hatsEvery) {
    const open = drumDensity > 0.45 && i === 14;
    hat.push({ step: base + i, gain: open ? 0.12 : hatsEvery === 1 ? 0.07 : 0.1, open });
  }
}

function bassMidi(pc) {
  let midi = 36 + ((pc % 12) + 12) % 12;
  while (midi < 34) midi += 12;
  while (midi > 50) midi -= 12;
  return midi;
}

function writeBass({ bass, base, spb, chord, nextChord, energy, bank, timeSignature, bassDensity, swing }) {
  const root = bassMidi(chord.pc);
  const fifth = bassMidi((chord.pc + 7) % 12);
  if (energy === "thin" || energy === "intro" || energy === "outro") {
    bass.push({ step: base, midi: root, dur: Math.max(2, spb - 2) });
    return;
  }
  if (energy === "bridge") {
    const half = Math.floor(spb / 2);
    bass.push({ step: base, midi: root, dur: Math.max(2, half - 1) });
    bass.push({ step: base + half, midi: fifth, dur: Math.max(2, half - 1) });
    return;
  }
  if (energy === "build") {
    bass.push({ step: base, midi: root, dur: Math.max(2, Math.floor(spb / 2) - 1) });
    bass.push({ step: base + Math.floor(spb / 2), midi: fifth, dur: Math.max(2, Math.floor(spb / 2) - 1) });
    return;
  }
  if (timeSignature === "6/8") {
    bass.push({ step: base, midi: root, dur: 6 }, { step: base + 6, midi: fifth, dur: 5 });
    return;
  }
  if (timeSignature === "3/4") {
    bass.push({ step: base, midi: root, dur: 8 }, { step: base + 8, midi: fifth, dur: 3 });
    return;
  }
  if (timeSignature === "7/8") {
    bass.push({ step: base, midi: root, dur: 4 }, { step: base + 4, midi: root, dur: 4 }, { step: base + 8, midi: fifth, dur: 5 });
    return;
  }
  if (bank === "jazz" && swing > 0.4) {
    const third = bassMidi((chord.pc + (String(chord.quality).startsWith("min") ? 3 : 4)) % 12);
    const approach = bassMidi((nextChord.pc + 11) % 12);
    [root, third, fifth, approach].forEach((midi, index) => {
      bass.push({ step: base + index * 4, midi, dur: 3 });
    });
    return;
  }
  if (bank === "funk") {
    bass.push({ step: base, midi: root, dur: 2 }, { step: base + 6, midi: Math.min(55, root + 12), dur: 2 });
    if (bassDensity > 0.45) bass.push({ step: base + 10, midi: root, dur: 1 });
    if (bassDensity > 0.7) bass.push({ step: base + 14, midi: fifth, dur: 1 });
    return;
  }
  if (bank === "metal" || bank === "punk") {
    const hit = bank === "metal" ? 2 : 4;
    for (let i = 0; i < 16; i += hit) bass.push({ step: base + i, midi: root, dur: Math.max(1, hit - 1) });
    return;
  }
  if (bank === "hiphop") {
    bass.push({ step: base, midi: root, dur: 6 }, { step: base + 10, midi: root, dur: 4 });
    return;
  }
  if (bassDensity < 0.36) {
    bass.push({ step: base, midi: root, dur: 14 });
    return;
  }
  bass.push({ step: base, midi: root, dur: 6 }, { step: base + 8, midi: root, dur: 4 });
  if (bassDensity > 0.58) bass.push({ step: base + 10, midi: fifth, dur: 2 });
}

function voiceChord(chord, low, high) {
  const intervals = TONE_PCS[chord.quality] || TONE_PCS.maj;
  const notes = [];
  let cursor = low;
  intervals.forEach((interval) => {
    const pc = (chord.pc + interval) % 12;
    let found = null;
    for (let midi = cursor; midi <= high; midi += 1) {
      if (((midi % 12) + 12) % 12 === pc) {
        found = midi;
        break;
      }
    }
    if (found == null) found = low + pc;
    notes.push(found);
    cursor = found + 2;
  });
  return notes;
}

function writeChords({ chords, base, spb, chord, energy, local, timeSignature, timbre, drumDensity }) {
  if (energy === "intro" && local % 2 === 1) return;
  const sustained = voiceChord(chord, timbre.chordTimbre === "crunch" ? 40 : 52, timbre.chordTimbre === "crunch" ? 64 : 76);
  if (energy === "thin" || energy === "intro" || energy === "outro" || energy === "bridge") {
    if (energy === "bridge") {
      const half = Math.floor(spb / 2);
      chords.push({ step: base, midis: sustained, dur: Math.max(2, half - 1) });
      chords.push({ step: base + half, midis: sustained, dur: Math.max(2, half - 1) });
      return;
    }
    chords.push({ step: base, midis: sustained, dur: Math.max(4, spb - 2) });
    return;
  }
  if (timbre.chordTimbre === "crunch" || timbre.chordRhythm === "chug") {
    const power = voiceChord({ pc: chord.pc, quality: "power" }, 40, 58);
    power.push(power[0] + 12);
    const hit = energy === "build" ? 8 : drumDensity > 0.6 ? 4 : 8;
    for (let i = 0; i < spb; i += hit) chords.push({ step: base + i, midis: power, dur: Math.min(3, hit) });
    return;
  }
  const midis = voiceChord(chord, 52, 76);
  if (timbre.chordRhythm === "stab" || energy === "build") {
    [0, 6, 10].filter((hit) => hit < spb).forEach((hit) => {
      chords.push({ step: base + hit, midis, dur: 2 });
    });
    return;
  }
  if (timbre.chordRhythm === "backbeat" && timeSignature === "4/4") {
    chords.push({ step: base + 4, midis, dur: 3 }, { step: base + 12, midis, dur: 3 });
    return;
  }
  chords.push({ step: base, midis, dur: Math.max(4, spb - 2) });
  if (energy === "full" && spb >= 16) chords.push({ step: base + 8, midis, dur: 4 });
}

function closestTone(midi, pcs, min, max) {
  let best = midi;
  let dist = 99;
  for (let candidate = midi - 7; candidate <= midi + 7; candidate += 1) {
    const pc = ((candidate % 12) + 12) % 12;
    if (!pcs.includes(pc)) continue;
    const gap = Math.abs(candidate - midi);
    if (gap < dist) {
      dist = gap;
      best = candidate;
    }
  }
  return Math.max(min, Math.min(max, best));
}

function writeLead({ sections, spb, ctx, scale, bridgeScale }) {
  const singer = ctx.byRole.singer;
  const density = singer ? singer.density : ctx.density * 0.85;
  const notes = [];
  const tonic = ctx.tonic;
  sections.forEach((section) => {
    const range = {
      intro: [62, 74],
      verse: [60, 72],
      pre: [64, 76],
      chorus: [67, 81],
      final: [69, 84],
      bridge: [58, 79],
      outro: [60, 72],
    }[section.role] || [62, 76];
    const abs = (section.role === "bridge" ? bridgeScale : scale).map((interval) => (tonic + interval) % 12);
    const restChance = section.role === "chorus" || section.role === "final"
      ? 0.16 - density * 0.08
      : section.role === "verse" || section.role === "intro" || section.role === "outro"
        ? 0.46 - density * 0.14
        : 0.28 - density * 0.1;
    const choices = section.role === "chorus" || section.role === "final"
      ? [2, 2, 4, 4]
      : section.role === "bridge"
        ? [2, 4, 6, 8]
        : section.role === "pre"
          ? [2, 4, 4, 6]
          : [4, 6, 8, 8];
    const jumps = section.role === "bridge"
      ? [-5, -4, -2, 2, 4, 5, 7]
      : section.role === "chorus" || section.role === "final"
        ? [-2, -1, 1, 2, 2, 3]
        : [-2, -1, -1, 1, 1, 2];
    const total = section.bars * spb;
    let cursor = 0;
    let midi = closestTone(Math.round((range[0] + range[1]) / 2), abs, range[0], range[1]);
    while (cursor < total - 1) {
      if (ctx.rng() < restChance) {
        cursor += Math.min(section.role === "chorus" || section.role === "final" ? 2 : 4, total - cursor);
        continue;
      }
      let dur = pick(ctx.rng, choices);
      if (cursor + dur > total) dur = total - cursor;
      const localBar = Math.floor(cursor / spb);
      const chord = chordFor(ctx, section.role, localBar, Math.floor(section.startStep / spb) + localBar);
      const chordPcs = (TONE_PCS[chord.quality] || TONE_PCS.maj).map((interval) => (chord.pc + interval) % 12);
      midi = closestTone(midi + pick(ctx.rng, jumps), abs, range[0], range[1]);
      if (cursor % 4 === 0 && ctx.rng() < (section.role === "bridge" ? 0.45 : 0.74)) {
        midi = closestTone(midi, chordPcs, range[0], range[1]);
      }
      notes.push({ step: section.startStep + cursor, midi, dur: Math.max(1, dur - 1) });
      cursor += dur;
    }
    if (section.role === "outro" && notes.length) {
      const last = notes[notes.length - 1];
      if (last.step >= section.startStep) last.midi = closestTone(60 + (tonic % 12), abs, range[0], range[1]);
    }
  });
  return notes;
}
