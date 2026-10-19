/** Synthesized drums, bass, chords, and a lead melody. No samples and no voice. */

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

function makeNoise(ctx) {
  const length = ctx.sampleRate * 1;
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
    mutes: { drums: false, bass: false, chords: false, lead: false },
    partGain: {},
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

    setMute(part, muted) {
      this.mutes[part] = muted;
      const gain = this.partGain[part];
      if (gain && this.ctx) {
        gain.gain.setTargetAtTime(muted ? 0.0001 : 1, this.ctx.currentTime, 0.02);
      }
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
      const master = ctx.createGain();
      master.gain.value = 0.8;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 3.2;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.22;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 64;
      master.connect(compressor);
      compressor.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      ["drums", "bass", "chords", "lead", "horns", "dj", "strings"].forEach((part) => {
        const optional = part === "horns" || part === "dj" || part === "strings";
        const key = part === "strings" ? "strings" : part;
        if (optional && !(this.arrangement?.[key] || []).length) return;
        const gain = ctx.createGain();
        gain.gain.value = this.mutes[part] ? 0.0001 : 1;
        gain.connect(master);
        this.partGain[part] = gain;
      });

      const drive = this.arrangement?.drive ?? 0.3;
      this.bassIn = this.coloredBus(this.partGain.bass, 240 + drive * 500, drive > 0.55);
      this.chordIn = this.coloredBus(this.partGain.chords, 900 + (this.arrangement?.brightness ?? 0.5) * 2200, false);
      this.leadIn = this.coloredBus(this.partGain.lead, 700 + (this.arrangement?.brightness ?? 0.5) * 3800, false);
      this.drumIn = this.partGain.drums;
      this.hornIn = this.partGain.horns ? this.bandBus(this.partGain.horns, 900 + (this.arrangement?.brightness ?? 0.5) * 900) : null;
      this.djIn = this.partGain.dj || null;
      this.stringIn = this.partGain.strings ? this.coloredBus(this.partGain.strings, 1400 + (this.arrangement?.brightness ?? 0.5) * 1800, false) : null;
    },

    bandBus(destination, center) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = center;
      filter.Q.value = 0.9;
      filter.connect(destination);
      return filter;
    },

    coloredBus(destination, cutoff, shape) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      filter.Q.value = 0.7;
      if (shape) {
        const shaper = makeShaper(this.ctx, this.arrangement?.drive ?? 0.6);
        shaper.connect(filter);
        filter.connect(destination);
        return shaper;
      }
      filter.connect(destination);
      return filter;
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
        partGain: this.partGain,
        drumIn: this.drumIn,
        bassIn: this.bassIn,
        chordIn: this.chordIn,
        leadIn: this.leadIn,
        hornIn: this.hornIn,
        djIn: this.djIn,
        stringIn: this.stringIn,
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
        this.partGain = backup.partGain;
        this.drumIn = backup.drumIn;
        this.bassIn = backup.bassIn;
        this.chordIn = backup.chordIn;
        this.leadIn = backup.leadIn;
        this.hornIn = backup.hornIn;
        this.djIn = backup.djIn;
        this.stringIn = backup.stringIn;
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

    kick(time, gain) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(168, time);
      osc.frequency.exponentialRampToValueAtTime(46, time + 0.09);
      const amp = envGain(ctx, time, 0.9 * gain, 0.004, 0.05, 0.18);
      osc.connect(amp);
      amp.connect(this.drumIn);
      this.track(osc, time, time + 0.26);
    },

    snare(time, gain) {
      const ctx = this.ctx;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1400;
      const amp = envGain(ctx, time, 0.55 * gain, 0.002, 0.03, 0.12);
      noise.connect(filter);
      filter.connect(amp);
      amp.connect(this.drumIn);
      this.track(noise, time, time + 0.18);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 190;
      const body = envGain(ctx, time, 0.28 * gain, 0.002, 0.02, 0.08);
      osc.connect(body);
      body.connect(this.drumIn);
      this.track(osc, time, time + 0.14);
    },

    hat(time, gain, open, brightness) {
      const ctx = this.ctx;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 5000 + brightness * 3500;
      const release = open ? 0.16 : 0.04;
      const amp = envGain(ctx, time, open ? 0.2 : 0.13, 0.001, 0.008, release);
      noise.connect(filter);
      filter.connect(amp);
      amp.connect(this.drumIn);
      this.track(noise, time, time + release + 0.04);
    },

    bass(time, midi, seconds, timbre) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = timbre === "growl" ? "sawtooth" : "sine";
      osc2.type = "triangle";
      const freq = midiToFreq(midi);
      osc.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq, time);
      const amp = envGain(ctx, time, timbre === "growl" ? 0.28 : 0.42, 0.008, Math.max(0.04, seconds * 0.55), 0.08);
      const amp2 = envGain(ctx, time, 0.08, 0.008, Math.max(0.04, seconds * 0.4), 0.06);
      osc.connect(amp);
      osc2.connect(amp2);
      amp.connect(this.bassIn);
      amp2.connect(this.bassIn);
      const stopAt = time + seconds + 0.1;
      this.track(osc, time, stopAt);
      this.track(osc2, time, stopAt);
    },

    chord(time, midis, seconds, timbre, brightness) {
      midis.forEach((midi) => {
        if (timbre === "crunch") this.crunchNote(time, midi, seconds);
        else if (timbre === "stab") this.stabNote(time, midi, brightness);
        else if (timbre === "clean") this.pluckNote(time, midi, seconds, brightness);
        else this.padNote(time, midi, seconds, timbre, brightness);
      });
    },

    crunchNote(time, midi, seconds) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(midiToFreq(midi), time);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(420, time);
      filter.frequency.exponentialRampToValueAtTime(1400, time + 0.04);
      filter.frequency.exponentialRampToValueAtTime(500, time + Math.min(0.2, seconds));
      const shaper = makeShaper(ctx, 0.8);
      const amp = envGain(ctx, time, 0.11, 0.005, Math.max(0.03, seconds * 0.45), 0.06);
      osc.connect(filter);
      filter.connect(shaper);
      shaper.connect(amp);
      amp.connect(this.partGain.chords);
      this.track(osc, time, time + seconds + 0.08);
    },

    stabNote(time, midi, brightness) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(midiToFreq(midi), time);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900 + brightness * 1400;
      filter.Q.value = 2.4;
      const amp = envGain(ctx, time, 0.09, 0.004, 0.03, 0.07);
      osc.connect(filter);
      filter.connect(amp);
      amp.connect(this.chordIn);
      this.track(osc, time, time + 0.14);
    },

    pluckNote(time, midi, seconds, brightness) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(midiToFreq(midi), time);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800 + brightness * 2000, time);
      filter.frequency.exponentialRampToValueAtTime(700, time + seconds);
      const amp = envGain(ctx, time, 0.12, 0.005, 0.04, Math.max(0.08, seconds * 0.5));
      osc.connect(filter);
      filter.connect(amp);
      amp.connect(this.chordIn);
      this.track(osc, time, time + seconds + 0.12);
    },

    padNote(time, midi, seconds, timbre, brightness) {
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = "sine";
      osc2.type = timbre === "piano" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq * (timbre === "rhodes" ? 2 : 1), time);
      const peak = timbre === "piano" ? 0.1 : 0.08;
      const amp = envGain(ctx, time, peak, timbre === "piano" ? 0.008 : 0.02, seconds * 0.55, 0.18);
      const amp2 = envGain(ctx, time, peak * (timbre === "rhodes" ? 0.18 : 0.35), 0.01, seconds * 0.3, 0.12);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 800 + brightness * 2600;
      osc.connect(amp);
      osc2.connect(amp2);
      amp.connect(filter);
      amp2.connect(filter);
      filter.connect(this.chordIn);
      const stopAt = time + seconds + 0.2;
      this.track(osc, time, stopAt);
      this.track(osc2, time, stopAt);
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
      filter.connect(this.leadIn);
      const stopAt = time + seconds + 0.1;
      this.track(osc, time, stopAt);
      this.track(osc2, time, stopAt);
      this.track(lfo, time, stopAt);
    },

    horn(time, midi, seconds, brightness) {
      if (!this.hornIn) return;
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = "sawtooth";
      osc2.type = "square";
      osc.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq * 1.004, time);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(700, time);
      filter.frequency.exponentialRampToValueAtTime(1400 + brightness * 800, time + 0.08);
      filter.Q.value = 0.8;
      const amp = envGain(ctx, time, 0.08, 0.02, Math.max(0.04, seconds * 0.5), 0.08);
      const amp2 = envGain(ctx, time, 0.03, 0.02, Math.max(0.03, seconds * 0.4), 0.06);
      osc.connect(amp);
      osc2.connect(amp2);
      amp.connect(filter);
      amp2.connect(filter);
      filter.connect(this.hornIn);
      const stopAt = time + seconds + 0.1;
      this.track(osc, time, stopAt);
      this.track(osc2, time, stopAt);
    },

    stringNote(time, midi, seconds, brightness) {
      if (!this.stringIn) return;
      const ctx = this.ctx;
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc.type = "sawtooth";
      osc2.type = "triangle";
      osc.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq * 1.006, time);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900 + brightness * 1600;
      const amp = envGain(ctx, time, 0.045, 0.08, Math.max(0.08, seconds * 0.62), 0.2);
      const amp2 = envGain(ctx, time, 0.02, 0.09, Math.max(0.06, seconds * 0.5), 0.18);
      osc.connect(amp);
      osc2.connect(amp2);
      amp.connect(filter);
      amp2.connect(filter);
      filter.connect(this.stringIn);
      const stopAt = time + seconds + 0.22;
      this.track(osc, time, stopAt);
      this.track(osc2, time, stopAt);
    },

    scratch(time, seconds, gain) {
      if (!this.djIn) return;
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
      amp.connect(this.djIn);
      this.track(noise, time, time + seconds + 0.06);
    },

    sub(time, midi, seconds, gain) {
      if (!this.djIn) return;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(midiToFreq(midi), time);
      const amp = envGain(ctx, time, 0.34 * (gain || 0.6), 0.005, Math.max(0.04, seconds * 0.5), 0.08);
      osc.connect(amp);
      amp.connect(this.djIn);
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
