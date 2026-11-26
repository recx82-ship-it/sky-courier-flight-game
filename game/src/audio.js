// Synthesised sound, no audio files: a WebAudio engine hum whose pitch
// follows the throttle, a chime for each ring, a thud for touchdown, a
// noise burst for a crash and a short fanfare for a finished mail run.
// Nothing starts until the first key press or click (browsers require a
// gesture), and M mutes everything. In ?shot= mode it is never created.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: a low sawtooth plus a sub octave, through a low-pass.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 31;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      engineOsc.connect(filter);
      engineOsc2.connect(subGain);
      subGain.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped filtered noise, louder the faster the plane flies.
      const noiseLen = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noise.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  /** A short tone: frequency in Hz, seconds, kind, peak gain, when to start. */
  function tone(freq, seconds, type, gain, when = 0) {
    if (!started || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  /** A burst of noise: seconds, peak gain, low-pass frequency. */
  function noiseBurst(seconds, gain, cutoff) {
    if (!started || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  return {
    /** Call on the first gesture; safe to call again (it is a no-op). */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    /** Continuous engine/wind bed, called every frame while flying. */
    engine(throttle, speed, flying) {
      if (!started) return;
      const t = ctx.currentTime;
      const target = flying && !muted ? 0.05 + throttle * 0.075 : 0;
      engineGain.gain.setTargetAtTime(target, t, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + throttle * 46 + speed * 0.25, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(26 + throttle * 23 + speed * 0.12, t, 0.08);
      windGain.gain.setTargetAtTime(flying && !muted ? Math.max(0, (speed - 30) * 0.0012) : 0, t, 0.1);
    },
    ring() {
      // A rising arpeggio: E5 G5 B5 E6.
      tone(659.25, 0.22, 'sine', 0.22);
      tone(783.99, 0.22, 'sine', 0.22, 0.07);
      tone(987.77, 0.26, 'sine', 0.22, 0.14);
      tone(1318.51, 0.4, 'sine', 0.2, 0.21);
    },
    click() {
      tone(880, 0.07, 'triangle', 0.12);
    },
    thud() {
      noiseBurst(0.25, 0.5, 300);
      tone(70, 0.3, 'sine', 0.4);
    },
    crash() {
      noiseBurst(0.7, 0.7, 900);
      tone(55, 0.6, 'sine', 0.5);
    },
    splash() {
      noiseBurst(0.5, 0.4, 1200);
    },
    fanfare() {
      // C E G C, a little mail-run flourish.
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone(f, 0.5, 'triangle', 0.2, i * 0.12));
      tone(1318.51, 0.7, 'triangle', 0.18, 0.5);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
