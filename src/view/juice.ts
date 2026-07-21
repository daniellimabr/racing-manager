/**
 * "Juice" (T-106): SFX sintetizados via Web Audio API (sem depender de
 * assets externos — mais simples e sem questão de licença nesta fase
 * greybox) + vibração (Android; iOS web não suporta, silenciosamente
 * ignorado — compensado pelo flash/shake de câmera, chamado direto na
 * RaceScene via this.cameras).
 */

class JuiceEngine {
  private ctx: AudioContext | null = null;

  /** Deve ser chamado a partir de um gesto do usuário (ex.: 1º pointerdown) — política de autoplay dos navegadores. */
  unlock(): void {
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.15): void {
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') return; // ainda não desbloqueado, evita erro no console
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.stop(ctx.currentTime + durationMs / 1000);
  }

  private noiseBurst(durationMs: number, gain = 0.25): void {
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') return;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * (durationMs / 1000)));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(ctx.destination);
    src.start();
  }

  countdownBeep(): void { this.tone(660, 110, 'square', 0.12); }
  go(): void { this.tone(880, 240, 'square', 0.18); }
  perfect(): void { this.tone(1200, 140, 'sine', 0.18); }
  good(): void { this.tone(760, 100, 'sine', 0.12); }
  crash(): void { this.noiseBurst(280, 0.28); }
  click(): void { this.tone(420, 60, 'triangle', 0.1); }
  /** Anúncio de entrada no pit — 2 tons descendentes, distinto dos demais SFX (Claude-Racing.md §2.21). */
  pitEntry(): void {
    this.tone(500, 140, 'square', 0.15);
    setTimeout(() => this.tone(350, 180, 'square', 0.15), 150);
  }

  /** Vibration API — Android apenas; em iOS/desktop sem suporte, é um no-op silencioso. */
  vibrate(pattern: number | number[]): void {
    navigator.vibrate?.(pattern);
  }
}

export const juice = new JuiceEngine();
