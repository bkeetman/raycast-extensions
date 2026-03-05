import { LocalStorage } from "@raycast/api";
import { CachedValue } from "../types";

const memoryCache = new Map<string, CachedValue<unknown>>();

function now(): number {
  return Date.now();
}

export function getMemoryCache<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt < now()) {
    memoryCache.delete(key);
    return undefined;
  }

  return entry.value as T;
}

export function setMemoryCache<T>(key: string, value: T, ttlMs: number): void {
  memoryCache.set(key, {
    value,
    expiresAt: now() + ttlMs,
  });
}

export async function getPersistentCache<T>(key: string): Promise<T | undefined> {
  const raw = await LocalStorage.getItem<string>(key);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as CachedValue<T>;
    if (parsed.expiresAt < now()) {
      await LocalStorage.removeItem(key);
      return undefined;
    }

    return parsed.value;
  } catch {
    await LocalStorage.removeItem(key);
    return undefined;
  }
}

export async function setPersistentCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const payload: CachedValue<T> = {
    value,
    expiresAt: now() + ttlMs,
  };
  await LocalStorage.setItem(key, JSON.stringify(payload));
}

export async function withCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, persistent = true): Promise<T> {
  const memory = getMemoryCache<T>(key);
  if (memory !== undefined) {
    return memory;
  }

  if (persistent) {
    const stored = await getPersistentCache<T>(key);
    if (stored !== undefined) {
      setMemoryCache(key, stored, ttlMs);
      return stored;
    }
  }

  const value = await fetcher();
  setMemoryCache(key, value, ttlMs);
  if (persistent) {
    await setPersistentCache(key, value, ttlMs);
  }

  return value;
}

export function clearMemoryCacheByPrefix(prefix: string): void {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}
