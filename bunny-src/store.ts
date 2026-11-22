/*
 * store.ts — DataStore-shaped key/value shim over the scoped bunny storage.
 *
 * The scoped storage is a single persistent JSON document (observable proxy:
 * mutations persist immediately). The desktop plugin persists each record
 * under its own DataStore key, so this shim nests every key under `kv` in the
 * document. A merge-style write would deep-merge new values into old ones,
 * which corrupts exactly the records this plugin rewrites most — session maps
 * with deleted channels, caches with evicted entries — so every rewrite
 * replaces the whole `kv` object at once.
 */

import { pluginStorage } from "./ctx";

/** The raw storage document ({kv, showSafetyNumberOnReady}) — also used by
 *  the settings UI and helpers outside the DataStore shim. */
export const doc: any = pluginStorage;

export const DataStore = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
        return doc?.kv?.[key] as T | undefined;
    },

    async set(key: string, value: unknown): Promise<void> {
        doc.kv = doc.kv ?? {};
        doc.kv[key] = value;
    },

    async del(key: string): Promise<void> {
        if (doc.kv) delete doc.kv[key];
    },
};
