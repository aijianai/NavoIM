const NOTIFICATION_KEY = "navo:im:soundEnabled";
const RATE_LIMIT_MS = 1500;

class NotificationSound {
  private audioCtx: AudioContext | null = null;
  private lastPlayedAt = 0;
  private enabled: boolean;

  constructor() {
    const stored = localStorage.getItem(NOTIFICATION_KEY);
    this.enabled = stored === null ? true : stored === "true";
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    localStorage.setItem(NOTIFICATION_KEY, String(value));
  }

  private ensureCtx(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;
    try {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.audioCtx = new Ctor();
    } catch {
      this.audioCtx = null;
    }
    return this.audioCtx;
  }

  play() {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastPlayedAt < RATE_LIMIT_MS) return;
    this.lastPlayedAt = now;

    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }

    const t0 = ctx.currentTime;
    this.tone(ctx, 880, t0, 0.18, 0.0001);
    this.tone(ctx, 1318.5, t0 + 0.08, 0.22, 0.00005);
  }

  private tone(ctx: AudioContext, freq: number, startAt: number, duration: number, sustainGain: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    const peak = 0.16;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(Math.max(sustainGain, 0.000001), startAt + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  }
}

export const notificationSound = new NotificationSound();
