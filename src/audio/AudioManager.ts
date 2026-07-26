import { Vector3 } from "@babylonjs/core";
import type { EnemyType } from "../game/gameConfig";
import type { BulletMaterial, SurfaceType } from "../map/createMap";

type SoundKind = "enemyShot" | "hit" | "empty" | "damage" | "regenerate" | "result";
export type ReloadStage = "start" | "magazine" | "complete";

/** Original procedural Web Audio palette; no external recordings are used. */
export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private effectsBus?: GainNode;
  private ambienceBus?: GainNode;
  private effects = 0.78;
  private ambience = 0.18;
  private masterLevel = 0.76;
  private muted = false;
  private paused = false;
  private listenerPosition = Vector3.Zero();
  private ambienceStarted = false;

  start() {
    this.context ??= new AudioContext();
    if (!this.master) {
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 8;
      compressor.ratio.value = 10;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.16;

      this.master = this.context.createGain();
      this.effectsBus = this.context.createGain();
      this.ambienceBus = this.context.createGain();
      this.effectsBus.connect(this.master);
      this.ambienceBus.connect(this.master);
      this.master.connect(compressor).connect(this.context.destination);
      this.applyVolumes();
    }
    void this.context.resume();
    if (!this.ambienceStarted) {
      this.createAmbience();
    }
  }

  setListener(position: Vector3) {
    this.listenerPosition.copyFrom(position);
  }

  setVolumes(master: number, effects: number, ambience: number) {
    this.masterLevel = master;
    this.effects = effects;
    this.ambience = ambience;
    this.muted = master === 0;
    this.applyVolumes();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.applyVolumes(0.04);
  }

  toggleMuted() {
    this.muted = !this.muted;
    this.applyVolumes(0.03);
    return this.muted;
  }

  play(kind: SoundKind, position?: Vector3) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const tones: Record<SoundKind, [number, number, OscillatorType, number]> = {
      enemyShot: [88, 0.12, "sawtooth", 0.16],
      hit: [880, 0.05, "square", 0.075],
      empty: [980, 0.045, "square", 0.08],
      damage: [96, 0.18, "sawtooth", 0.11],
      regenerate: [510, 0.22, "sine", 0.055],
      result: [520, 0.3, "sine", 0.07],
    };
    const [frequency, duration, type, gain] = tones[kind];
    this.playTone(frequency, duration, type, gain, position);
  }

  playEnemyAttack(enemyType: EnemyType, position: Vector3) {
    if (!this.canPlay() || !this.context) {
      return;
    }
    const now = this.context.currentTime;
    switch (enemyType) {
      case "normal":
      case "armoured":
        this.playNoiseBurst(
          0.045,
          1_800,
          "bandpass",
          0.12,
          now,
          position,
        );
        this.playFrequencySweepAt(
          105,
          62,
          0.12,
          0.16,
          "sawtooth",
          now,
          position,
        );
        break;
      case "smg":
        this.playNoiseBurst(
          0.025,
          2_700,
          "highpass",
          0.1,
          now,
          position,
        );
        this.playTone(150, 0.055, "square", 0.09, position);
        break;
      case "shotgun":
        this.playNoiseBurst(
          0.11,
          1_150,
          "lowpass",
          0.24,
          now,
          position,
        );
        this.playFrequencySweepAt(
          74,
          38,
          0.22,
          0.22,
          "sawtooth",
          now,
          position,
        );
        break;
      case "sniper":
        this.playNoiseBurst(
          0.075,
          3_100,
          "highpass",
          0.25,
          now,
          position,
        );
        this.playFrequencySweepAt(
          92,
          32,
          0.28,
          0.25,
          "square",
          now,
          position,
        );
        break;
      case "boss":
        this.playNoiseBurst(
          0.12,
          520,
          "lowpass",
          0.22,
          now,
          position,
        );
        this.playTone(48, 0.3, "sawtooth", 0.24, position);
        break;
    }
  }

  playEnemyWarning(enemyType: EnemyType, position: Vector3) {
    if (
      enemyType !== "sniper"
      || !this.canPlay()
      || !this.context
    ) {
      return;
    }
    const now = this.context.currentTime;
    this.playTone(1_250, 0.12, "sine", 0.08, position);
    this.playTone(1_780, 0.16, "sine", 0.06, position);
    this.playNoiseBurst(
      0.14,
      3_400,
      "highpass",
      0.035,
      now,
      position,
    );
  }

  playFootstep(surface: SurfaceType) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const profiles: Record<SurfaceType, { body: number; filter: number; volume: number }> = {
      asphalt: { body: 82, filter: 780, volume: 0.115 },
      concrete: { body: 96, filter: 1150, volume: 0.105 },
      indoor: { body: 108, filter: 1550, volume: 0.1 },
      metal: { body: 138, filter: 2300, volume: 0.095 },
    };
    const profile = profiles[surface];
    const pitch = 0.94 + Math.random() * 0.12;
    const volume = profile.volume * (0.9 + Math.random() * 0.18);
    this.playNoiseBurst(0.075, profile.filter * pitch, "bandpass", volume);
    this.playTone(profile.body * pitch, 0.065, surface === "metal" ? "triangle" : "sine", volume * 0.55);
  }

  playBotFootstep(position: Vector3) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const distance = Vector3.Distance(position, this.listenerPosition);
    if (distance > 32) {
      return;
    }
    const volume = Math.min(0.045, 0.035 * Math.max(0.25, 1 - distance / 36));
    this.playNoiseBurst(0.065, 920, "bandpass", volume, undefined, position);
    this.playTone(76 + Math.random() * 10, 0.055, "sine", volume * 0.55, position);
  }

  playLanding(surface: SurfaceType, intensity = 1) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const filter = surface === "metal" ? 2100 : surface === "indoor" ? 1250 : 850;
    const volume = Math.min(0.17, 0.11 * intensity);
    this.playNoiseBurst(0.12, filter, "lowpass", volume);
    this.playTone(surface === "metal" ? 120 : 62, 0.11, "sine", volume * 0.9);
  }

  playGunshot(indoors: boolean) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const now = this.context.currentTime;
    this.playNoiseBurst(0.035, 2800, "highpass", 0.32, now);
    this.playFrequencySweep(118, 54, 0.105, 0.25, "sawtooth", now);
    this.playNoiseBurst(0.045, 1700, "bandpass", 0.09, now + 0.018);
    this.playNoiseBurst(
      indoors ? 0.12 : 0.2,
      indoors ? 1350 : 820,
      "lowpass",
      indoors ? 0.15 : 0.11,
      now + (indoors ? 0.035 : 0.055),
    );
  }

  playReload(stage: ReloadStage) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const profile: Record<ReloadStage, [number, number, number]> = {
      start: [430, 0.055, 0.095],
      magazine: [240, 0.09, 0.12],
      complete: [680, 0.06, 0.1],
    };
    const [frequency, duration, volume] = profile[stage];
    this.playNoiseBurst(duration, frequency * 2.5, "bandpass", volume * 0.7);
    this.playTone(frequency, duration, "triangle", volume);
  }

  playSniperShot(indoors: boolean) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const now = this.context.currentTime;
    this.playNoiseBurst(0.055, 3400, "highpass", 0.42, now);
    this.playFrequencySweep(82, 34, 0.2, 0.34, "sawtooth", now);
    this.playTone(46, 0.24, "square", 0.2);
    this.playNoiseBurst(
      indoors ? 0.2 : 0.32,
      indoors ? 1100 : 620,
      "lowpass",
      indoors ? 0.2 : 0.15,
      now + 0.045,
    );
  }

  playSniperImpact(position: Vector3) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const now = this.context.currentTime;
    this.playNoiseBurst(
      0.09,
      1450,
      "bandpass",
      0.18,
      now,
      position,
    );
    this.playTone(118, 0.12, "triangle", 0.12, position);
  }

  playWeaponSwitch() {
    if (!this.canPlay() || !this.context) {
      return;
    }
    this.playNoiseBurst(0.07, 820, "bandpass", 0.08);
    this.playTone(310, 0.06, "triangle", 0.07);
  }

  playImpact(material: BulletMaterial, position?: Vector3) {
    if (!this.canPlay() || !this.context) {
      return;
    }

    const profiles: Record<BulletMaterial, [number, number, BiquadFilterType]> = {
      concrete: [900, 0.045, "bandpass"],
      metal: [2600, 0.075, "highpass"],
      wood: [520, 0.055, "lowpass"],
    };
    const [frequency, duration, filter] = profiles[material];
    this.playNoiseBurst(duration, frequency, filter, 0.07, undefined, position);
    if (material === "metal") {
      this.playTone(1450, 0.055, "triangle", 0.035, position);
    }
  }

  private canPlay() {
    return !this.muted && !this.paused && this.context && this.master && this.effectsBus;
  }

  private applyVolumes(rampSeconds = 0) {
    if (!this.context || !this.master || !this.effectsBus || !this.ambienceBus) {
      return;
    }
    const now = this.context.currentTime;
    const targetMaster = this.muted ? 0.0001 : Math.max(0.0001, this.masterLevel);
    const targetEffects = this.paused ? 0.0001 : Math.max(0.0001, this.effects);
    const targetAmbience = this.paused ? this.ambience * 0.25 : this.ambience;
    for (const [node, value] of [
      [this.master, targetMaster],
      [this.effectsBus, targetEffects],
      [this.ambienceBus, Math.max(0.0001, targetAmbience)],
    ] as Array<[GainNode, number]>) {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(Math.max(0.0001, node.gain.value), now);
      if (rampSeconds <= 0) {
        node.gain.setValueAtTime(value, now);
      } else {
        node.gain.exponentialRampToValueAtTime(value, now + rampSeconds);
      }
    }
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    position?: Vector3,
  ) {
    if (!this.context || !this.effectsBus) {
      return;
    }
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    this.connectEffects(gain, position);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private playFrequencySweep(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    startTime: number,
  ) {
    if (!this.context || !this.effectsBus) {
      return;
    }
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    this.connectEffects(gain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  private playFrequencySweepAt(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    startTime: number,
    position: Vector3,
  ) {
    if (!this.context || !this.effectsBus) {
      return;
    }
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      startTime + duration,
    );
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startTime + duration,
    );
    oscillator.connect(gain);
    this.connectEffects(gain, position);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  private playNoiseBurst(
    duration: number,
    frequency: number,
    filterType: BiquadFilterType,
    volume: number,
    startTime = this.context?.currentTime ?? 0,
    position?: Vector3,
  ) {
    if (!this.context || !this.effectsBus) {
      return;
    }
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = 1 - index / frameCount;
      samples[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = filterType === "bandpass" ? 1.2 : 0.7;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.connect(filter).connect(gain);
    this.connectEffects(gain, position);
    source.start(startTime);
  }

  private connectEffects(source: AudioNode, position?: Vector3) {
    if (!this.context || !this.effectsBus) {
      return;
    }
    if (!position) {
      source.connect(this.effectsBus);
      return;
    }
    const panner = this.context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 3;
    panner.maxDistance = 48;
    panner.rolloffFactor = 1.1;
    panner.positionX.value = position.x - this.listenerPosition.x;
    panner.positionY.value = position.y - this.listenerPosition.y;
    panner.positionZ.value = position.z - this.listenerPosition.z;
    source.connect(panner).connect(this.effectsBus);
  }

  private createAmbience() {
    if (!this.context || !this.ambienceBus) {
      return;
    }
    this.ambienceStarted = true;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 52;
    filter.type = "lowpass";
    filter.frequency.value = 180;
    gain.gain.value = 0.04;
    oscillator.connect(filter).connect(gain).connect(this.ambienceBus);
    oscillator.start();
  }
}
