/** Synthesized drums, bass, chords, and a lead melody. No samples and no voice. */

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function gridOffsets(count, tempo, swing) {
  const step = 60 / tempo / 4;
  const ratio = 0.5 + Math.max(0, Math.min(1, swing)) * 0.17;
  const offsets = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const pair = Math.floor(i / 2);
    const start = pair * step * 2;
    offsets[i] = i % 2 === 0 ? start : start + step * 2 * ratio;
  }
  return { offsets, loopDur: count * step, step };
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
    stateHandler: () => {},
    noise: null,

    onState(handler) {
      this.stateHandler = handler;
    },

    load(arrangement) {
      this.arrangement = arrangement;
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
      if (!this.arrangement) return;
      this.stop();
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
      const timing = gridOffsets(this.arrangement.loopSteps, this.arrangement.tempo, this.arrangement.swing);
      this.timing = timing;
      this.nextLoop = this.ctx.currentTime + 0.08;
      this.playing = true;
      this.stateHandler(true);
      this.pump(token);
      this.timer = window.setInterval(() => this.pump(token), 25);
      this.animateMeter();
    },

    stop() {
      this.token += 1;
      if (this.timer) window.clearInterval(this.timer);
      this.timer = 0;
      this.sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      });
      this.sources = [];
      const was = this.playing;
      this.playing = false;
      if (was) this.stateHandler(false);
      if (this.meterFrame) cancelAnimationFrame(this.meterFrame);
      this.meterFrame = 0;
      this.drawMeter(false);
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

      ["drums", "bass", "chords", "lead"].forEach((part) => {
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
      if (token !== this.token || !this.ctx) return;
      const horizon = this.ctx.currentTime + 0.28;
      while (this.nextLoop < horizon) {
        this.scheduleLoop(this.nextLoop);
        this.nextLoop += this.timing.loopDur;
      }
    },

    scheduleLoop(start) {
      const song = this.arrangement;
      const { offsets, step } = this.timing;
      const at = (index) => start + offsets[index];
      const dur = (index, length) => {
        const end = index + length;
        if (end < offsets.length) return Math.max(0.05, offsets[end] - offsets[index]);
        return Math.max(0.05, length * step);
      };
      const now = this.ctx.currentTime;
      song.kick.forEach((hit) => {
        const time = at(hit.step);
        if (time >= now) this.kick(time, hit.gain);
      });
      song.snare.forEach((hit) => {
        const time = at(hit.step);
        if (time >= now) this.snare(time, hit.gain);
      });
      song.hat.forEach((hit) => {
        const time = at(hit.step);
        if (time >= now) this.hat(time, hit.gain, hit.open, song.brightness);
      });
      song.bass.forEach((note) => {
        const time = at(note.step);
        if (time >= now) this.bass(time, note.midi, dur(note.step, note.dur), song.bassTimbre);
      });
      song.chords.forEach((note) => {
        const time = at(note.step);
        if (time >= now) this.chord(time, note.midis, dur(note.step, note.dur), song.chordTimbre, song.brightness);
      });
      song.lead.forEach((note) => {
        const time = at(note.step);
        if (time >= now) this.lead(time, note.midi, dur(note.step, note.dur), song.brightness);
      });
    },

    track(node, startAt, stopAt) {
      this.sources.push(node);
      node.onended = () => {
        const index = this.sources.indexOf(node);
        if (index >= 0) this.sources.splice(index, 1);
      };
      node.start(startAt);
      if (stopAt) node.stop(stopAt);
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
