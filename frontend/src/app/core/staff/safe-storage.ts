const memoryFallback = new Map<string, string>();

/**
 * Reads from `localStorage` when available, falling back to an in-memory map
 * in restricted or non-browser test environments.
 */
export function safeGetStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage.getItem(key);
    }
  } catch {
    // Ignore storage access errors (private browsing / restricted environments).
  }
  return memoryFallback.get(key) ?? null;
}

export function safeSetStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Ignore storage access errors.
  }
  memoryFallback.set(key, value);
}

export function safeClearStorage(): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }
  } catch {
    // Ignore storage access errors.
  }
  memoryFallback.clear();
}
