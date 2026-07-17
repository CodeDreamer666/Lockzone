export class RunnerAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private effectsBus?: GainNode;
  private musicTimer?: number;
  private musicStep = 0;
  private music = 0.28;
  private effects = 0.66;
  private muted = false;

  configure(music: number, effects: number, muted: boolean) {
    this.music = music;
    this.effects = effects;
    this.muted = muted;
    this.applyVolumes();
  }

  start() {
    try {
      this.context ??= new AudioContext();
      if (!this.master || !this.musicBus || !this.effectsBus) {
        this.master = this.context.createGain();
        this.musicBus = this.context.createGain();
        this.effectsBus = this.context.createGain();
        this.musicBus.connect(this.master);
        this.effectsBus.connect(this.master);
        this.master.connect(this.context.destination);
        this.applyVolumes();
      }
      void this.context.resume();
      if (!this.musicTimer) {
        this.musicTimer = window.setInterval(() => this.playMusicStep(), 420);
      }
    } catch {
      // Browsers can deny audio; the visual feedback remains complete.
    }
  }

  stop() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
  }

  setPaused(paused: boolean) {
    if (!this.musicBus || !this.context) return;
    this.musicBus.gain.setTargetAtTime(paused ? 0.04 : this.music, this.context.currentTime, 0.06);
  }

  setMix(music: number, effects: number, muted: boolean) {
    this.music = music;
    this.effects = effects;
    this.muted = muted;
    this.applyVolumes();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  get isMuted() {
    return this.muted;
  }

  play(kind: "jump" | "slide" | "dash" | "dodge" | "collect" | "near" | "hit" | "fail" | "menu" | "warning") {
    if (!this.context || !this.effectsBus || this.muted) return;
    const profiles: Record<typeof kind, [number, number, OscillatorType, number]> = {
      jump: [420, 0.16, "triangle", 0.12],
      slide: [150, 0.18, "sawtooth", 0.11],
      dash: [78, 0.24, "sawtooth", 0.19],
      dodge: [280, 0.11, "square", 0.09],
      collect: [880, 0.12, "sine", 0.11],
      near: [1240, 0.18, "triangle", 0.13],
      hit: [92, 0.22, "sawtooth", 0.18],
      fail: [68, 0.55, "sawtooth", 0.2],
      menu: [520, 0.12, "triangle", 0.08],
      warning: [180, 0.16, "square", 0.11],
    };
    const [frequency, duration, type, volume] = profiles[kind];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * (kind === "dash" ? 2.2 : 0.7)), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.effectsBus);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private playMusicStep() {
    if (!this.context || !this.musicBus || this.muted) return;
    const notes = [110, 138.59, 164.81, 220, 164.81, 138.59, 123.47, 196];
    const frequency = notes[this.musicStep % notes.length];
    this.musicStep += 1;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.33);
    oscillator.connect(gain).connect(this.musicBus);
    oscillator.start(now);
    oscillator.stop(now + 0.34);
  }

  private applyVolumes() {
    if (!this.master || !this.musicBus || !this.effectsBus) return;
    const multiplier = this.muted ? 0.0001 : 1;
    this.master.gain.value = multiplier;
    this.musicBus.gain.value = Math.max(0.0001, this.music);
    this.effectsBus.gain.value = Math.max(0.0001, this.effects);
  }
}
