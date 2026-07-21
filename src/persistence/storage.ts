/**
 * Wrapper próprio de leitura/escrita local (E-205, ver CLAUDE.md §6.2 /
 * Claude-Tech.md §3 — "persistência local até o M2, sem backend"). Nenhuma
 * chamada a `localStorage` deveria acontecer fora deste arquivo — é o mesmo
 * princípio já usado em `src/telemetry/analytics.ts` (trocar de fornecedor
 * sem tocar o resto do código).
 *
 * Fallback em memória: `localStorage` pode não existir (harness/testes rodam
 * em Node, sem DOM) ou pode lançar (Safari em modo privado, quota, etc.) — em
 * qualquer um desses casos, cai para um `Map` em memória do processo, para o
 * jogo continuar funcionando (só sem persistir entre recarregamentos).
 */

const KEY_PREFIX = 'racingManager:';

const memoryFallback = new Map<string, string>();

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readRaw(key: string): string | null {
  const fullKey = KEY_PREFIX + key;
  if (hasLocalStorage()) {
    try {
      return localStorage.getItem(fullKey);
    } catch {
      // cai para o fallback abaixo
    }
  }
  return memoryFallback.get(fullKey) ?? null;
}

function writeRaw(key: string, value: string): void {
  const fullKey = KEY_PREFIX + key;
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(fullKey, value);
      return;
    } catch {
      // cai para o fallback abaixo (ex.: quota estourada, modo privado)
    }
  }
  memoryFallback.set(fullKey, value);
}

function removeRaw(key: string): void {
  const fullKey = KEY_PREFIX + key;
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(fullKey);
    } catch {
      // ignora
    }
  }
  memoryFallback.delete(fullKey);
}

/** Lê e faz `JSON.parse` de uma chave; retorna `fallback` se ausente ou corrompida. */
export function loadJSON<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[storage] valor corrompido em "${key}", usando fallback`);
    return fallback;
  }
}

/** Serializa e grava uma chave. */
export function saveJSON<T>(key: string, value: T): void {
  writeRaw(key, JSON.stringify(value));
}

export function clear(key: string): void {
  removeRaw(key);
}
