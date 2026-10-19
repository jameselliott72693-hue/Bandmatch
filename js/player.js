/** Synthesized drums, bass, guitar, keys, horns, and a lead melody. No samples and no voice. */

import { defaultMixer, setPartMuted, toneHz } from "./mixer.js";

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function lowerBound(events, time) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function compileEvents(arrangement) {
  if (!arrangement) return [];
  const events = [];
  arrangement.kick.forEach((hit) => events.push({ kind: "kick", time: hit.time, gain: hit.gain }));
  arrangement.snare.forEach((hit) => events.push({ kind: "snare", time: hit.time, gain: hit.gain }));
  arrangement.hat.forEach((hit) => events.push({ kind: "hat", time: hit.time, gain: hit.gain, open: hit.open }));
  (arrangement.tom || []).forEach((hit) => events.push({ kind: "tom", time: hit.time, gain: hit.gain, midi: hit.midi }));
  (arrangement.crash || []).forEach((hit) => events.push({ kind: "crash", time: hit.time, gain: hit.gain }));
  arrangement.bass.forEach((note) => events.push({ kind: "bass", time: note.time, seconds: note.seconds, midi: note.midi }));
  arrangement.chords.forEach((note) => events.push({ kind: "chord", time: note.time, seconds: note.seconds, midis: note.midis }));
  arrangement.lead.forEach((note) => events.push({ kind: "lead", time: note.time, seconds: note.seconds, midi: note.midi }));
  (arrangement.horns || []).forEach((note) => events.push({ kind: "horn", time: note.time, seconds: note.seconds, midis: note.midis }));
  (arrangement.strings || []).forEach((note) => events.push({ kind: "string", time: note.time, seconds: note.seconds, midis: note.midis }));
  (arrangement.dj || []).forEach((hit) => {
    if (hit.kind === "scratch") events.push({ kind: "scratch", time: hit.time, seconds: hit.seconds, gain: hit.gain });
    else events.push({ kind: "sub", time: hit.time, seconds: hit.seconds, midi: hit.midi, gain: hit.gain });
  });
  events.sort((a, b) => a.time - b.time);
  return events;
}

function envGain(ctx, time, peak, attack, hold, release) {
  const gain = ctx.createGain();
  const start = Math.max(0.0001, peak);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(start, time + attack);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, start * 0.65), time + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + hold + release);
  return gain;
}

function makeReverb(ctx) {
  const seconds = 1.6;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14;
      const t = i / length;
      data[i] = last * (1 - t) ** 2.6 * (channel === 0 ? 1 : 0.9);
    }
  }
  return buffer;
}

