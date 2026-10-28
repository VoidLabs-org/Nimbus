import { useSyncExternalStore } from "react";

/** A choice kept in browser storage (in the Desktop app, on this computer), shared by every component that reads it. */
export type StoredChoice<T extends string> = {
  /** The stored choice, or the default when there is none or storage can't be read. */
  read: () => T;
  /** Stores a choice; with blocked storage (private window, quota) it lasts until the page closes. */
  write: (value: T) => void;
  /** The choice and a way to change it, read on the first render; a change shows everywhere at once. */
  useChoice: () => [T, (value: T) => void];
  /** Forgets the choice held in memory, so the next read comes from storage. For tests. */
  reset: () => void;
};

/**
 * A choice kept under `key`: what `parse` makes of the stored text, `fallback` when storage can't be read. Components
 * using it change together, even when storage is blocked and the choice is only held here, and follow a change made in
 * another tab or window.
 */
export function storedChoice<T extends string>(
  key: string,
  parse: (raw: string | null) => T,
  fallback: T,
): StoredChoice<T> {
  function read(): T {
    try {
      return parse(localStorage.getItem(key));
    } catch {
      return fallback;
    }
  }

  function write(value: T) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Blocked storage: the choice lasts until the page closes.
    }
  }

  const listeners = new Set<() => void>();
  let current: T | null = null;

  const snapshot = () => (current ??= read());

  function subscribe(listener: () => void) {
    listeners.add(listener);
    // Another tab or window changed it.
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        current = read();
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function set(value: T) {
    current = value;
    write(value);
    listeners.forEach((listener) => listener());
  }

  return {
    read,
    write,
    useChoice: () => [useSyncExternalStore(subscribe, snapshot, () => fallback), set],
    reset: () => {
      current = null;
    },
  };
}
