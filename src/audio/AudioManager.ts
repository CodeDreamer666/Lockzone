import { Vector3 } from "@babylonjs/core";

type SoundKind = "shot" | "enemyShot" | "hit" | "reload" | "empty" | "damage" | "regenerate" | "footstep" | "result";

/** Small synthesized sound palette. It starts only after the Start button click. */
export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private effects = 0.72;
  private ambience = 0.18;
  private muted = false;
  private listenerPosition = Vector3.Zero();
  private ambienceStarted = false;

  start() {
    this.context ??= new AudioContext();
    this.master ??= this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.context.destination);
    void this.context.resume();
    if (!this.ambienceStarted) this.createAmbience();
  }
  setListener(position: Vector3) { this.listenerPosition.copyFrom(position); }
  setVolumes(master: number, effects: number, ambience: number) { this.muted = master === 0; if (this.master) this.master.gain.value = master; this.effects = effects; this.ambience = ambience; }
  toggleMuted() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.7; return this.muted; }
  play(kind: SoundKind, position?: Vector3) {
    if (this.muted || !this.context || !this.master) return;
    const tones: Record<SoundKind, [number, number, OscillatorType]> = {
      shot: [105, 0.08, "sawtooth"], enemyShot: [82, 0.09, "sawtooth"], hit: [880, 0.05, "square"], reload: [240, 0.09, "triangle"], empty: [440, 0.04, "square"], damage: [105, 0.18, "sawtooth"], regenerate: [510, 0.22, "sine"], footstep: [120, 0.045, "triangle"], result: [520, 0.3, "sine"],
    };
    const [baseFrequency, duration, type] = tones[kind];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.value = baseFrequency * (0.93 + Math.random() * 0.14);
    gain.gain.setValueAtTime(this.effects * 0.075, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain);
    this.connectSpatial(gain, position);
    oscillator.start(); oscillator.stop(this.context.currentTime + duration);
  }
  private connectSpatial(source: AudioNode, position?: Vector3) {
    if (!position || !this.context || !this.master) { source.connect(this.master!); return; }
    const panner = this.context.createPanner();
    panner.panningModel = "HRTF"; panner.distanceModel = "inverse"; panner.refDistance = 3; panner.maxDistance = 42; panner.rolloffFactor = 1.1;
    panner.positionX.value = position.x - this.listenerPosition.x; panner.positionY.value = position.y - this.listenerPosition.y; panner.positionZ.value = position.z - this.listenerPosition.z;
    source.connect(panner).connect(this.master);
  }
  private createAmbience() {
    if (!this.context || !this.master) return; this.ambienceStarted = true;
    const oscillator = this.context.createOscillator(); const gain = this.context.createGain(); oscillator.type = "sine"; oscillator.frequency.value = 55; gain.gain.value = this.ambience * 0.025; oscillator.connect(gain).connect(this.master); oscillator.start();
  }
}
