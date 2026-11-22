/*
 * compress.ts — DEFLATE wrappers used to shrink message plaintext before it is
 * encrypted (protocol v2).
 *
 * Revenge port: Hermes has no CompressionStream/DecompressionStream, so raw
 * DEFLATE is provided by fflate's streaming Deflate/Inflate classes, which
 * process UNWRAPPED (raw) DEFLATE streams — fflate's `deflateSync` convenience
 * function emits zlib format, which the v2 wire format does not use. The
 * public API matches the desktop (Vencord) build, which uses web streams; the
 * wire format (raw DEFLATE) is identical either way.
 *
 * Compression happens INSIDE the AEAD: we compress the plaintext, then encrypt
 * the result. Doing it the other way round would be pointless (ciphertext is
 * incompressible) and doing it outside the AEAD would leave the compressed
 * bytes unauthenticated.
 */

import { Deflate, Inflate } from "fflate";

/** The only format we emit or accept. Encoded implicitly by the v2 frame flag. */
export const COMPRESSION_FORMAT = "deflate-raw";

let supported: boolean | null = null;
export function compressionAvailable(): boolean {
    if (supported !== null) return supported;
    try {
        // Prove the codec actually round-trips once before claiming support.
        const probe = new Uint8Array([1, 2, 3, 1, 2, 3, 1, 2, 3]);
        supported = bytesEqualLocal(fflateInflate(fflateDeflate(probe)), probe);
    } catch {
        supported = false;
    }
    return supported;
}

/** Test seam: forget the memoised probe result. */
export function resetCompressionProbe(): void {
    supported = null;
}

function bytesEqualLocal(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function concatLocal(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

/**
 * fflate's stream callbacks deliver (data, final) on success but
 * (errorObject, null, final) on failure — detect errors by type.
 */
function consumeChunks(): { ondata: (a: unknown, f?: unknown, e?: unknown) => void; result(): Uint8Array } {
    let acc: Uint8Array | null = null;
    let error: Error | null = null;
    return {
        ondata(a) {
            if (a instanceof Uint8Array) {
                acc = acc ? concatLocal(acc, a) : a;
            } else if (a) {
                error = new Error(`fflate error ${String((a as { code?: number }).code ?? a)}`);
            }
        },
        result(): Uint8Array {
            if (error) throw error;
            if (!acc) throw new Error("fflate produced no output");
            return acc;
        },
    };
}

function fflateDeflate(input: Uint8Array): Uint8Array {
    const sink = consumeChunks();
    const d = new Deflate();
    d.ondata = sink.ondata as never;
    d.push(input, true);
    const out = sink.result();
    const err = (d as unknown as { err?: number }).err;
    if (typeof err === "number" && err !== 0) throw new Error(`fflate deflate error ${err}`);
    return out;
}

function fflateInflate(input: Uint8Array): Uint8Array {
    const sink = consumeChunks();
    const i = new Inflate();
    i.ondata = sink.ondata as never;
    i.push(input, true);
    const out = sink.result();
    const err = (i as unknown as { err?: number }).err;
    if (typeof err === "number" && err !== 0) throw new Error(`fflate inflate error ${err}`);
    return out;
}

/** Raw DEFLATE. Rejects if the platform lacks support. */
export async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
    return fflateDeflate(input);
}

/** Raw INFLATE. Rejects on truncated or corrupt input. */
export async function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
    return fflateInflate(input);
}
