/** Format-1 MIDI for one imagined song. One track per part that plays. */

function vlq(value) {
  let n = Math.max(0, value | 0);
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

function stepToTick(step, swing) {
  const ratio = 0.5 + Math.max(0, Math.min(1, swing)) * 0.17;
  const pair = Math.floor(step / 2);
  const pairTicks = 240;
  if (step % 2 === 0) return pair * pairTicks;
  return pair * pairTicks + Math.round(pairTicks * ratio);
}

function durTicks(step, dur, swing) {
  return Math.max(1, stepToTick(step + Math.max(1, dur), swing) - stepToTick(step, swing));
}

function nameBytes(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text).slice(0, 80)));
  return [0xff, 0x03, bytes.length, ...bytes];
}

function scheduleNotes(channel, items) {
  const byPitch = new Map();
  items.forEach((item) => {
    const list = byPitch.get(item.pitch) || [];
    list.push(item);
    byPitch.set(item.pitch, list);
  });
  const events = [];
  byPitch.forEach((list) => {
    list.sort((a, b) => a.on - b.on);
    list.forEach((item, index) => {
      const next = list[index + 1];
      let off = item.off;
      if (next && next.on <= off) off = Math.max(item.on + 1, next.on);
      if (off <= item.on) off = item.on + 1;
      const vel = Math.max(1, Math.min(127, item.vel | 0));
      const pitch = Math.max(0, Math.min(127, item.pitch | 0));
      events.push({ tick: item.on, order: 1, bytes: [0x90 | channel, pitch, vel] });
      events.push({ tick: off, order: 0, bytes: [0x80 | channel, pitch, 0] });
    });
  });
  return events;
}

function encodeTrack(events) {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  let last = 0;
  const data = [];
  events.forEach((event) => {
    const delta = Math.max(0, event.tick - last);
    last = Math.max(last, event.tick);
    data.push(...vlq(delta), ...event.bytes);
  });
  const length = data.length;
  return [
    0x4d, 0x54, 0x72, 0x6b,
    (length >>> 24) & 255,
    (length >>> 16) & 255,
    (length >>> 8) & 255,
    length & 255,
    ...data,
  ];
}

function endTick(events) {
  return events.reduce((max, event) => Math.max(max, event.tick), 0);
}

function noteItems(list, swing, pitchOf, velOf) {
  const items = [];
  list.forEach((event) => {
    const pitches = pitchOf(event);
    const on = stepToTick(event.step, swing);
    const off = on + durTicks(event.step, event.dur || 1, swing);
    const vel = velOf(event);
    pitches.forEach((pitch) => items.push({ pitch, on, off, vel }));
  });
  return items;
}

function partTrack(name, channel, program, items) {
  const notes = scheduleNotes(channel, items);
  const events = [
    { tick: 0, order: -2, bytes: nameBytes(name) },
    { tick: 0, order: -1, bytes: [0xc0 | channel, program] },
    ...notes,
  ];
  events.push({ tick: endTick(events), order: 9, bytes: [0xff, 0x2f, 0x00] });
  return encodeTrack(events);
}

function meterBytes(signature) {
  const map = { "4/4": [4, 2], "3/4": [3, 2], "6/8": [6, 3], "7/8": [7, 3] };
  const [num, den] = map[signature] || [4, 2];
  return [0xff, 0x58, 0x04, num, den, 24, 8];
}

export function songToMidi(song) {
  const arrangement = song.arrangement;
  const swing = arrangement.swing || 0;
  const tempo = Math.round(60000000 / song.tempo);
  const headerEvents = [
    { tick: 0, order: -3, bytes: nameBytes(`${song.bandName} — ${song.title}`) },
    { tick: 0, order: -2, bytes: [0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255] },
    { tick: 0, order: -1, bytes: meterBytes(song.timeSignature) },
  ];
  const last = stepToTick(arrangement.totalSteps, swing);
  headerEvents.push({ tick: last, order: 9, bytes: [0xff, 0x2f, 0x00] });
  const tracks = [encodeTrack(headerEvents)];

  const vel = (gain, scale = 90) => Math.round(28 + (gain || 0.5) * scale);
  const drumItems = [
    ...noteItems(arrangement.kick, swing, () => [36], (event) => vel(event.gain)),
    ...noteItems(arrangement.snare, swing, () => [38], (event) => vel(event.gain, 80)),
    ...noteItems(arrangement.hat, swing, (event) => [event.open ? 46 : 42], (event) => vel(event.gain, 60)),
  ];
  tracks.push(partTrack("Drums", 9, 0, drumItems));

  const programs = { piano: 0, rhodes: 4, crunch: 30, clean: 27, stab: 4 };
  tracks.push(partTrack(
    "Bass",
    0,
    arrangement.bassTimbre === "growl" ? 34 : 33,
    noteItems(arrangement.bass, swing, (event) => [event.midi], () => 96),
  ));
  tracks.push(partTrack(
    "Chords",
    1,
    programs[arrangement.chordTimbre] ?? 0,
    noteItems(arrangement.chords, swing, (event) => event.midis, () => 78),
  ));
  tracks.push(partTrack(
    "Lead",
    2,
    80,
    noteItems(arrangement.lead, swing, (event) => [event.midi], () => 92),
  ));
  if (arrangement.horns?.length) {
    tracks.push(partTrack("Horns", 3, 61, noteItems(arrangement.horns, swing, (event) => event.midis, () => 90)));
  }
  if (arrangement.dj?.length) {
    const hits = arrangement.dj.map((event) => (
      event.kind === "scratch"
        ? { step: event.step, dur: event.dur || 1, midi: 74, gain: event.gain }
        : { step: event.step, dur: event.dur || 1, midi: event.midi, gain: event.gain }
    ));
    tracks.push(partTrack("DJ", 4, 103, noteItems(hits, swing, (event) => [event.midi], (event) => vel(event.gain))));
  }
  if (arrangement.strings?.length) {
    tracks.push(partTrack("Strings", 5, 48, noteItems(arrangement.strings, swing, (event) => event.midis, () => 72)));
  }

  const header = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x01,
    (tracks.length >> 8) & 255, tracks.length & 255,
    0x01, 0xe0,
  ];
  const bytes = header.concat(...tracks);
  return new Uint8Array(bytes);
}
