import { vi } from "vitest";

type StorageArea = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

function createStorageArea(store: Map<string, unknown>): StorageArea {
  return {
    get: vi.fn(async (key?: string | string[] | null) => {
      if (key == null || key === "") {
        return Object.fromEntries(store.entries());
      }
      if (Array.isArray(key)) {
        const out: Record<string, unknown> = {};
        for (const k of key) {
          if (store.has(k)) out[k] = store.get(k);
        }
        return out;
      }
      if (typeof key === "object") {
        const out: Record<string, unknown> = { ...key };
        for (const k of Object.keys(key)) {
          if (store.has(k)) out[k] = store.get(k);
        }
        return out;
      }
      return store.has(key) ? { [key]: store.get(key) } : {};
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) {
        store.set(k, v);
      }
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) store.delete(k);
    }),
  };
}

export interface ChromeMock {
  syncStore: Map<string, unknown>;
  sessionStore: Map<string, unknown>;
  sendMessage: ReturnType<typeof vi.fn>;
  restore: () => void;
}

/** Install a minimal `chrome` global for unit tests. Returns helpers + restore. */
export function installChromeMock(): ChromeMock {
  const syncStore = new Map<string, unknown>();
  const sessionStore = new Map<string, unknown>();
  const sendMessage = vi.fn(async () => undefined);
  const onChangedListeners = new Set<(changes: unknown, area: string) => void>();

  const chromeMock = {
    storage: {
      sync: createStorageArea(syncStore),
      session: createStorageArea(sessionStore),
      onChanged: {
        addListener: vi.fn((fn: (changes: unknown, area: string) => void) => {
          onChangedListeners.add(fn);
        }),
        removeListener: vi.fn((fn: (changes: unknown, area: string) => void) => {
          onChangedListeners.delete(fn);
        }),
      },
    },
    runtime: {
      sendMessage,
      lastError: undefined as chrome.runtime.LastError | undefined,
    },
  };

  vi.stubGlobal("chrome", chromeMock);

  return {
    syncStore,
    sessionStore,
    sendMessage,
    restore: () => {
      vi.unstubAllGlobals();
      syncStore.clear();
      sessionStore.clear();
      onChangedListeners.clear();
    },
  };
}
