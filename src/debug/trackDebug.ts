/**
 * Render de debug do traçado (T-003) — canvas simples, sem Phaser.
 * Único propósito: conferir visualmente a curadoria de curvas de uma pista
 * (tracks/*.json) antes de investir na view de verdade (Sprint 2, T-101+).
 */
import spa from '../../tracks/spa.json';
import interlagos from '../../tracks/interlagos.json';
import type { TrackDef } from '../core/types.js';

// ?track=interlagos pra conferir uma pista específica (sessão 15) sem precisar
// editar este arquivo toda vez — default spa, mesmo comportamento de sempre.
const TRACKS: Record<string, unknown> = { spa, interlagos };
const trackId = new URLSearchParams(location.search).get('track') ?? 'spa';
const track = (TRACKS[trackId] ?? spa) as unknown as TrackDef;

const canvas = document.getElementById('debug-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const PADDING = 40;
const size = Math.min(canvas.width, canvas.height) - PADDING * 2;
const offsetX = (canvas.width - size) / 2;
const offsetY = (canvas.height - size) / 2;

function toScreen(p: { x: number; y: number }): [number, number] {
  return [offsetX + p.x * size, offsetY + p.y * size];
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // título
  ctx.fillStyle = '#eee';
  ctx.font = '16px system-ui';
  ctx.fillText(`${track.name} — ${track.corners.length} desafios curados`, 12, 24);

  // traçado (loop fechado)
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  track.path.forEach((p, i) => {
    const [x, y] = toScreen(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const [x0, y0] = toScreen(track.path[0]);
  ctx.lineTo(x0, y0);
  ctx.stroke();

  // linha de largada/chegada (entre o último e o primeiro ponto)
  const last = track.path[track.path.length - 1];
  const [lx, ly] = toScreen(last);
  ctx.strokeStyle = '#4caf50';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(x0, y0);
  ctx.stroke();

  // marcador do pit
  const pitPoint = track.path[track.pitPathIndex];
  const [px, py] = toScreen(pitPoint);
  ctx.fillStyle = '#2196f3';
  ctx.beginPath();
  ctx.arc(px, py, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9cd0ff';
  ctx.font = '11px system-ui';
  ctx.fillText('PIT', px + 12, py + 4);

  // marcadores das curvas curadas
  track.corners.forEach((corner, i) => {
    const point = track.path[corner.pathIndex];
    const [x, y] = toScreen(point);

    ctx.fillStyle = '#e91e63';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#eee';
    ctx.font = '11px system-ui';
    const labelY = i % 2 === 0 ? y - 14 : y + 20;
    ctx.fillText(`${i + 1}. ${corner.name}`, x + 14, labelY);
  });

  // marcos sem desafio (landmarks — sessão 18: Blanchimont, Kemmel Straight etc.)
  for (const landmark of track.landmarks ?? []) {
    const point = track.path[landmark.pathIndex];
    const [x, y] = toScreen(point);

    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#aaa';
    ctx.font = '10px system-ui';
    ctx.fillText(landmark.name, x + 10, y - 10);
  }

  // legenda
  ctx.fillStyle = '#888';
  ctx.font = '11px system-ui';
  ctx.fillText(
    `${track.laps} voltas · pit obrigatório ao fim da volta ${track.pitAfterLap}`,
    12,
    canvas.height - 12
  );
}

draw();