function makeNoise(ctx) {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function makeShaper(ctx, amount) {
  const curve = new Float32Array(256);
  const k = 8 + amount * 40;
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  const shaper = ctx.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

export function createPlayer() {
  const player = {
    ctx: null,
    arrangement: null,
    token: 0,
    timer: 0,
    sources: [],
    mixer: null,
    strips: {},
    inputs: {},
    master: null,
    analyser: null,
    meter: null,
    meterFrame: 0,
    playing: false,
    position: 0,
    duration: 0,
    events: [],
    cursor: 0,
    origin: 0,
    looping: false,
    loopIndex: 0,
    stateHandler: () => {},
    progressHandler: () => {},
    noise: null,

    onState(handler) {
      this.stateHandler = handler;
    },

    onProgress(handler) {
      this.progressHandler = handler;
    },

    load(arrangement) {
      this.haltTransport(false);
      this.arrangement = arrangement;
      this.events = compileEvents(arrangement);
      this.duration = arrangement?.duration || 0;
      this.position = 0;
      this.cursor = 0;
      this.looping = false;
      this.loopIndex = 0;
      this.progressHandler(0, 0);
    },

    attachMeter(canvas) {
      this.meter = canvas;
      this.drawMeter(false);
    },

    setMixer(mixer) {
      this.mixer = mixer;
      if (this.ctx && this.strips) this.applyMixer();
    },

    setMute(part, muted) {
      if (!this.mixer) this.mixer = defaultMixer([]);
      setPartMuted(this.mixer, part, muted);
      this.applyMixer();
    },

    async play() {
      if (!this.arrangement || this.playing) return;
      const resumeAt = this.position >= this.duration - 0.08 ? 0 : this.position;
      this.position = resumeAt;
      this.token += 1;
      const token = this.token;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error("This browser cannot start audio.");
      if (this.ctx) {
        const old = this.ctx;
        this.ctx = null;
        try {
          await old.close();
        } catch {
          /* already closed */
        }
      }
      if (token !== this.token) return;
      this.ctx = new Ctx();
      this.buildGraph();
      await this.ctx.resume();
      if (token !== this.token) return;
      this.origin = this.ctx.currentTime + 0.06 - this.position;
      this.cursor = lowerBound(this.events, this.position);
      this.playing = true;
      this.stateHandler(true);
      this.emitProgress(this.position);
      this.pump(token);
      this.timer = window.setInterval(() => this.pump(token), 40);
      this.animateMeter();
    },

    stop() {
      const was = this.playing;
      this.haltTransport(false);
      this.position = 0;
      this.cursor = 0;
      if (was) this.stateHandler(false);
      this.emitProgress(0);
    },

    finish() {
      const end = this.duration;
      this.haltTransport(false);
      this.position = end;
      this.stateHandler(false);
      this.emitProgress(end);
    },

    haltTransport(keepPosition) {
      this.token += 1;
      if (this.timer) window.clearInterval(this.timer);
      this.timer = 0;
      this.haltSources();
      this.playing = false;
      if (!keepPosition) this.position = this.position;
      if (this.meterFrame) cancelAnimationFrame(this.meterFrame);
      this.meterFrame = 0;
      this.drawMeter(false);
    },

    haltSources() {
      this.sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      });
      this.sources = [];
    },

    sectionIndex(time) {
      const sections = this.arrangement?.sections || [];
      let index = 0;
      for (let i = 0; i < sections.length; i += 1) {
        if (time + 0.001 >= sections[i].startTime) index = i;
      }
      return index;
    },

    emitProgress(time) {
      this.progressHandler(time, this.sectionIndex(time), this.duration);
    },

    setLoopSection(enabled) {
      this.looping = Boolean(enabled);
      if (this.looping) this.loopIndex = this.sectionIndex(this.currentTime());
    },

    currentTime() {
      if (this.playing && this.ctx) return this.ctx.currentTime - this.origin;
      return this.position;
    },

    seekRatio(ratio) {
      const clamped = Math.max(0, Math.min(1, ratio));
      this.seekTo(clamped * this.duration);
    },

    seekSection(index) {
      const section = this.arrangement?.sections?.[index];
      if (!section) return;
      this.seekTo(section.startTime);
    },

    seekTo(time) {
      if (!this.arrangement) return;
      const t = Math.max(0, Math.min(this.duration, time));
      this.position = t;
      if (this.looping) this.loopIndex = this.sectionIndex(t);
      if (this.playing && this.ctx) {
        this.haltSources();
        this.origin = this.ctx.currentTime + 0.04 - t;
        this.cursor = lowerBound(this.events, t);
      }
      this.emitProgress(t);
    },

    buildGraph() {
      const ctx = this.ctx;
      this.noise = makeNoise(ctx);
      if (!this.mixer) this.mixer = defaultMixer([]);
      const dry = ctx.createGain();
      const wetIn = ctx.createGain();
      const reverb = ctx.createConvolver();
      reverb.buffer = makeReverb(ctx);
      wetIn.connect(reverb);
      this.master = ctx.createGain();
      this.master.gain.value = this.mixer.master ?? 0.85;
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -16;
      glue.knee.value = 10;
      glue.ratio.value = 2.4;
      glue.attack.value = 0.012;
      glue.release.value = 0.18;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2.5;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.08;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 64;
      dry.connect(this.master);
      reverb.connect(this.master);
      this.master.connect(glue);
      glue.connect(limiter);
      limiter.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      this.strips = {};
      Object.keys(this.mixer.channels).forEach((id) => {
        this.strips[id] = this.makeStrip(dry, wetIn);
      });
      if (!Object.keys(this.strips).length) {
        ["drums", "bass", "guitar", "lead"].forEach((id) => {
          this.strips[id] = this.makeStrip(dry, wetIn);
        });
      }
      this.inputs = this.routeInputs();
      this.applyMixer(true);
    },

    makeStrip(dry, wetIn) {
      const ctx = this.ctx;
      const input = ctx.createGain();
      const drive = ctx.createGain();
      drive.gain.value = 0.7;
      const shaper = makeShaper(ctx, 0.42);
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 4800;
      tone.Q.value = 0.65;
      const fader = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const send = ctx.createGain();
      input.connect(drive);
      drive.connect(shaper);
      shaper.connect(tone);
      tone.connect(fader);
      fader.connect(panner);
      panner.connect(dry);
      panner.connect(send);
      send.connect(wetIn);
      return { input, drive, tone, fader, pan: panner, send };
    },

    routeInputs() {
      const channels = this.mixer?.channels || {};
      const pick = (...ids) => {
        for (let i = 0; i < ids.length; i += 1) {
          if (this.strips[ids[i]]) return this.strips[ids[i]].input;
        }
        return this.master;
      };
      const both = Boolean(channels.guitar && channels.keys);
      return {
        drums: pick("drums", "backing"),
        bass: pick("bass", "backing"),
        lead: pick("lead", "backing"),
        guitar: both || channels.guitar ? pick("guitar", "backing") : pick("keys", "backing", "guitar"),
        keys: both || channels.keys ? pick("keys", "backing") : null,
        horns: channels.horns ? pick("horns") : null,
        dj: channels.dj ? pick("dj") : null,
        strings: channels.strings ? pick("strings") : null,
        bothChords: both,
      };
    },

    applyMixer(immediate) {
      if (!this.ctx || !this.strips) return;
      const mixer = this.mixer || { master: 0.85, channels: {} };
      const now = this.ctx.currentTime;
      const anySolo = Object.values(mixer.channels).some((channel) => channel.solo);
      const set = (param, value) => {
        if (immediate) param.value = value;
        else param.setTargetAtTime(value, now, 0.02);
      };
      if (this.master) set(this.master.gain, Math.max(0.0001, mixer.master ?? 0.85));
      Object.entries(this.strips).forEach(([id, strip]) => {
        const channel = mixer.channels[id] || { volume: 0.82, pan: 0, mute: false, solo: false, reverb: 0.16, tone: 0.7 };
        const silenced = channel.mute || (anySolo && !channel.solo);
        set(strip.fader.gain, silenced ? 0.0001 : Math.max(0.0001, channel.volume));
        set(strip.pan.pan, Math.max(-1, Math.min(1, channel.pan || 0)));
        set(strip.send.gain, Math.max(0, channel.reverb || 0));
        set(strip.tone.frequency, toneHz(id, channel.tone ?? 0.7));
        set(strip.drive.gain, 0.35 + (channel.tone ?? 0.7) * 1.2);
      });
    },

    pump(token) {
      if (token !== this.token || !this.ctx || !this.playing) return;
      const songNow = this.ctx.currentTime - this.origin;
      if (this.looping) {
        const loop = this.arrangement.sections[this.loopIndex];
        if (loop && songNow >= loop.endTime - 0.012) {
          this.seekTo(loop.startTime);
          return;
        }
      }
      if (songNow >= this.duration - 0.012) {
        this.finish();
        return;
      }
      const loopEnd = this.looping ? this.arrangement.sections[this.loopIndex]?.endTime ?? this.duration : this.duration;
      const horizon = Math.min(songNow + 0.32, loopEnd);
      while (this.cursor < this.events.length && this.events[this.cursor].time < horizon) {
        const event = this.events[this.cursor];
        if (event.time >= songNow - 0.03) this.playEvent(event);
        this.cursor += 1;
      }
      this.position = songNow;
      this.emitProgress(songNow);
    },

    playEvent(event, explicitWhen) {
      const when = explicitWhen != null ? explicitWhen : Math.max(this.ctx.currentTime, this.origin + event.time);
      const song = this.arrangement;
      if (event.kind === "kick") this.kick(when, event.gain);
      else if (event.kind === "snare") this.snare(when, event.gain);
      else if (event.kind === "hat") this.hat(when, event.gain, event.open, song.brightness);
      else if (event.kind === "tom") this.tom(when, event.midi, event.gain);
      else if (event.kind === "crash") this.crash(when, event.gain);
      else if (event.kind === "bass") this.bass(when, event.midi, event.seconds, song.bassTimbre);
      else if (event.kind === "chord") this.chord(when, event.midis, event.seconds, song.chordTimbre, song.brightness);
      else if (event.kind === "lead") this.lead(when, event.midi, event.seconds, song.brightness);
      else if (event.kind === "horn") event.midis.forEach((midi) => this.horn(when, midi, event.seconds, song.brightness));
      else if (event.kind === "string") event.midis.forEach((midi) => this.stringNote(when, midi, event.seconds, song.brightness));
      else if (event.kind === "scratch") this.scratch(when, event.seconds, event.gain);
      else if (event.kind === "sub") this.sub(when, event.midi, event.seconds, event.gain);
    },

    async renderOffline() {
      if (!this.arrangement) throw new Error("Nothing to render.");
      if (this.playing) {
        this.haltTransport(true);
        this.stateHandler(false);
      }
      const backup = {
        ctx: this.ctx,
        noise: this.noise,
        strips: this.strips,
        inputs: this.inputs,
        master: this.master,
        sources: this.sources,
        offlineLimit: this.offlineLimit,
      };
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Ctx) throw new Error("This browser cannot render audio.");
      try {
        const sampleRate = 44100;
        const chunk = 12;
        const preroll = 4.5;
        const totalFrames = Math.ceil((this.duration + 0.45) * sampleRate);
        const holder = new Ctx(2, Math.max(1, totalFrames), sampleRate);
        const buffer = holder.createBuffer(2, totalFrames, sampleRate);
        const mix = [buffer.getChannelData(0), buffer.getChannelData(1)];
        for (let start = 0; start < this.duration - 0.0001; start += chunk) {
          const keep = Math.min(chunk, this.duration - start);
          const last = start + keep >= this.duration - 0.001;
          const windowStart = Math.max(0, start - preroll);
          const windowEnd = start + keep;
          const renderDur = windowEnd - windowStart + (last ? 0.45 : 0.08);
          this.ctx = new Ctx(2, Math.ceil(renderDur * sampleRate), sampleRate);
          this.sources = [];
          this.offlineLimit = renderDur - 0.02;
          this.buildGraph();
          this.events.forEach((event) => {
            if (event.time < windowStart || event.time >= windowEnd) return;
            this.playEvent(event, event.time - windowStart);
          });
          const audio = await this.ctx.startRendering();
          const offset = Math.round((start - windowStart) * sampleRate);
          const dest = Math.round(start * sampleRate);
          const copyFrames = Math.min(
            Math.round((last ? keep + 0.45 : keep) * sampleRate),
            totalFrames - dest,
            Math.max(0, audio.length - offset),
          );
          for (let channel = 0; channel < mix.length; channel += 1) {
            mix[channel].set(audio.getChannelData(Math.min(channel, audio.numberOfChannels - 1)).subarray(offset, offset + copyFrames), dest);
          }
        }
        return buffer;
      } finally {
        this.ctx = backup.ctx;
        this.noise = backup.noise;
        this.strips = backup.strips;
        this.inputs = backup.inputs;
        this.master = backup.master;
        this.sources = backup.sources;
        this.offlineLimit = backup.offlineLimit;
      }
    },

    track(node, startAt, stopAt) {
      const limit = this.offlineLimit || Infinity;
      if (startAt >= limit) return;
      const stop = stopAt ? Math.min(stopAt, limit) : undefined;
      this.sources.push(node);
      node.onended = () => {
        const index = this.sources.indexOf(node);
        if (index >= 0) this.sources.splice(index, 1);
      };
      node.start(startAt);
      if (stop) node.stop(stop);
    },

    noiseBurst(time, dest, { type, freq, q, peak, attack, hold, release, stop }) {
      const ctx = this.ctx;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      if (q) filter.Q.value = q;
      const amp = envGain(ctx, time, peak, attack, hold, release);
      noise.connect(filter);
      filter.connect(amp);
      amp.connect(dest);
      this.track(noise, time, time + stop);
    },

    kick(time, gain) {
      const dest = this.inputs.drums;
      if (!dest) return;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(172, time);
      osc.frequency.exponentialRampToValueAtTime(48, time + 0.1);
      const amp = envGain(ctx, time, 0.86 * gain, 0.003, 0.045, 0.2);
      osc.connect(amp);
      amp.connect(dest);
      this.track(osc, time, time + 0.28);
      this.noiseBurst(time, dest, {
        type: "highpass", freq: 1800, peak: 0.22 * gain, attack: 0.001, hold: 0.004, release: 0.02, stop: 0.04,
      });
    },

    snare(time, gain) {
      const dest = this.inputs.drums;
      if (!dest) return;
      const ctx = this.ctx;
      this.noiseBurst(time, dest, {
        type: "bandpass", freq: 1900, q: 0.8, peak: 0.42 * gain, attack: 0.001, hold: 0.02, release: 0.1, stop: 0.16,
      });
      this.noiseBurst(time, dest, {
        type: "highpass", freq: 4200, peak: 0.16 * gain, attack: 0.001, hold: 0.01, release: 0.06, stop: 0.1,
      });
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(196, time);
      osc.frequency.exponentialRampToValueAtTime(150, time + 0.08);
      const body = envGain(ctx, time, 0.26 * gain, 0.002, 0.02, 0.07);
      osc.connect(body);
      body.connect(dest);
      this.track(osc, time, time + 0.12);
    },

    hat(time, gain, open, brightness) {
      const dest = this.inputs.drums;
      if (!dest) return;
      const ctx = this.ctx;
      const level = gain == null ? 1 : gain;
      const release = open ? 0.18 : 0.035;
      this.noiseBurst(time, dest, {
        type: "highpass",
        freq: 6200 + brightness * 2800,
        peak: (open ? 0.16 : 0.11) * level,
        attack: 0.001,
        hold: 0.006,
        release,
        stop: release + 0.04,
      });
      [7800, 11200].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = freq + brightness * 400;
        const amp = envGain(ctx, time, (open ? 0.018 : 0.012) * level * (index ? 0.6 : 1), 0.001, 0.004, open ? 0.05 : 0.02);
        osc.connect(amp);
        amp.connect(dest);
        this.track(osc, time, time + (open ? 0.08 : 0.04));
      });
    },

    tom(time, midi, gain) {
      const dest = this.inputs.drums;
      if (!dest) return;
      const ctx = this.ctx;
      const pitch = midi || 47;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(midiToFreq(pitch + 8), time);
      osc.frequency.exponentialRampToValueAtTime(midiToFreq(pitch), time + 0.09);
      const amp = envGain(ctx, time, 0.48 * (gain || 0.5), 0.003, 0.04, 0.16);
      osc.connect(amp);
      amp.connect(dest);
      this.track(osc, time, time + 0.24);
      this.noiseBurst(time, dest, {
        type: "bandpass", freq: midiToFreq(pitch + 18), q: 1.2, peak: 0.08 * (gain || 0.5), attack: 0.001, hold: 0.008, release: 0.04, stop: 0.07,
      });
    },

    crash(time, gain) {
      const dest = this.inputs.drums;
      if (!dest) return;
      const ctx = this.ctx;
      const level = gain || 0.5;
      this.noiseBurst(time, dest, {
        type: "highpass", freq: 4800, peak: 0.18 * level, attack: 0.002, hold: 0.05, release: 0.7, stop: 0.9,
      });
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 3100;
      const amp = envGain(ctx, time, 0.02 * level, 0.002, 0.02, 0.2);
      osc.connect(amp);
      amp.connect(dest);
      this.track(osc, time, time + 0.28);
    },

    bass(time, midi, seconds, timbre) {
      const dest = this.inputs.bass;
      if (!dest) return;
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const plucked = timbre === "growl";
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = plucked ? "sawtooth" : "sine";
      osc2.type = plucked ? "triangle" : "triangle";
      osc.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(plucked ? freq * 1.005 : freq * 2, time);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      if (plucked) {
        filter.frequency.setValueAtTime(1400, time);
        filter.frequency.exponentialRampToValueAtTime(140, time + Math.min(0.18, Math.max(0.06, seconds * 0.45)));
        filter.Q.value = 0.9;
      } else {
        filter.frequency.value = 280;
        filter.Q.value = 0.5;
      }
      const amp = envGain(ctx, time, plucked ? 0.22 : 0.38, 0.006, Math.max(0.04, seconds * (plucked ? 0.35 : 0.55)), 0.08);
      const amp2 = envGain(ctx, time, plucked ? 0.08 : 0.06, 0.004, Math.max(0.02, seconds * 0.25), 0.06);
      osc.connect(amp);
      osc2.connect(amp2);
      amp.connect(filter);
      amp2.connect(filter);
      filter.connect(dest);
      const stopAt = time + seconds + 0.1;
      this.track(osc, time, stopAt);
      this.track(osc2, time, stopAt);
      if (!plucked) {
        this.noiseBurst(time, dest, {
          type: "bandpass", freq: 420, q: 1.4, peak: 0.05, attack: 0.001, hold: 0.006, release: 0.03, stop: 0.05,
        });
      }
    },

    chord(time, midis, seconds, timbre, brightness) {
      const song = this.arrangement;
      midis.forEach((midi) => {
        if (this.inputs.bothChords) {
          const electric = (song.drive ?? 0.3) > 0.4 || timbre === "crunch" || timbre === "stab";
          this.guitarNote(time, midi, seconds, timbre === "stab" ? "stab" : electric ? "electric" : "clean", brightness, this.inputs.guitar);
          this.keysNote(time, midi, seconds, song.keysVoice === "organ" ? "organ" : "ep", brightness, this.inputs.keys);
          return;
        }
        const dest = this.inputs.guitar;
        if (timbre === "crunch") this.guitarNote(time, midi, seconds, "electric", brightness, dest);
        else if (timbre === "stab") this.guitarNote(time, midi, seconds, "stab", brightness, dest);
        else if (timbre === "clean") this.guitarNote(time, midi, seconds, "clean", brightness, dest);
        else this.keysNote(time, midi, seconds, song.keysVoice === "organ" && timbre !== "piano" ? "organ" : "ep", brightness, dest);
      });
    },

    guitarNote(time, midi, seconds, voice, brightness, dest) {
      if (!dest) return;
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const electric = voice !== "clean";
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = electric ? "sawtooth" : "triangle";
      osc2.type = electric ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq * (electric ? 1.006 : 2.003), time);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      const open = electric ? 780 + brightness * 1800 : 1700 + brightness * 2400;
      const close = electric ? 380 : 640;
      filter.frequency.setValueAtTime(Math.max(80, open), time);
      filter.frequency.exponentialRampToValueAtTime(close, time + Math.max(0.08, Math.min(seconds, 0.5)));
      filter.Q.value = electric ? 0.85 : 0.55;
      const peak = voice === "stab" ? 0.07 : electric ? 0.085 : 0.1;
      const hold = voice === "stab" ? 0.025 : Math.max(0.03, seconds * 0.38);
      const release = voice === "stab" ? 0.055 : Math.max(0.06, seconds * 0.32);
      const amp = envGain(ctx, time, peak, 0.004, hold, release);
      const amp2 = envGain(ctx, time, peak * (electric ? 0.55 : 0.22), 0.004, hold * 0.6, release);
      osc.connect(amp);
      osc2.connect(amp2);
      amp.connect(filter);
      amp2.connect(filter);
      filter.connect(dest);
      const stop = time + (voice === "stab" ? 0.16 : seconds + 0.1);
      this.track(osc, time, stop);
      this.track(osc2, time, stop);
    },

    keysNote(time, midi, seconds, voice, brightness, dest) {
      if (!dest) return;
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      if (voice === "organ") {
        [[1, 0.07], [2, 0.035], [3, 0.022], [4, 0.012]].forEach(([ratio, peak]) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq * ratio, time);
          const amp = envGain(ctx, time, peak, 0.018, Math.max(0.06, seconds * 0.7), 0.08);
          osc.connect(amp);
          amp.connect(dest);
          this.track(osc, time, time + seconds + 0.1);
        });
        return;
      }
      const osc = ctx.createOscillator();
      const bell = ctx.createOscillator();
      osc.type = "sine";
      bell.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      bell.frequency.setValueAtTime(freq * 2, time);
      const amp = envGain(ctx, time, 0.1, 0.006, Math.max(0.04, seconds * 0.45), 0.16);
      const bellAmp = envGain(ctx, time, 0.045 + brightness * 0.02, 0.004, 0.03, 0.1);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400 + brightness * 2200;
      osc.connect(amp);
      bell.connect(bellAmp);
      amp.connect(filter);
      bellAmp.connect(filter);
      filter.connect(dest);
      const stopAt = time + seconds + 0.18;
      this.track(osc, time, stopAt);
      this.track(bell, time, stopAt);
    },

    lead(time, midi, seconds, brightness) {
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = "triangle";
      osc2.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq, time);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 5.1;
      lfoGain.gain.value = freq * 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900 + brightness * 3600;
      const amp = envGain(ctx, time, 0.16, 0.02, Math.max(0.05, seconds * 0.62), 0.08);
      const amp2 = envGain(ctx, time, 0.05, 0.02, Math.max(0.04, seconds * 0.5), 0.08);
      osc.connect(amp);
      osc2.connect(amp2);
      amp.connect(filter);
      amp2.connect(filter);
      filter.connect(this.inputs.lead);
      const stopAt = time + seconds + 0.1;
      this.track(osc, time, stopAt);
      this.track(osc2, time, stopAt);
      this.track(lfo, time, stopAt);
    },

    horn(time, midi, seconds, brightness) {
      const dest = this.inputs.horns;
      if (!dest) return;
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = "sawtooth";
      osc2.type = "sawtooth";
      osc.frequency.setValueAtTime(freq * 0.94, time);
      osc.frequency.exponentialRampToValueAtTime(freq, time + 0.055);
      osc2.frequency.setValueAtTime(freq * 0.945, time);
      osc2.frequency.exponentialRampToValueAtTime(freq * 1.004, time + 0.055);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(520, time);
      filter.frequency.exponentialRampToValueAtTime(1500 + brightness * 700, time + 0.09);
      filter.Q.value = 0.85;
      const amp = envGain(ctx, time, 0.07, 0.018, Math.max(0.04, seconds * 0.5), 0.09);
      const amp2 = envGain(ctx, time, 0.028, 0.02, Math.max(0.03, seconds * 0.4), 0.07);
      osc.connect(amp);
      osc2.connect(amp2);
      amp.connect(filter);
      amp2.connect(filter);
      filter.connect(dest);
      const stopAt = time + seconds + 0.1;
      this.track(osc, time, stopAt);
      this.track(osc2, time, stopAt);
    },

    stringNote(time, midi, seconds, brightness) {
      const dest = this.inputs.strings;
      if (!dest) return;
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1100 + brightness * 1800;
      filter.connect(dest);
      [[1, "sawtooth", 0.032], [1.004, "sawtooth", 0.02], [0.997, "triangle", 0.018]].forEach(([ratio, type, peak]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq * ratio, time);
        const amp = envGain(ctx, time, peak, 0.12, Math.max(0.08, seconds * 0.62), 0.24);
        osc.connect(amp);
        amp.connect(filter);
        this.track(osc, time, time + seconds + 0.26);
      });
    },

    scratch(time, seconds, gain) {
      if (!this.inputs.dj) return;
      const ctx = this.ctx;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 4;
      filter.frequency.setValueAtTime(420, time);
      filter.frequency.exponentialRampToValueAtTime(2800, time + Math.max(0.05, seconds * 0.55));
      filter.frequency.exponentialRampToValueAtTime(700, time + Math.max(0.08, seconds));
      const amp = envGain(ctx, time, 0.22 * (gain || 0.4), 0.005, Math.max(0.02, seconds * 0.35), 0.05);
      noise.connect(filter);
      filter.connect(amp);
      amp.connect(this.inputs.dj);
      this.track(noise, time, time + seconds + 0.06);
    },

    sub(time, midi, seconds, gain) {
      if (!this.inputs.dj) return;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(midiToFreq(midi), time);
      const amp = envGain(ctx, time, 0.34 * (gain || 0.6), 0.005, Math.max(0.04, seconds * 0.5), 0.08);
      osc.connect(amp);
      amp.connect(this.inputs.dj);
      this.track(osc, time, time + seconds + 0.08);
    },

    animateMeter() {
      const draw = () => {
        if (!this.playing) return;
        this.drawMeter(true);
        this.meterFrame = requestAnimationFrame(draw);
      };
      this.meterFrame = requestAnimationFrame(draw);
    },

    drawMeter(live) {
      const canvas = this.meter;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.clientWidth || 280;
      const height = canvas.clientHeight || 36;
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      const g = canvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      const bars = 18;
      const gap = 4;
      const barWidth = (width - gap * (bars - 1)) / bars;
      let data = null;
      if (live && this.analyser) {
        data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
      }
      for (let i = 0; i < bars; i += 1) {
        const energy = data ? data[i + 1] / 255 : 0.08;
        const h = Math.max(3, energy * (height - 2));
g.fillStyle = live ? "#ff6a45" : "rgba(243,230,214,0.18)";
      const x = i * (barWidth + gap);
      const y = height - h;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, barWidth, h, 2);
      else g.rect(x, y, barWidth, h);
      g.fill();
      }
    },
  };
  return player;
}

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = channels * 2;
  const dataSize = samples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  const data = [];
  for (let channel = 0; channel < channels; channel += 1) data.push(buffer.getChannelData(channel));
  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, data[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}
