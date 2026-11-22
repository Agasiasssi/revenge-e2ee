/*
 * store.ts — DataStore-shaped key/value shim over the plugin's jsonStorage.
 *
 * The desktop (Vencord) build of this plugin persists each record under its own
 * DataStore key. Revenge gives plugins a single JSON storage document instead,
 * so this shim nests every key under `kv` in that document and always rewrites
 * the document wholesale (replace mode). A merge-style write would deep-merge
 * new values into old ones, which corrupts exactly the records this plugin
 * rewrites most — session maps with deleted channels, caches with evicted
 * entries.
 */

import type { JsonStorage } from "@revenge-mod/json-storage";

export interface E2EEStorageDoc {
    kv: Record<string, unknown>;
    showSafetyNumberOnReady: boolean;
}

let storage: JsonStorage<E2EEDoc> | null = null;

export function initStore(s: JsonStorage<E2EEDoc>): void {
    storage = s;
}

function storageOrThrow(): JsonStorage<E2EEDoc> {
    if (!storage) throw new Error("E2EE storage not initialised yet");
    return storage;
}

export const DataStore = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
        const doc = await storageOrThrow().get();
        return doc?.kv?.[key] as T | undefined;
    },

    async set(key: string, value: unknown): Promise<void> {
        const s = storageOrThrow();
        const doc = await s.get();
        await s.set({ ...doc, kv: { ...(doc.kv ?? {}), [key]: value } } as E2EEDoc, true as never);
    },

    async del(key: string): Promise<void> {
        const s = storageOrThrow();
        const doc = await s.get();
        const kv = { ...(doc.kv ?? {}) };
        delete kv[key];
        await s.set({ ...doc, kv } as E2EEDoc, true as never);
    },
};
