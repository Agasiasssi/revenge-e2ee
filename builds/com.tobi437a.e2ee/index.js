(() => {
  // node_modules/@noble/hashes/_u64.js
  var fromNumH = (n) => n / 2 ** 32 | 0;
  var fromNumL = (n) => n >>> 0;
  function setU64FromNum(view, byteOffset, n, isLE) {
    const h = fromNumH(n);
    const l = fromNumL(n);
    view.setUint32(byteOffset, isLE ? l : h, isLE);
    view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
  }

  // node_modules/@noble/hashes/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
  }
  var atitle = (title) => title ? `"${title}" ` : "";
  function anumber(n, title = "") {
    if (typeof n !== "number")
      throw new TypeError(atitle(title) + "expected number, got " + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
    return n;
  }
  function abytes(value, length, title = "") {
    if (isBytes(value) && (length === undefined || value.length === length))
      return value;
    if (length !== undefined)
      anumber(length, "length");
    const bytes = isBytes(value);
    const ofLen = length !== undefined ? ` of length ${length}` : "";
    const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  function ahash(h) {
    if (typeof h !== "function" || typeof h.create !== "function")
      throw new TypeError("expected hash wrapped by utils.createHasher");
    anumber(h.outputLen);
    anumber(h.blockLen);
    if (h.outputLen < 1 || h.blockLen < 1)
      throw new Error("hash blockLen / outputLen must be >= 1");
  }
  var aobject = (value, label) => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
  };
  var aopts = (value, label) => {
    aobject(value, label);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      throw new TypeError(`"${label}" expected plain object`);
    if (Object.hasOwn(value, "__proto__"))
      throw new TypeError(`"${label}.__proto__" is not allowed`);
  };
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("hash was destroyed");
    if (checkFinished && instance.finished)
      throw new Error("digest() was already called");
  }
  function aoutput(out, instance) {
    abytes(out, undefined, "output");
    const min = instance.outputLen;
    if (!(out.length >= min)) {
      throw new RangeError('"output" expected length >= ' + min);
    }
  }
  function clean(...arrays) {
    for (let i = 0;i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function rotr(word, shift) {
    return word << 32 - shift | word >>> shift;
  }
  var hasHexBuiltin = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function")();
  var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  function bytesToHex(bytes) {
    abytes(bytes);
    if (hasHexBuiltin)
      return bytes.toHex();
    let hex = "";
    for (let i = 0;i < bytes.length; i++) {
      hex += hexes[bytes[i]];
    }
    return hex;
  }
  function asciiToBase16(ch) {
    return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - (65 - 10) : ch >= 97 && ch <= 102 ? ch - (97 - 10) : undefined;
  }
  function hexToBytes(hex) {
    if (typeof hex !== "string")
      throw new TypeError("hex string expected, got " + typeof hex);
    if (hasHexBuiltin) {
      try {
        return Uint8Array.fromHex(hex);
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new RangeError(error.message);
        throw error;
      }
    }
    const hl = hex.length;
    const al = hl / 2;
    if (hl % 2)
      throw new RangeError("hex string expected, got unpadded hex of length " + hl);
    const array = new Uint8Array(al);
    for (let ai = 0, hi = 0;ai < al; ai++, hi += 2) {
      const n1 = asciiToBase16(hex.charCodeAt(hi));
      const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
      if (n1 === undefined || n2 === undefined) {
        const char = hex[hi] + hex[hi + 1];
        throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
      }
      array[ai] = n1 * 16 + n2;
    }
    return array;
  }
  function utf8ToBytes(str) {
    if (typeof str !== "string")
      throw new TypeError("string expected");
    const encoded = new TextEncoder().encode(str);
    try {
      return new Uint8Array(encoded);
    } finally {
      clean(encoded);
    }
  }
  function kdfInputToBytes(data, errorTitle = "") {
    if (typeof data === "string")
      return utf8ToBytes(data);
    return abytes(data, undefined, errorTitle);
  }
  function checkOpts(defaults, opts, title = "opts") {
    aopts(defaults, "defaults");
    if (opts !== undefined)
      aopts(opts, title);
    const merged = Object.assign(Object.create(null), defaults, opts);
    return merged;
  }
  function createHasher(hashCons, info = {}) {
    if (typeof hashCons !== "function")
      throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
    info = checkOpts({}, info, "info");
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(undefined);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.canXOF = tmp.canXOF;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  function randomBytes(bytesLength = 32) {
    anumber(bytesLength, "bytesLength");
    const cr = typeof globalThis === "object" ? globalThis.crypto : null;
    if (typeof cr?.getRandomValues !== "function")
      throw new Error("crypto.getRandomValues must be defined");
    if (bytesLength > 65536)
      throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
    return cr.getRandomValues(new Uint8Array(bytesLength));
  }
  var oidNist = (suffix) => ({
    oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
  });

  // node_modules/@noble/hashes/_md.js
  function Chi(a, b, c) {
    return a & b ^ ~a & c;
  }
  function Maj(a, b, c) {
    return a & b ^ a & c ^ b & c;
  }

  class HashMD {
    blockLen;
    outputLen;
    canXOF = false;
    padOffset;
    isLE;
    buffer;
    view;
    finished = false;
    length = 0;
    pos = 0;
    destroyed = false;
    constructor(blockLen, outputLen, padOffset, isLE) {
      this.blockLen = blockLen;
      this.outputLen = outputLen;
      this.padOffset = padOffset;
      this.isLE = isLE;
      this.buffer = new Uint8Array(blockLen);
      this.view = createView(this.buffer);
    }
    update(data) {
      aexists(this);
      abytes(data);
      const { view, buffer, blockLen } = this;
      const len = data.length;
      let processed = false;
      for (let pos = 0;pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        if (take === blockLen) {
          const dataView = createView(data);
          for (;blockLen <= len - pos; pos += blockLen)
            this.process(dataView, pos);
          processed = true;
          continue;
        }
        buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
        this.pos += take;
        pos += take;
        if (this.pos === blockLen) {
          this.process(view, 0);
          this.pos = 0;
          processed = true;
        }
      }
      this.length += data.length;
      if (processed)
        this.roundClean();
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { buffer, view, blockLen, isLE } = this;
      let { pos } = this;
      buffer[pos++] = 128;
      buffer.fill(0, pos);
      if (this.padOffset > blockLen - pos) {
        this.process(view, 0);
        buffer.fill(0);
      }
      setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
      this.process(view, 0);
      this.roundClean();
      const oview = out === buffer ? view : createView(out);
      const len = this.outputLen;
      const outLen = len / 4;
      const state = this.get();
      if (len % 4 || outLen > state.length)
        throw new Error("invalid outputLen");
      for (let i = 0;i < outLen; i++)
        oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
      const { buffer, outputLen } = this;
      this.digestInto(buffer);
      const res = buffer.slice(0, outputLen);
      this.destroy();
      return res;
    }
    _cloneIntoMeta(to) {
      const { buffer, length, finished, destroyed, pos } = this;
      to.destroyed = destroyed;
      to.finished = finished;
      to.length = length;
      to.pos = pos;
      if (pos)
        to.buffer.set(buffer);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
  }
  var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);

  // node_modules/@noble/hashes/sha2.js
  var SHA256_K = /* @__PURE__ */ Uint32Array.from([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var SHA256_W = /* @__PURE__ */ new Uint32Array(64);

  class SHA2_32B extends HashMD {
    A = 0;
    B = 0;
    C = 0;
    D = 0;
    E = 0;
    F = 0;
    G = 0;
    H = 0;
    constructor(outputLen, IV) {
      super(64, outputLen, 8, false);
      this.A = IV[0] | 0;
      this.B = IV[1] | 0;
      this.C = IV[2] | 0;
      this.D = IV[3] | 0;
      this.E = IV[4] | 0;
      this.F = IV[5] | 0;
      this.G = IV[6] | 0;
      this.H = IV[7] | 0;
    }
    get() {
      const { A, B, C, D, E, F, G, H } = this;
      return [A, B, C, D, E, F, G, H];
    }
    set(A, B, C, D, E, F, G, H) {
      this.A = A | 0;
      this.B = B | 0;
      this.C = C | 0;
      this.D = D | 0;
      this.E = E | 0;
      this.F = F | 0;
      this.G = G | 0;
      this.H = H | 0;
    }
    _cloneInto(to) {
      (to ||= new this.constructor).set(...this.get());
      return this._cloneIntoMeta(to);
    }
    process(view, offset) {
      for (let i = 0;i < 16; i++, offset += 4)
        SHA256_W[i] = view.getUint32(offset, false);
      for (let i = 16;i < 64; i++) {
        const W15 = SHA256_W[i - 15];
        const W2 = SHA256_W[i - 2];
        const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
        const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
        SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
      }
      let { A, B, C, D, E, F, G, H } = this;
      for (let i = 0;i < 64; i++) {
        const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
        const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
        const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
        const T2 = sigma0 + Maj(A, B, C) | 0;
        H = G;
        G = F;
        F = E;
        E = D + T1 | 0;
        D = C;
        C = B;
        B = A;
        A = T1 + T2 | 0;
      }
      A = A + this.A | 0;
      B = B + this.B | 0;
      C = C + this.C | 0;
      D = D + this.D | 0;
      E = E + this.E | 0;
      F = F + this.F | 0;
      G = G + this.G | 0;
      H = H + this.H | 0;
      this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
      clean(SHA256_W);
    }
    destroy() {
      this.destroyed = true;
      this.set(0, 0, 0, 0, 0, 0, 0, 0);
      clean(this.buffer);
    }
  }

  class _SHA256 extends SHA2_32B {
    constructor() {
      super(32, SHA256_IV);
    }
  }
  var sha256 = /* @__PURE__ */ createHasher(() => new _SHA256, /* @__PURE__ */ oidNist(1));

  // node_modules/@noble/curves/utils.js
  /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  function aarray(item, title, inner = () => {}) {
    if (!Array.isArray(item))
      throw new TypeError(`"${title}" expected array, got type=${typeof item}`);
    for (let i = 0;i < item.length; i++)
      inner(item[i], `${title}[${i}]`);
    return item;
  }
  var abytes2 = (value, length, title) => abytes(value, length, title);
  var anumber2 = anumber;
  function aobject2(value, title = "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new TypeError(title === "object" ? "expected valid options object" : `"${title}" expected object, got type=${typeof value}`);
    return value;
  }
  function afunction(value, title) {
    if (typeof value !== "function")
      throw new TypeError(`"${title}" is invalid: expected function, got ${typeof value}`);
    return value;
  }
  var bytesToHex2 = bytesToHex;
  var hexToBytes2 = (hex) => hexToBytes(hex);
  var isBytes2 = isBytes;
  var randomBytes2 = (bytesLength) => randomBytes(bytesLength);
  var _0n = /* @__PURE__ */ BigInt(0);
  var _1n = /* @__PURE__ */ BigInt(1);
  var atitle2 = (title) => title ? `"${title}" ` : "";
  function abool(value, title = "") {
    if (typeof value !== "boolean")
      throw new TypeError(atitle2(title) + "expected boolean, got type=" + typeof value);
    return value;
  }
  function abignumber(n) {
    if (typeof n === "bigint") {
      if (!isPosBig(n))
        throw new RangeError("positive bigint expected, got " + n);
    } else
      anumber2(n);
    return n;
  }
  function asafenumber(value, title = "") {
    if (typeof value !== "number") {
      const prefix = title && `"${title}" `;
      throw new TypeError(prefix + "expected number, got type=" + typeof value);
    }
    if (!Number.isSafeInteger(value)) {
      const prefix = title && `"${title}" `;
      throw new RangeError(prefix + "expected safe integer, got " + value);
    }
  }
  function hexToNumber(hex) {
    if (typeof hex !== "string")
      throw new TypeError("hex string expected, got " + typeof hex);
    return hex === "" ? _0n : BigInt("0x" + hex);
  }
  function bytesToNumberBE(bytes) {
    return hexToNumber(bytesToHex(bytes));
  }
  function bytesToNumberLE(bytes) {
    return hexToNumber(bytesToHex(copyBytes(abytes(bytes)).reverse()));
  }
  function numberToBytesBE(n, len) {
    anumber(len);
    if (len === 0)
      throw new Error("zero output length is invalid");
    n = abignumber(n);
    const expectedLen = len * 2;
    const hex = n.toString(16);
    if (hex.length > expectedLen)
      throw new RangeError("number is too large");
    return hexToBytes(hex.padStart(expectedLen, "0"));
  }
  function numberToBytesLE(n, len) {
    return numberToBytesBE(n, len).reverse();
  }
  function copyBytes(bytes) {
    return Uint8Array.from(abytes2(bytes));
  }
  function isPosBig(n) {
    return typeof n === "bigint" && _0n <= n;
  }
  function inRange(n, min, max) {
    return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
  }
  function aInRange(title, n, min, max) {
    if (!inRange(n, min, max))
      throw new RangeError("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
  }
  function bitLen(n) {
    if (n < _0n)
      throw new Error("expected non-negative bigint, got " + n);
    return n === _0n ? 0 : n.toString(2).length;
  }
  var bitMask = (n) => {
    asafenumber(n, "n");
    return (_1n << BigInt(n)) - _1n;
  };
  function validateObject(object, fields = {}, optFields = {}, title = "object") {
    aobject2(object, title);
    aobject2(fields, "fields");
    aobject2(optFields, "optFields");
    function checkField(fieldName, expectedType, isOpt) {
      const label = title === "object" ? `param "${String(fieldName)}"` : `"${title}.${String(fieldName)}"`;
      const val = object[fieldName];
      if (!Object.hasOwn(object, fieldName) && (isOpt ? val !== undefined : expectedType !== "function")) {
        throw new TypeError(`${label} is invalid: expected own property`);
      }
      if (isOpt && val === undefined)
        return;
      const current = typeof val;
      if (current !== expectedType || val === null)
        throw new TypeError(`${label} is invalid: expected ${expectedType}, got ${current}`);
    }
    const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
    iter(fields, false);
    iter(optFields, true);
  }

  // node_modules/@noble/curves/abstract/modular.js
  /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  var _0n2 = /* @__PURE__ */ BigInt(0);
  var _1n2 = /* @__PURE__ */ BigInt(1);
  var _2n = /* @__PURE__ */ BigInt(2);
  var _3n = /* @__PURE__ */ BigInt(3);
  var _4n = /* @__PURE__ */ BigInt(4);
  var _5n = /* @__PURE__ */ BigInt(5);
  var _7n = /* @__PURE__ */ BigInt(7);
  var _8n = /* @__PURE__ */ BigInt(8);
  var _9n = /* @__PURE__ */ BigInt(9);
  var _15n = /* @__PURE__ */ BigInt(15);
  var _16n = /* @__PURE__ */ BigInt(16);
  var POW_WINDOWED_MIN = /* @__PURE__ */ BigInt("0x10000000000000000");
  function mod(a, b) {
    if (b <= _0n2)
      throw new Error("mod: expected positive modulus, got " + b);
    const result = a % b;
    return result >= _0n2 ? result : b + result;
  }
  function pow(num, power, modulo) {
    if (modulo <= _1n2)
      throw new Error("pow: expected modulus > 1, got " + modulo);
    if (typeof power !== "bigint")
      throw new TypeError("invalid exponent: expected bigint, got " + typeof power);
    if (power < _0n2)
      throw new Error("invalid exponent, negatives unsupported");
    if (power === _0n2)
      return _1n2;
    if (power === _1n2)
      return num;
    let d = num % modulo;
    if (d < _0n2)
      d += modulo;
    if (power < POW_WINDOWED_MIN) {
      let p = _1n2;
      while (power > _0n2) {
        if (power & _1n2)
          p = p * d % modulo;
        d = d * d % modulo;
        power >>= _1n2;
      }
      return p;
    }
    const digits = [];
    while (power > _0n2) {
      digits.push(Number(power & _15n));
      power >>= _4n;
    }
    const table = new Array(16);
    table[0] = _1n2;
    table[1] = d;
    for (let i = 2;i < 16; i++)
      table[i] = table[i - 1] * d % modulo;
    let p = table[digits[digits.length - 1]];
    for (let w = digits.length - 2;w >= 0; w--) {
      p = p * p % modulo;
      p = p * p % modulo;
      p = p * p % modulo;
      p = p * p % modulo;
      const digit = digits[w];
      if (digit !== 0)
        p = p * table[digit] % modulo;
    }
    return p;
  }
  function pow2(x, power, modulo) {
    if (modulo <= _1n2)
      throw new Error("pow2: expected modulus > 1, got " + modulo);
    if (power < _0n2)
      throw new Error("pow2: expected non-negative exponent, got " + power);
    let res = x;
    while (power-- > _0n2) {
      res *= res;
      res %= modulo;
    }
    return res;
  }
  function invert(number, modulo) {
    if (number === _0n2)
      throw new Error("invert: expected non-zero number");
    if (modulo <= _1n2)
      throw new Error("invert: expected modulus > 1, got " + modulo);
    let a = mod(number, modulo);
    let b = modulo;
    let x = _0n2, u = _1n2;
    while (a !== _0n2) {
      const q = b / a;
      const r = b - a * q;
      const m = x - u * q;
      b = a, a = r, x = u, u = m;
    }
    const gcd = b;
    if (gcd !== _1n2)
      throw new Error("invert: does not exist");
    return mod(x, modulo);
  }
  function assertIsSquare(Fp, root, n) {
    const F = Fp;
    if (!F.eql(F.sqr(root), n))
      throw new Error("Cannot find square root");
  }
  function aoddModulus(order, fnName) {
    if ((order & _1n2) === _0n2)
      throw new Error(fnName + ": expected odd modulus, got " + order);
  }
  function sqrt3mod4(Fp, n) {
    const F = Fp;
    const p1div4 = (F.ORDER + _1n2) / _4n;
    const root = F.pow(n, p1div4);
    assertIsSquare(F, root, n);
    return root;
  }
  function sqrt5mod8(Fp, n) {
    const F = Fp;
    const p5div8 = (F.ORDER - _5n) / _8n;
    const n2 = F.mul(n, _2n);
    const v = F.pow(n2, p5div8);
    const nv = F.mul(n, v);
    const i = F.mul(F.mul(nv, _2n), v);
    const root = F.mul(nv, F.sub(i, F.ONE));
    assertIsSquare(F, root, n);
    return root;
  }
  function sqrt9mod16(P) {
    const Fp_ = Field(P);
    const tn = tonelliShanks(P);
    const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
    const c2 = tn(Fp_, c1);
    const c3 = tn(Fp_, Fp_.neg(c1));
    const c4 = (P + _7n) / _16n;
    return (Fp, n) => {
      const F = Fp;
      let tv1 = F.pow(n, c4);
      let tv2 = F.mul(tv1, c1);
      const tv3 = F.mul(tv1, c2);
      const tv4 = F.mul(tv1, c3);
      const e1 = F.eql(F.sqr(tv2), n);
      const e2 = F.eql(F.sqr(tv3), n);
      tv1 = F.cmov(tv1, tv2, e1);
      tv2 = F.cmov(tv4, tv3, e2);
      const e3 = F.eql(F.sqr(tv2), n);
      const root = F.cmov(tv1, tv2, e3);
      assertIsSquare(F, root, n);
      return root;
    };
  }
  function tonelliShanks(P) {
    if (P < _3n)
      throw new Error("sqrt is not defined for small field");
    aoddModulus(P, "tonelliShanks");
    let Q = P - _1n2;
    let S = 0;
    while (Q % _2n === _0n2) {
      Q /= _2n;
      S++;
    }
    let Z = _2n;
    const _Fp = Field(P);
    while (FpLegendre(_Fp, Z) === 1) {
      if (Z++ > 1000)
        throw new Error("Cannot find square root: probably non-prime P");
    }
    if (S === 1)
      return sqrt3mod4;
    let cc = _Fp.pow(Z, Q);
    const Q1div2 = (Q + _1n2) / _2n;
    return function tonelliSlow(Fp, n) {
      const F = Fp;
      if (F.is0(n))
        return n;
      if (FpLegendre(F, n) !== 1)
        throw new Error("Cannot find square root");
      let M = S;
      let c = F.mul(F.ONE, cc);
      let t = F.pow(n, Q);
      let R = F.pow(n, Q1div2);
      while (!F.eql(t, F.ONE)) {
        if (F.is0(t))
          throw new Error("Cannot find square root: probably non-prime P");
        let i = 1;
        let t_tmp = F.sqr(t);
        while (!F.eql(t_tmp, F.ONE)) {
          i++;
          t_tmp = F.sqr(t_tmp);
          if (i === M)
            throw new Error("Cannot find square root");
        }
        const exponent = _1n2 << BigInt(M - i - 1);
        const b = F.pow(c, exponent);
        M = i;
        c = F.sqr(b);
        t = F.mul(t, c);
        R = F.mul(R, b);
      }
      return R;
    };
  }
  function FpSqrt(P) {
    aoddModulus(P, "Fp.sqrt");
    if (P % _4n === _3n)
      return sqrt3mod4;
    if (P % _8n === _5n)
      return sqrt5mod8;
    if (P % _16n === _9n)
      return sqrt9mod16(P);
    return tonelliShanks(P);
  }
  var isNegativeLE = (num, modulo) => (mod(num, modulo) & _1n2) === _1n2;
  var FIELD_FIELDS = [
    "create",
    "isValid",
    "is0",
    "neg",
    "inv",
    "sqrt",
    "sqr",
    "eql",
    "add",
    "sub",
    "mul",
    "pow",
    "div",
    "addN",
    "subN",
    "mulN",
    "sqrN"
  ];
  function validateField(field) {
    aobject2(field, "field");
    if (typeof field.ORDER !== "bigint")
      throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof field.ORDER);
    asafenumber(field.BYTES, "BYTES");
    asafenumber(field.BITS, "BITS");
    for (const name of FIELD_FIELDS)
      afunction(field[name], "field." + name);
    if (field.BYTES < 1 || field.BITS < 1)
      throw new Error("invalid field: expected BYTES/BITS > 0");
    if (field.ORDER <= _1n2)
      throw new Error("invalid field: expected ORDER > 1, got " + field.ORDER);
    return field;
  }
  function FpInvertBatch(Fp, nums, passZero = false) {
    validateField(Fp);
    aarray(nums, "nums");
    abool(passZero, "passZero");
    const F = Fp;
    const inverted = new Array(nums.length).fill(passZero ? F.ZERO : undefined);
    const multipliedAcc = nums.reduce((acc, num, i) => {
      if (F.is0(num))
        return acc;
      inverted[i] = acc;
      return F.mul(acc, num);
    }, F.ONE);
    const invertedAcc = F.inv(multipliedAcc);
    nums.reduceRight((acc, num, i) => {
      if (F.is0(num))
        return acc;
      inverted[i] = F.mul(acc, inverted[i]);
      return F.mul(acc, num);
    }, invertedAcc);
    return inverted;
  }
  function FpLegendre(Fp, n) {
    validateField(Fp);
    const F = Fp;
    aoddModulus(F.ORDER, "FpLegendre");
    const p1mod2 = (F.ORDER - _1n2) / _2n;
    const powered = F.pow(n, p1mod2);
    const yes = F.eql(powered, F.ONE);
    const zero = F.eql(powered, F.ZERO);
    const no = F.eql(powered, F.neg(F.ONE));
    if (!yes && !zero && !no)
      throw new Error("invalid Legendre symbol result");
    return yes ? 1 : zero ? 0 : -1;
  }
  function nLength(n, nBitLength) {
    if (nBitLength !== undefined)
      anumber2(nBitLength);
    if (n <= _0n2)
      throw new Error("invalid n length: expected positive n, got " + n);
    if (nBitLength !== undefined && nBitLength < 1)
      throw new Error("invalid n length: expected positive bit length, got " + nBitLength);
    const bits = bitLen(n);
    if (nBitLength !== undefined && nBitLength < bits)
      throw new Error(`invalid n length: expected nBitLength (${nBitLength}) >= bitLen(n) (${bits})`);
    const _nBitLength = nBitLength !== undefined ? nBitLength : bits;
    const nByteLength = Math.ceil(_nBitLength / 8);
    return { nBitLength: _nBitLength, nByteLength };
  }
  var FIELD_SQRT = new WeakMap;

  class _Field {
    ORDER;
    BITS;
    BYTES;
    isLE;
    ZERO = _0n2;
    ONE = _1n2;
    _lengths;
    _mod;
    constructor(ORDER, opts = {}) {
      if (ORDER <= _1n2)
        throw new Error("invalid field: expected ORDER > 1, got " + ORDER);
      let _nbitLength = undefined;
      this.isLE = false;
      if (opts != null && typeof opts === "object") {
        if (typeof opts.BITS === "number")
          _nbitLength = opts.BITS;
        if (typeof opts.sqrt === "function")
          Object.defineProperty(this, "sqrt", { value: opts.sqrt, enumerable: true });
        if (typeof opts.isLE === "boolean")
          this.isLE = opts.isLE;
        if (opts.allowedLengths)
          this._lengths = Object.freeze(opts.allowedLengths.slice());
        if (typeof opts.modFromBytes === "boolean")
          this._mod = opts.modFromBytes;
      }
      const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
      if (nByteLength > 2048)
        throw new Error("invalid field: expected ORDER of <= 2048 bytes");
      this.ORDER = ORDER;
      this.BITS = nBitLength;
      this.BYTES = nByteLength;
      Object.freeze(this);
    }
    create(num) {
      return mod(num, this.ORDER);
    }
    isValid(num) {
      if (typeof num !== "bigint")
        throw new TypeError("invalid field element: expected bigint, got " + typeof num);
      return _0n2 <= num && num < this.ORDER;
    }
    is0(num) {
      return num === _0n2;
    }
    isValidNot0(num) {
      return !this.is0(num) && this.isValid(num);
    }
    isOdd(num) {
      return (num & _1n2) === _1n2;
    }
    neg(num) {
      return mod(-num, this.ORDER);
    }
    eql(lhs, rhs) {
      return lhs === rhs;
    }
    sqr(num) {
      return mod(num * num, this.ORDER);
    }
    add(lhs, rhs) {
      return mod(lhs + rhs, this.ORDER);
    }
    sub(lhs, rhs) {
      return mod(lhs - rhs, this.ORDER);
    }
    mul(lhs, rhs) {
      return mod(lhs * rhs, this.ORDER);
    }
    pow(num, power) {
      return pow(num, power, this.ORDER);
    }
    div(lhs, rhs) {
      return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
    }
    sqrN(num) {
      return num * num;
    }
    addN(lhs, rhs) {
      return lhs + rhs;
    }
    subN(lhs, rhs) {
      return lhs - rhs;
    }
    mulN(lhs, rhs) {
      return lhs * rhs;
    }
    inv(num) {
      return invert(num, this.ORDER);
    }
    sqrt(num) {
      let sqrt = FIELD_SQRT.get(this);
      if (!sqrt)
        FIELD_SQRT.set(this, sqrt = FpSqrt(this.ORDER));
      return sqrt(this, num);
    }
    toBytes(num) {
      return this.isLE ? numberToBytesLE(num, this.BYTES) : numberToBytesBE(num, this.BYTES);
    }
    fromBytes(bytes, skipValidation = false) {
      abytes2(bytes);
      const { _lengths: allowedLengths, BYTES, isLE, ORDER, _mod: modFromBytes } = this;
      if (allowedLengths) {
        if (bytes.length < 1 || !allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
          throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
        }
        const padded = new Uint8Array(BYTES);
        padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
        bytes = padded;
      }
      if (bytes.length !== BYTES)
        throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
      let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
      if (modFromBytes)
        scalar = mod(scalar, ORDER);
      if (!skipValidation) {
        if (!this.isValid(scalar))
          throw new Error("invalid field element: outside of range 0..ORDER");
      }
      return scalar;
    }
    invertBatch(lst) {
      return FpInvertBatch(this, lst, true);
    }
    cmov(a, b, condition) {
      abool(condition, "condition");
      return condition ? b : a;
    }
  }
  function Field(ORDER, opts = {}) {
    Object.freeze(_Field.prototype);
    return new _Field(ORDER, opts);
  }

  // node_modules/@noble/curves/abstract/curve.js
  /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  var _0n3 = /* @__PURE__ */ BigInt(0);
  var _1n3 = /* @__PURE__ */ BigInt(1);
  var _4n2 = /* @__PURE__ */ BigInt(4);
  var BLIND_BYTES = 16;
  var BLIND_BITS = 128;
  var FW_WINDOW = 5;
  var TABLE_BYTES_MAX = /* @__PURE__ */ (() => 2 ** 31)();
  function validatePointCons(Point) {
    const pc = Point;
    if (typeof pc !== "function")
      throw new TypeError('"Point" expected constructor, got type=' + typeof Point);
    afunction(pc.fromAffine, "Point.fromAffine");
    afunction(pc.fromBytes, "Point.fromBytes");
    afunction(pc.fromHex, "Point.fromHex");
    aobject2(pc.BASE, "Point.BASE");
    aobject2(pc.ZERO, "Point.ZERO");
    validateField(pc.Fp);
    validateField(pc.Fn);
  }
  function normalizeZ(c, points) {
    validatePointCons(c);
    validateMSMPoints(points, c);
    const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
    return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
  }
  function validateW(W, bits, min = 1) {
    if (!Number.isSafeInteger(W) || W < min || W > bits)
      throw new Error("invalid window size, expected [" + min + ".." + bits + "], got W=" + W);
  }
  function validateTableBytes(numPoints, fpBytes) {
    const bytes = numPoints * (4 * fpBytes + 128);
    if (bytes > TABLE_BYTES_MAX)
      throw new Error("invalid window size: table would need ~" + Math.ceil(bytes / 2 ** 20) + " MiB, max " + TABLE_BYTES_MAX / 2 ** 20 + " MiB");
  }
  function probeRandomBytes(randomBytes, length) {
    if (randomBytes === undefined)
      return;
    afunction(randomBytes, "randomBytes");
    try {
      const probe = randomBytes(length);
      if (!isBytes2(probe) || probe.length !== length)
        return;
    } catch {
      return;
    }
    return randomBytes;
  }
  function validateMSMPoints(points, c) {
    aarray(points, "points");
    points.forEach((p, i) => {
      if (!(p instanceof c))
        throw new Error("invalid point at index " + i);
    });
  }
  function validateMSMScalars(scalars, field, maxScalar) {
    if (!Array.isArray(scalars))
      throw new Error("array of scalars expected");
    scalars.forEach((s, i) => {
      const ok = maxScalar === undefined ? field.isValid(s) : isPosBig(s) && s < maxScalar;
      if (!ok)
        throw new Error("invalid scalar at index " + i);
    });
  }
  var pointWindowSizes = new WeakMap;
  function getWindowSize(P) {
    return pointWindowSizes.get(P) || 1;
  }
  function oddMultiples(p, size) {
    const dbl = p.double();
    const t = [p];
    for (let j = 1;j < size; j++)
      t.push(t[j - 1].add(dbl));
    return t;
  }
  function wnafDigits(n, W) {
    const size = 2 ** W;
    const half = size / 2;
    const mask = BigInt(size - 1);
    const d = [];
    while (n > _0n3) {
      let w = 0;
      if (n & _1n3) {
        w = Number(n & mask);
        if (w >= half)
          w -= size;
        n -= BigInt(w);
      }
      d.push(w);
      n >>= _1n3;
    }
    return d;
  }
  function signedWindowDigits(n, W, windows) {
    const size = 2 ** W;
    const half = size / 2;
    const mask = BigInt(size - 1);
    const shiftBy = BigInt(W);
    const d = [];
    for (let w = 0;w < windows; w++) {
      let v = Number(n & mask);
      n >>= shiftBy;
      if (v > half) {
        v -= size;
        n += _1n3;
      }
      d.push(v);
    }
    if (n !== _0n3)
      throw new Error("invalid wnaf");
    return d;
  }
  function wnafWalk(zero, tables, digits) {
    let max = 0;
    for (const d of digits)
      max = Math.max(max, d.length);
    let acc = zero;
    for (let bit = max - 1;bit >= 0; bit--) {
      if (bit !== max - 1)
        acc = acc.double();
      for (let i = 0;i < digits.length; i++) {
        const w = digits[i][bit];
        if (w) {
          const item = tables[i][Math.abs(w) - 1 >> 1];
          acc = acc.add(w < 0 ? item.negate() : item);
        }
      }
    }
    return acc;
  }

  class ScalarMultiplier {
    Point;
    BASE;
    ZERO;
    randomBytes;
    wnafPrecomputes = new WeakMap;
    baseCanBeBlinded;
    bits;
    constructor(Point, randomBytes) {
      validatePointCons(Point);
      this.randomBytes = probeRandomBytes(randomBytes, BLIND_BYTES);
      this.Point = Point;
      this.BASE = Point.BASE;
      this.ZERO = Point.ZERO;
      this.bits = Point.Fn.BITS;
    }
    buildWnafTable(point, W, bits) {
      const windows = Math.ceil(bits / W) + 1;
      const half = 2 ** (W - 1);
      const comp = [];
      let base = point;
      for (let w = 0;w < windows; w++) {
        let acc = base;
        for (let i = 0;i < half; i++) {
          comp.push(acc);
          acc = acc.add(base);
        }
        base = comp[comp.length - 1].double();
      }
      return { W, bits, windows, comp };
    }
    wnafCachedCT(precomputes, n) {
      const { W, windows, comp } = precomputes;
      const half = 2 ** (W - 1);
      const digits = signedWindowDigits(n, W, windows);
      let p = this.ZERO;
      let f = this.BASE;
      for (let w = 0;w < windows; w++) {
        const digit = digits[w];
        const start = w * half;
        const idx = Math.abs(digit) - 1;
        let sel = comp[start];
        for (let i = 1;i < half; i++)
          sel = i === idx ? comp[start + i] : sel;
        const neg = sel.negate();
        if (digit === 0)
          f = f.add(comp[start]);
        else
          p = p.add(digit < 0 ? neg : sel);
      }
      return { p, f };
    }
    getWnafPrecomputes(W, point, bits, transform) {
      let entries = this.wnafPrecomputes.get(point);
      let comp = entries?.find((entry) => entry.W === W && entry.bits === bits);
      if (!comp) {
        comp = this.buildWnafTable(point, W, bits);
        if (typeof transform === "function")
          comp = { ...comp, comp: transform(comp.comp) };
        if (!entries) {
          entries = [];
          this.wnafPrecomputes.set(point, entries);
        }
        entries.push(comp);
      }
      return comp;
    }
    assertPoint(point) {
      if (!(point instanceof this.Point))
        throw new TypeError('"point" expected Point instance, got type=' + typeof point);
    }
    validateMulInput(point, scalar) {
      this.assertPoint(point);
      if (!inRange(scalar, _1n3, this.Point.Fn.ORDER))
        throw new Error("invalid scalar");
    }
    runCT(point, n, bits, transform) {
      const W = getWindowSize(point);
      if (W === 1)
        return this.fixedWindowCT(point, n, bits);
      return this.wnafCachedCT(this.getWnafPrecomputes(W, point, bits, transform), n);
    }
    mulCT(point, scalar, transform) {
      this.validateMulInput(point, scalar);
      return this.runCT(point, scalar, this.bits, transform);
    }
    mulCTBlinded(point, scalar, transform) {
      this.validateMulInput(point, scalar);
      if (this.randomBytes === undefined)
        throw new Error("randomBytes is required for scalar blinding");
      const bits = this.Point.Fn.BITS + BLIND_BITS;
      const blind = this.randomBytes(BLIND_BYTES);
      if (!isBytes2(blind) || blind.length !== BLIND_BYTES)
        throw new Error("randomBytes returned invalid byte array");
      blind[0] = blind[0] & 63 | 128;
      const n = scalar + bytesToNumberBE(blind) * this.Point.Fn.ORDER;
      return this.runCT(point, n, bits, transform);
    }
    fixedWindowCT(point, n, bits) {
      const W = FW_WINDOW;
      const size = 1 << W;
      const mask = bitMask(W);
      const table = new Array(size);
      table[0] = this.ZERO;
      for (let i = 1;i < size; i++)
        table[i] = table[i - 1].add(point);
      const windows = Math.ceil(bits / W);
      let acc = this.ZERO;
      for (let window = windows - 1;window >= 0; window--) {
        if (window !== windows - 1)
          for (let d = 0;d < W; d++)
            acc = acc.double();
        const digit = Number(n >> BigInt(window * W) & mask);
        let sel = table[0];
        for (let i = 1;i < size; i++)
          sel = i === digit ? table[i] : sel;
        acc = acc.add(sel);
      }
      return { p: acc, f: acc };
    }
    shouldBlind(point, cofactor) {
      if (this.randomBytes === undefined)
        return false;
      if (cofactor === _1n3)
        return true;
      if (point !== this.BASE)
        return false;
      if (this.baseCanBeBlinded === undefined)
        this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0();
      return this.baseCanBeBlinded;
    }
    mulSecret(point, scalar, cofactor, transform) {
      return this.shouldBlind(point, cofactor) ? this.mulCTBlinded(point, scalar, transform) : this.mulCT(point, scalar, transform);
    }
    mulUnsafe(point, scalar, transform) {
      this.assertPoint(point);
      if (!isPosBig(scalar))
        throw new Error("invalid scalar");
      const W = getWindowSize(point);
      if (W === 1 || scalar >= this.Point.Fn.ORDER)
        return mulAddUnsafe(this.Point, [point], [scalar], true);
      const precomputes = this.getWnafPrecomputes(W, point, this.bits, transform);
      return this.wnafCachedCT(precomputes, scalar).p;
    }
    setWindowSize(point, W) {
      this.assertPoint(point);
      validateW(W, this.bits);
      const windows = Math.ceil((this.bits + BLIND_BITS) / W) + 1;
      validateTableBytes(windows * 2 ** (W - 1), this.Point.Fp.BYTES);
      pointWindowSizes.set(point, W);
      this.wnafPrecomputes.delete(point);
    }
    hasWindowSize(point) {
      return getWindowSize(point) !== 1;
    }
  }
  function mulAddUnsafe(c, points, scalars, allowOversized = false) {
    validatePointCons(c);
    validateMSMPoints(points, c);
    abool(allowOversized, "allowOversized");
    validateMSMScalars(scalars, c.Fn, allowOversized ? c.Fn.ORDER ** _4n2 : undefined);
    if (points.length !== scalars.length)
      throw new Error("arrays of points and scalars must have equal length");
    const tables = points.map((p) => oddMultiples(p, 4));
    const digits = scalars.map((n) => wnafDigits(n, 4));
    return wnafWalk(c.ZERO, tables, digits);
  }
  function createField(order, field, isLE) {
    if (field) {
      if (field.ORDER !== order)
        throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
      validateField(field);
      return field;
    } else {
      return Field(order, { isLE });
    }
  }
  function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
    if (type !== "weierstrass" && type !== "edwards")
      throw new Error('expected curve type "weierstrass" or "edwards"');
    if (FpFnLE === undefined)
      FpFnLE = type === "edwards";
    if (!CURVE || typeof CURVE !== "object")
      throw new Error(`expected valid ${type} CURVE object`);
    validateObject(curveOpts);
    for (const p of ["p", "n", "h"]) {
      const val = CURVE[p];
      if (!(isPosBig(val) && val !== _0n3))
        throw new Error(`CURVE.${p} must be positive bigint`);
    }
    const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
    const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
    const _b = type === "weierstrass" ? "b" : "d";
    const params = ["Gx", "Gy", "a", _b];
    for (const p of params) {
      if (!Fp.isValid(CURVE[p]))
        throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
    }
    CURVE = Object.freeze(Object.assign({}, CURVE));
    return { CURVE, Fp, Fn };
  }
  function createKeygen(randomSecretKey, getPublicKey) {
    return function keygen(seed) {
      const secretKey = randomSecretKey(seed);
      return { secretKey, publicKey: getPublicKey(secretKey) };
    };
  }

  // node_modules/@noble/curves/abstract/edwards.js
  /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  var _0n4 = /* @__PURE__ */ BigInt(0);
  var _1n4 = /* @__PURE__ */ BigInt(1);
  var _2n2 = /* @__PURE__ */ BigInt(2);
  var _4n3 = /* @__PURE__ */ BigInt(4);
  var _8n2 = /* @__PURE__ */ BigInt(8);
  function isEdValidXY(Fp, CURVE, x, y) {
    const x2 = Fp.sqr(x);
    const y2 = Fp.sqr(y);
    const left = Fp.add(Fp.mul(CURVE.a, x2), y2);
    const right = Fp.add(Fp.ONE, Fp.mul(CURVE.d, Fp.mul(x2, y2)));
    return Fp.eql(left, right);
  }
  function edwards(params, extraOpts = {}) {
    validateObject(extraOpts, {}, {}, "extraOpts");
    const opts = extraOpts;
    const validated = createCurveFields("edwards", params, opts, opts.FpFnLE);
    const { Fp, Fn } = validated;
    let CURVE = validated.CURVE;
    const { h: cofactor } = CURVE;
    if (FpLegendre(Fp, CURVE.a) !== 1)
      throw new Error("edwards: CURVE.a must be a square in Fp for complete addition formulas");
    if (FpLegendre(Fp, CURVE.d) !== -1)
      throw new Error("edwards: CURVE.d must be a non-square in Fp for complete addition formulas");
    validateObject(opts, {}, { uvRatio: "function", randomBytes: "function" });
    const randomBytes = opts.randomBytes === undefined ? randomBytes2 : opts.randomBytes;
    const MASK = _2n2 << BigInt(Fp.BYTES * 8) - _1n4;
    function isOdd(n) {
      if (!Fp.isOdd)
        throw new Error("Field does not have .isOdd()");
      return Fp.isOdd(n);
    }
    const uvRatio = opts.uvRatio === undefined ? (u, v) => {
      try {
        return { isValid: true, value: Fp.sqrt(Fp.div(u, v)) };
      } catch (e) {
        return { isValid: false, value: _0n4 };
      }
    } : opts.uvRatio;
    if (!isEdValidXY(Fp, CURVE, CURVE.Gx, CURVE.Gy))
      throw new Error("bad curve params: generator point");
    const mulA = Fp.eql(CURVE.a, Fp.neg(Fp.ONE)) ? (x) => Fp.neg(x) : Fp.eql(CURVE.a, Fp.ONE) ? (x) => x : (x) => Fp.mul(CURVE.a, x);
    function acoord(title, n, banZero = false) {
      const min = banZero ? _1n4 : _0n4;
      aInRange("coordinate " + title, n, min, MASK);
      return n;
    }
    function aedpoint(other) {
      if (!(other instanceof Point))
        throw new Error("EdwardsPoint expected");
    }

    class Point {
      static BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE, Fp.mul(CURVE.Gx, CURVE.Gy));
      static ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ONE, Fp.ZERO);
      static Fp = Fp;
      static Fn = Fn;
      X;
      Y;
      Z;
      T;
      constructor(X, Y, Z, T) {
        this.X = acoord("x", X);
        this.Y = acoord("y", Y);
        this.Z = acoord("z", Z, true);
        this.T = acoord("t", T);
        Object.freeze(this);
      }
      static CURVE() {
        return CURVE;
      }
      static fromAffine(p) {
        if (p instanceof Point)
          throw new Error("extended point not allowed");
        const { x, y } = p || {};
        acoord("x", x);
        acoord("y", y);
        return new Point(x, y, Fp.ONE, Fp.mul(x, y));
      }
      static fromBytes(bytes, zip215 = false) {
        const len = Fp.BYTES;
        const { a, d } = CURVE;
        bytes = copyBytes(abytes2(bytes, len, "point"));
        abool(zip215, "zip215");
        const normed = copyBytes(bytes);
        const lastByte = bytes[len - 1];
        normed[len - 1] = lastByte & ~128;
        const y = bytesToNumberLE(normed);
        const max = zip215 ? MASK : Fp.ORDER;
        aInRange("point.y", y, _0n4, max);
        const y2 = Fp.sqr(y);
        const u = Fp.sub(y2, Fp.ONE);
        const v = Fp.sub(Fp.mulN(d, y2), a);
        let { isValid, value: x } = uvRatio(u, v);
        if (!isValid)
          throw new Error("bad point: invalid y coordinate");
        const isXOdd = isOdd(x);
        const isLastByteOdd = (lastByte & 128) !== 0;
        if (!zip215 && Fp.is0(x) && isLastByteOdd)
          throw new Error("bad point: x=0 and x_0=1");
        if (isLastByteOdd !== isXOdd)
          x = Fp.neg(x);
        return Point.fromAffine({ x, y });
      }
      static fromHex(hex, zip215 = false) {
        return Point.fromBytes(hexToBytes2(hex), zip215);
      }
      get x() {
        return this.toAffine().x;
      }
      get y() {
        return this.toAffine().y;
      }
      precompute(windowSize = 6, isLazy = true) {
        wnaf.setWindowSize(this, windowSize);
        if (!isLazy)
          this.multiply(_2n2);
        return this;
      }
      assertValidity() {
        const p = this;
        const { a, d } = CURVE;
        if (p.is0())
          throw new Error("bad point: ZERO");
        const { X, Y, Z, T } = p;
        const X2 = Fp.sqr(X);
        const Y2 = Fp.sqr(Y);
        const Z2 = Fp.sqr(Z);
        const Z4 = Fp.sqr(Z2);
        const aX2 = Fp.mul(X2, a);
        const left = Fp.mul(Fp.add(aX2, Y2), Z2);
        const right = Fp.add(Z4, Fp.mul(d, Fp.mul(X2, Y2)));
        if (!Fp.eql(left, right))
          throw new Error("bad point: equation left != right (1)");
        const XY = Fp.mul(X, Y);
        const ZT = Fp.mul(Z, T);
        if (!Fp.eql(XY, ZT))
          throw new Error("bad point: equation left != right (2)");
      }
      equals(other) {
        aedpoint(other);
        const { X: X1, Y: Y1, Z: Z1 } = this;
        const { X: X2, Y: Y2, Z: Z2 } = other;
        const X1Z2 = Fp.mul(X1, Z2);
        const X2Z1 = Fp.mul(X2, Z1);
        const Y1Z2 = Fp.mul(Y1, Z2);
        const Y2Z1 = Fp.mul(Y2, Z1);
        return Fp.eql(X1Z2, X2Z1) && Fp.eql(Y1Z2, Y2Z1);
      }
      is0() {
        return this.equals(Point.ZERO);
      }
      negate() {
        return new Point(Fp.neg(this.X), this.Y, this.Z, Fp.neg(this.T));
      }
      double() {
        const { X: X1, Y: Y1, Z: Z1 } = this;
        const A = Fp.sqr(X1);
        const B = Fp.sqr(Y1);
        const C = Fp.mul(Fp.sqr(Z1), _2n2);
        const D = mulA(A);
        const x1y1 = Fp.addN(X1, Y1);
        const E = Fp.sub(Fp.subN(Fp.sqr(x1y1), A), B);
        const G = Fp.addN(D, B);
        const F = Fp.subN(G, C);
        const H = Fp.subN(D, B);
        const X3 = Fp.mul(E, F);
        const Y3 = Fp.mul(G, H);
        const T3 = Fp.mul(E, H);
        const Z3 = Fp.mul(F, G);
        return new Point(X3, Y3, Z3, T3);
      }
      add(other) {
        aedpoint(other);
        const { d } = CURVE;
        const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
        const { X: X2, Y: Y2, Z: Z2, T: T2 } = other;
        const A = Fp.mul(X1, X2);
        const B = Fp.mul(Y1, Y2);
        const C = Fp.mul(Fp.mulN(T1, d), T2);
        const D = Fp.mul(Z1, Z2);
        const E = Fp.sub(Fp.subN(Fp.mulN(Fp.addN(X1, Y1), Fp.addN(X2, Y2)), A), B);
        const F = Fp.subN(D, C);
        const G = Fp.addN(D, C);
        const H = Fp.sub(B, mulA(A));
        const X3 = Fp.mul(E, F);
        const Y3 = Fp.mul(G, H);
        const T3 = Fp.mul(E, H);
        const Z3 = Fp.mul(F, G);
        return new Point(X3, Y3, Z3, T3);
      }
      subtract(other) {
        aedpoint(other);
        return this.add(other.negate());
      }
      multiply(scalar) {
        if (!Fn.isValidNot0(scalar))
          throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
        const { p, f } = wnaf.mulSecret(this, scalar, cofactor, normalize);
        return normalize([p, f])[0];
      }
      multiplyUnsafe(scalar) {
        if (!Fn.isValid(scalar))
          throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
        if (scalar === _0n4)
          return Point.ZERO;
        if (this.is0() || scalar === _1n4)
          return this;
        return wnaf.mulUnsafe(this, scalar, normalize);
      }
      isSmallOrder() {
        return this.clearCofactor().is0();
      }
      isTorsionFree() {
        return wnaf.mulUnsafe(this, CURVE.n).is0();
      }
      toAffine(invertedZ) {
        const p = this;
        let iz = invertedZ;
        if (iz != null && typeof iz !== "bigint")
          throw new TypeError('"invertedZ" expected bigint, got type=' + typeof iz);
        const { X, Y, Z } = p;
        const is0 = p.is0();
        if (iz == null)
          iz = is0 ? Fp.create(_8n2) : Fp.inv(Z);
        const x = Fp.mul(X, iz);
        const y = Fp.mul(Y, iz);
        const zz = Fp.mul(Z, iz);
        if (is0)
          return { x: Fp.ZERO, y: Fp.ONE };
        if (!Fp.eql(zz, Fp.ONE))
          throw new Error("invZ was invalid");
        return { x, y };
      }
      clearCofactor() {
        if (cofactor === _1n4)
          return this;
        if (cofactor === _2n2)
          return this.double();
        if (cofactor === _4n3)
          return this.double().double();
        if (cofactor === _8n2)
          return this.double().double().double();
        return this.multiplyUnsafe(cofactor);
      }
      toBytes() {
        const { x, y } = this.toAffine();
        const bytes = Fp.toBytes(y);
        bytes[bytes.length - 1] |= isOdd(x) ? 128 : 0;
        return bytes;
      }
      toHex() {
        return bytesToHex2(this.toBytes());
      }
      toString() {
        return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
      }
    }
    const normalize = (points) => normalizeZ(Point, points);
    const wnaf = new ScalarMultiplier(Point, randomBytes);
    if (wnaf.bits >= 6)
      Point.BASE.precompute(6);
    Object.freeze(Point.prototype);
    Object.freeze(Point);
    return Point;
  }

  // node_modules/@noble/curves/abstract/montgomery.js
  /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  var _0n5 = /* @__PURE__ */ BigInt(0);
  var _1n5 = /* @__PURE__ */ BigInt(1);
  var _2n3 = /* @__PURE__ */ BigInt(2);
  function cmask(P, swap) {
    return P + swap - (swap >> _1n5 << _1n5);
  }
  function cswap(P) {
    const offset = BigInt(6) * P;
    return (mask, x_2, x_3) => {
      const sum = x_2 + x_3;
      const d = offset + x_3 - x_2;
      const a = (d * mask + x_2) % P;
      return { x_2: a, x_3: sum - a };
    };
  }
  function validateOpts(curve) {
    validateObject(curve, {
      P: "bigint",
      type: "string",
      adjustScalarBytes: "function",
      powPminus2: "function"
    }, {
      randomBytes: "function",
      scalarMultBase: "function"
    });
    return Object.freeze({ ...curve });
  }
  function montgomery(curveDef) {
    const CURVE = validateOpts(curveDef);
    const { P, type, adjustScalarBytes, powPminus2, randomBytes: rand } = CURVE;
    const mulBaseHook = CURVE.scalarMultBase;
    const is25519 = type === "x25519";
    if (!is25519 && type !== "x448")
      throw new Error("invalid type");
    const randomBytes_ = rand === undefined ? randomBytes2 : rand;
    const montgomeryBits = is25519 ? 255 : 448;
    const swap = cswap(P);
    const fieldLen = is25519 ? 32 : 56;
    const Gu = is25519 ? BigInt(9) : BigInt(5);
    const a24 = is25519 ? BigInt(121665) : BigInt(39081);
    const minScalar = is25519 ? _2n3 ** BigInt(254) : _2n3 ** BigInt(447);
    const maxAdded = is25519 ? BigInt(8) * (_2n3 ** BigInt(251) - _1n5) : BigInt(4) * (_2n3 ** BigInt(445) - _1n5);
    const maxScalar = minScalar + maxAdded + _1n5;
    const modP = (n) => mod(n, P);
    const GuBytes = encodeU(Gu);
    function encodeU(u) {
      return numberToBytesLE(modP(u), fieldLen);
    }
    function decodeU(u) {
      const _u = copyBytes(abytes2(u, fieldLen, "uCoordinate"));
      if (is25519)
        _u[31] &= 127;
      return modP(bytesToNumberLE(_u));
    }
    function decodeScalar(scalar) {
      return bytesToNumberLE(adjustScalarBytes(copyBytes(abytes2(scalar, fieldLen, "scalar"))));
    }
    const lowOrderU = new Set(is25519 ? [
      _0n5,
      _1n5,
      P - _1n5,
      BigInt("325606250916557431795983626356110631294008115727848805560023387167927233504"),
      BigInt("39382357235489614581723060781553021112529911719440698176882885853963445705823")
    ] : [_0n5, _1n5, P - _1n5]);
    function scalarMult(scalar, u) {
      const pointU = decodeU(u);
      if (lowOrderU.has(pointU))
        throw new Error("invalid private or public key received");
      const pu = montgomeryLadder(pointU, decodeScalar(scalar));
      if (pu === _0n5)
        throw new Error("invalid private or public key received");
      return encodeU(pu);
    }
    function scalarMultBase(scalar) {
      if (mulBaseHook === undefined)
        return scalarMult(scalar, GuBytes);
      const k = decodeScalar(scalar);
      aInRange("scalar", k, minScalar, maxScalar);
      const pu = modP(mulBaseHook(k));
      if (pu === _0n5)
        throw new Error("invalid private or public key received");
      return encodeU(pu);
    }
    const getPublicKey = scalarMultBase;
    const getSharedSecret = scalarMult;
    function montgomeryLadder(u, scalar) {
      aInRange("u", u, _0n5, P);
      aInRange("scalar", scalar, minScalar, maxScalar);
      const k = scalar;
      const x_1 = u;
      let x_2 = _1n5;
      let z_2 = _0n5;
      let x_3 = u;
      let z_3 = _1n5;
      const kx = k ^ k >> _1n5;
      for (let t = BigInt(montgomeryBits - 1);t >= _0n5; t--) {
        const mask = cmask(P, kx >> t);
        ({ x_2, x_3 } = swap(mask, x_2, x_3));
        ({ x_2: z_2, x_3: z_3 } = swap(mask, z_2, z_3));
        const A = x_2 + z_2;
        const AA = modP(A * A);
        const B = x_2 - z_2;
        const BB = modP(B * B);
        const E = AA - BB;
        const C = x_3 + z_3;
        const D = x_3 - z_3;
        const DA = modP(D * A);
        const CB = modP(C * B);
        const dacb = DA + CB;
        const da_cb = DA - CB;
        x_3 = modP(dacb * dacb);
        z_3 = modP(x_1 * modP(da_cb * da_cb));
        x_2 = modP(AA * BB);
        z_2 = modP(E * (AA + modP(a24 * E)));
      }
      const mask = cmask(P, k);
      ({ x_2, x_3 } = swap(mask, x_2, x_3));
      ({ x_2: z_2, x_3: z_3 } = swap(mask, z_2, z_3));
      const z2 = powPminus2(z_2);
      return modP(x_2 * z2);
    }
    const lengths = {
      secretKey: fieldLen,
      publicKey: fieldLen,
      seed: fieldLen
    };
    const randomSecretKey = (seed) => {
      seed = seed === undefined ? randomBytes_(fieldLen) : seed;
      abytes2(seed, lengths.seed, "seed");
      return seed;
    };
    const utils = { randomSecretKey };
    Object.freeze(lengths);
    Object.freeze(utils);
    return Object.freeze({
      keygen: createKeygen(randomSecretKey, getPublicKey),
      getSharedSecret,
      getPublicKey,
      scalarMult,
      scalarMultBase,
      utils,
      GuBytes: GuBytes.slice(),
      lengths
    });
  }

  // node_modules/@noble/curves/ed25519.js
  /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  var _0n6 = /* @__PURE__ */ BigInt(0);
  var _1n6 = /* @__PURE__ */ BigInt(1);
  var _2n4 = /* @__PURE__ */ BigInt(2);
  var _3n2 = /* @__PURE__ */ BigInt(3);
  var _5n2 = /* @__PURE__ */ BigInt(5);
  var _8n3 = /* @__PURE__ */ BigInt(8);
  var ed25519_CURVE_p = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed");
  var ed25519_CURVE = /* @__PURE__ */ (() => ({
    p: ed25519_CURVE_p,
    n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
    h: _8n3,
    a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
    d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
    Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
    Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
  }))();
  function ed25519_pow_2_252_3(x) {
    const _10n = BigInt(10), _20n = BigInt(20), _40n = BigInt(40), _80n = BigInt(80);
    const P = ed25519_CURVE_p;
    const x2 = x * x % P;
    const b2 = x2 * x % P;
    const b4 = pow2(b2, _2n4, P) * b2 % P;
    const b5 = pow2(b4, _1n6, P) * x % P;
    const b10 = pow2(b5, _5n2, P) * b5 % P;
    const b20 = pow2(b10, _10n, P) * b10 % P;
    const b40 = pow2(b20, _20n, P) * b20 % P;
    const b80 = pow2(b40, _40n, P) * b40 % P;
    const b160 = pow2(b80, _80n, P) * b80 % P;
    const b240 = pow2(b160, _80n, P) * b80 % P;
    const b250 = pow2(b240, _10n, P) * b10 % P;
    const pow_p_5_8 = pow2(b250, _2n4, P) * x % P;
    return { pow_p_5_8, b2 };
  }
  function adjustScalarBytes(bytes) {
    bytes[0] &= 248;
    bytes[31] &= 127;
    bytes[31] |= 64;
    return bytes;
  }
  var ED25519_SQRT_M1 = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
  function uvRatio(u, v) {
    const P = ed25519_CURVE_p;
    const v3 = mod(v * v * v, P);
    const v7 = mod(v3 * v3 * v, P);
    const pow = ed25519_pow_2_252_3(u * v7).pow_p_5_8;
    let x = mod(u * v3 * pow, P);
    const vx2 = mod(v * x * x, P);
    const root1 = x;
    const root2 = mod(x * ED25519_SQRT_M1, P);
    const useRoot1 = vx2 === u;
    const useRoot2 = vx2 === mod(-u, P);
    const noRoot = vx2 === mod(-u * ED25519_SQRT_M1, P);
    if (useRoot1)
      x = root1;
    if (useRoot2 || noRoot)
      x = root2;
    if (isNegativeLE(x, P))
      x = mod(-x, P);
    return { isValid: useRoot1 || useRoot2, value: x };
  }
  var ed25519_Point = /* @__PURE__ */ edwards(ed25519_CURVE, { uvRatio });
  var x25519 = /* @__PURE__ */ (() => {
    const P = ed25519_CURVE_p;
    const powPminus2 = (x) => {
      const { pow_p_5_8, b2 } = ed25519_pow_2_252_3(x);
      return mod(pow2(pow_p_5_8, _3n2, P) * b2, P);
    };
    return montgomery({
      P,
      type: "x25519",
      powPminus2,
      adjustScalarBytes,
      scalarMultBase: (k) => {
        const kn = mod(k, ed25519_Point.Fn.ORDER);
        if (kn === _0n6)
          return _0n6;
        const p = ed25519_Point.BASE.multiply(kn);
        return mod((p.Z + p.Y) * powPminus2(mod(p.Z - p.Y, P)), P);
      }
    });
  })();

  // node_modules/@noble/ciphers/utils.js
  /*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
  function isBytes3(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
  }
  var atitle3 = (title) => title ? `"${title}" ` : "";
  function abool2(value, title = "") {
    if (typeof value !== "boolean")
      throw new TypeError(atitle3(title) + "expected boolean, got type=" + typeof value);
    return value;
  }
  function anumber3(n, title = "") {
    if (typeof n !== "number")
      throw new TypeError(atitle3(title) + "expected number, got " + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new RangeError(atitle3(title) + "expected integer >= 0, got " + n);
    return n;
  }
  function abytes3(value, length, title = "") {
    if (isBytes3(value) && (length === undefined || value.length === length))
      return value;
    if (length !== undefined)
      anumber3(length, "length");
    const bytes = isBytes3(value);
    const ofLen = length !== undefined ? ` of length ${length}` : "";
    const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle3(title) + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  function aexists2(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("hash was destroyed");
    if (checkFinished && instance.finished)
      throw new Error("digest() was already called");
  }
  function aoutput2(out, instance) {
    abytes3(out, undefined, "output");
    const min = instance.outputLen;
    if (!(out.length >= min)) {
      throw new RangeError('"output" expected length >= ' + min);
    }
  }
  function aoutput32(out, instance) {
    aoutput2(out, instance);
    if (!isAligned32(out))
      throw new Error("invalid output, must be aligned");
  }
  function u8(arr) {
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean2(...arrays) {
    for (let i = 0;i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView2(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
  function byteSwap(word) {
    return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
  }
  var swap8IfBE = isLE ? (n) => n : (n) => byteSwap(n) >>> 0;
  function byteSwap32(arr) {
    for (let i = 0;i < arr.length; i++) {
      arr[i] = byteSwap(arr[i]);
    }
    return arr;
  }
  var swap32IfBE = isLE ? (u) => u : byteSwap32;
  function equalBytes(a, b) {
    a = abytes3(a);
    b = abytes3(b);
    if (a.length !== b.length)
      return false;
    let diff = 0;
    for (let i = 0;i < a.length; i++)
      diff |= a[i] ^ b[i];
    return diff === 0;
  }
  function wrapMacConstructor(keyLen, macCons, fromMsg) {
    const mac = macCons;
    const getArgs = fromMsg || (() => []);
    const macC = (msg, key) => mac(key, ...getArgs(msg)).update(msg).digest();
    const tmp = mac(new Uint8Array(keyLen), ...getArgs(new Uint8Array(0)));
    macC.outputLen = tmp.outputLen;
    macC.blockLen = tmp.blockLen;
    macC.create = (key, ...args) => mac(key, ...args);
    return macC;
  }
  var wrapCipher = (params, constructor) => {
    function wrappedCipher(key, ...args) {
      abytes3(key, undefined, "key");
      if (params.nonceLength !== undefined) {
        const nonce = args[0];
        abytes3(nonce, params.varSizeNonce ? undefined : params.nonceLength, "nonce");
      }
      const tagl = params.tagLength;
      const aadStart = params.nonceLength !== undefined ? 1 : 0;
      if (!params.withAAD) {
        for (let i = aadStart;i < args.length; i++)
          if (isBytes3(args[i]))
            throw new Error("AAD not supported");
      }
      if (params.withAAD && args[aadStart] !== undefined)
        abytes3(args[aadStart], undefined, "AAD");
      const cipher = constructor(key, ...args);
      const checkOutput = (fnLength, output) => {
        if (output !== undefined) {
          if (fnLength !== 2)
            throw new Error("cipher output not supported");
          abytes3(output, undefined, "output");
        }
      };
      let called = false;
      const wrCipher = {
        encrypt(data, output) {
          if (called)
            throw new Error("cannot encrypt() twice with same key + nonce");
          called = true;
          abytes3(data, undefined, "data");
          checkOutput(cipher.encrypt.length, output);
          return cipher.encrypt(data, output);
        },
        decrypt(data, output) {
          abytes3(data, undefined, "data");
          if (tagl && data.length < tagl)
            throw new Error('"ciphertext" expected length >= tagLength=' + tagl);
          checkOutput(cipher.decrypt.length, output);
          return cipher.decrypt(data, output);
        }
      };
      return wrCipher;
    }
    Object.assign(wrappedCipher, params);
    return wrappedCipher;
  };
  function getOutput(expectedLength, out, onlyAligned = true) {
    if (out === undefined)
      return new Uint8Array(expectedLength);
    abytes3(out, expectedLength, "output");
    if (onlyAligned && !isAligned32(out))
      throw new Error("invalid output, must be aligned");
    return out;
  }
  function u64Lengths(dataLength, aadLength, isLE) {
    anumber3(dataLength);
    anumber3(aadLength);
    abool2(isLE);
    const num = new Uint8Array(16);
    const view = createView2(num);
    view.setBigUint64(0, BigInt(aadLength), isLE);
    view.setBigUint64(8, BigInt(dataLength), isLE);
    return num;
  }
  function isAligned32(bytes) {
    return bytes.byteOffset % 4 === 0;
  }
  function copyBytes2(bytes) {
    return Uint8Array.from(abytes3(bytes));
  }

  // node_modules/@noble/ciphers/_polyval.js
  var BLOCK_SIZE = 16;
  var ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
  var ZEROS32 = /* @__PURE__ */ u32(ZEROS16);
  var POLY = 225;
  var mul2 = (s0, s1, s2, s3) => {
    const hiBit = s3 & 1;
    return {
      s3: s2 << 31 | s3 >>> 1,
      s2: s1 << 31 | s2 >>> 1,
      s1: s0 << 31 | s1 >>> 1,
      s0: s0 >>> 1 ^ POLY << 24 & -(hiBit & 1)
    };
  };
  var swapLE = (n) => (n >>> 0 & 255) << 24 | (n >>> 8 & 255) << 16 | (n >>> 16 & 255) << 8 | n >>> 24 & 255 | 0;
  var estimateWindow = (bytes) => {
    if (bytes > 64 * 1024)
      return 8;
    if (bytes > 1024)
      return 4;
    return 2;
  };

  class GHASH {
    blockLen = BLOCK_SIZE;
    outputLen = BLOCK_SIZE;
    s0 = 0;
    s1 = 0;
    s2 = 0;
    s3 = 0;
    finished = false;
    destroyed = false;
    t;
    W;
    windowSize;
    constructor(key, expectedLength) {
      abytes3(key, 16, "key");
      key = copyBytes2(key);
      const kView = createView2(key);
      let k0 = kView.getUint32(0, false);
      let k1 = kView.getUint32(4, false);
      let k2 = kView.getUint32(8, false);
      let k3 = kView.getUint32(12, false);
      const doubles = [];
      for (let i = 0;i < 128; i++) {
        doubles.push({ s0: swapLE(k0), s1: swapLE(k1), s2: swapLE(k2), s3: swapLE(k3) });
        ({ s0: k0, s1: k1, s2: k2, s3: k3 } = mul2(k0, k1, k2, k3));
      }
      const W = estimateWindow(expectedLength || 1024);
      if (![1, 2, 4, 8].includes(W))
        throw new Error("ghash: invalid window size, expected 2, 4 or 8");
      this.W = W;
      const bits = 128;
      const windows = bits / W;
      const windowSize = this.windowSize = 2 ** W;
      const items = [];
      for (let w = 0;w < windows; w++) {
        for (let byte = 0;byte < windowSize; byte++) {
          let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
          for (let j = 0;j < W; j++) {
            const bit = byte >>> W - j - 1 & 1;
            if (!bit)
              continue;
            const { s0: d0, s1: d1, s2: d2, s3: d3 } = doubles[W * w + j];
            s0 ^= d0, s1 ^= d1, s2 ^= d2, s3 ^= d3;
          }
          items.push({ s0, s1, s2, s3 });
        }
      }
      this.t = items;
    }
    _updateBlock(s0, s1, s2, s3) {
      s0 ^= this.s0, s1 ^= this.s1, s2 ^= this.s2, s3 ^= this.s3;
      const { W, t, windowSize } = this;
      let o0 = 0, o1 = 0, o2 = 0, o3 = 0;
      const mask = (1 << W) - 1;
      let w = 0;
      for (const num of [s0, s1, s2, s3]) {
        for (let bytePos = 0;bytePos < 4; bytePos++) {
          const byte = num >>> 8 * bytePos & 255;
          for (let bitPos = 8 / W - 1;bitPos >= 0; bitPos--) {
            const bit = byte >>> W * bitPos & mask;
            const { s0: e0, s1: e1, s2: e2, s3: e3 } = t[w * windowSize + bit];
            o0 ^= e0, o1 ^= e1, o2 ^= e2, o3 ^= e3;
            w += 1;
          }
        }
      }
      this.s0 = o0;
      this.s1 = o1;
      this.s2 = o2;
      this.s3 = o3;
    }
    update(data) {
      aexists2(this);
      abytes3(data);
      data = copyBytes2(data);
      const b32 = u32(data);
      const blocks = Math.floor(data.length / BLOCK_SIZE);
      const left = data.length % BLOCK_SIZE;
      for (let i = 0;i < blocks; i++) {
        this._updateBlock(swap8IfBE(b32[i * 4 + 0]), swap8IfBE(b32[i * 4 + 1]), swap8IfBE(b32[i * 4 + 2]), swap8IfBE(b32[i * 4 + 3]));
      }
      if (left) {
        ZEROS16.set(data.subarray(blocks * BLOCK_SIZE));
        this._updateBlock(swap8IfBE(ZEROS32[0]), swap8IfBE(ZEROS32[1]), swap8IfBE(ZEROS32[2]), swap8IfBE(ZEROS32[3]));
        clean2(ZEROS32);
      }
      return this;
    }
    destroy() {
      this.destroyed = true;
      const { t } = this;
      for (const elm of t) {
        elm.s0 = 0, elm.s1 = 0, elm.s2 = 0, elm.s3 = 0;
      }
    }
    digestInto(out) {
      aexists2(this);
      aoutput32(out, this);
      this.finished = true;
      const { s0, s1, s2, s3 } = this;
      const o32 = u32(out);
      o32[0] = s0;
      o32[1] = s1;
      o32[2] = s2;
      o32[3] = s3;
      if (!isLE)
        swap32IfBE(o32.subarray(0, BLOCK_SIZE / 4));
    }
    digest() {
      const res = new Uint8Array(BLOCK_SIZE);
      this.digestInto(res);
      this.destroy();
      return res;
    }
  }
  var ghash = /* @__PURE__ */ wrapMacConstructor(16, (key, expectedLength) => new GHASH(key, expectedLength), (msg) => [msg.length]);

  // node_modules/@noble/ciphers/aes.js
  var BLOCK_SIZE2 = 16;
  var BLOCK_SIZE32 = 4;
  var EMPTY_BLOCK = /* @__PURE__ */ new Uint8Array(BLOCK_SIZE2);
  var POLY2 = 283;
  function validateKeyLength(key) {
    if (![16, 24, 32].includes(key.length))
      throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + key.length);
  }
  function mul22(n) {
    return n << 1 ^ POLY2 & -(n >> 7);
  }
  function mul(a, b) {
    let res = 0;
    for (;b > 0; b >>= 1) {
      res ^= a & -(b & 1);
      a = mul22(a);
    }
    return res;
  }
  var sbox = /* @__PURE__ */ (() => {
    const t = new Uint8Array(256);
    for (let i = 0, x = 1;i < 256; i++, x ^= mul22(x))
      t[i] = x;
    const box = new Uint8Array(256);
    box[0] = 99;
    for (let i = 0;i < 255; i++) {
      let x = t[255 - i];
      x |= x << 8;
      box[t[i]] = (x ^ x >> 4 ^ x >> 5 ^ x >> 6 ^ x >> 7 ^ 99) & 255;
    }
    clean2(t);
    return box;
  })();
  var rotr32_8 = (n) => n << 24 | n >>> 8;
  var rotl32_8 = (n) => n << 8 | n >>> 24;
  function genTtable(sbox, fn) {
    if (sbox.length !== 256)
      throw new Error("wrong sbox length");
    const T0 = new Uint32Array(256).map((_, j) => fn(sbox[j]));
    const T1 = T0.map(rotl32_8);
    const T2 = T1.map(rotl32_8);
    const T3 = T2.map(rotl32_8);
    const T01 = new Uint32Array(256 * 256);
    const T23 = new Uint32Array(256 * 256);
    const sbox2 = new Uint16Array(256 * 256);
    for (let i = 0;i < 256; i++) {
      for (let j = 0;j < 256; j++) {
        const idx = i * 256 + j;
        T01[idx] = T0[i] ^ T1[j];
        T23[idx] = T2[i] ^ T3[j];
        sbox2[idx] = sbox[i] << 8 | sbox[j];
      }
    }
    return { sbox, sbox2, T0, T1, T2, T3, T01, T23 };
  }
  var tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => mul(s, 3) << 24 | s << 16 | s << 8 | mul(s, 2));
  var xPowers = /* @__PURE__ */ (() => {
    const p = new Uint8Array(16);
    for (let i = 0, x = 1;i < 16; i++, x = mul22(x))
      p[i] = x;
    return p;
  })();
  function expandKeyLE(key) {
    abytes3(key);
    const len = key.length;
    validateKeyLength(key);
    const { sbox2 } = tableEncoding;
    const toClean = [];
    if (!isLE || !isAligned32(key))
      toClean.push(key = copyBytes2(key));
    const k32 = swap32IfBE(u32(key));
    const Nk = k32.length;
    const subByte = (n) => applySbox(sbox2, n, n, n, n);
    const xk = new Uint32Array(len + 28);
    xk.set(k32);
    for (let i = Nk;i < xk.length; i++) {
      let t = xk[i - 1];
      if (i % Nk === 0)
        t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
      else if (Nk > 6 && i % Nk === 4)
        t = subByte(t);
      xk[i] = xk[i - Nk] ^ t;
    }
    clean2(...toClean);
    return xk;
  }
  function apply0123(T01, T23, s0, s1, s2, s3) {
    return T01[s0 << 8 & 65280 | s1 >>> 8 & 255] ^ T23[s2 >>> 8 & 65280 | s3 >>> 24 & 255];
  }
  function applySbox(sbox2, s0, s1, s2, s3) {
    return sbox2[s0 & 255 | s1 & 65280] | sbox2[s2 >>> 16 & 255 | s3 >>> 16 & 65280] << 16;
  }
  function encrypt(xk, s0, s1, s2, s3) {
    const { sbox2, T01, T23 } = tableEncoding;
    let k = 0;
    s0 ^= xk[k++], s1 ^= xk[k++], s2 ^= xk[k++], s3 ^= xk[k++];
    const rounds = xk.length / 4 - 2;
    for (let i = 0;i < rounds; i++) {
      const t0 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
      const t1 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
      const t2 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
      const t3 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
      s0 = t0, s1 = t1, s2 = t2, s3 = t3;
    }
    const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
    const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
    const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
    const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
    return { s0: t0, s1: t1, s2: t2, s3: t3 };
  }
  function ctr32(xk, isLE, nonce, src, dst) {
    abytes3(nonce, BLOCK_SIZE2, "nonce");
    abytes3(src);
    dst = getOutput(src.length, dst);
    const ctr = nonce;
    const c32 = u32(ctr);
    const view = createView2(ctr);
    const src32 = u32(src);
    const dst32 = u32(dst);
    const ctrPos = isLE ? 0 : 12;
    const srcLen = src.length;
    let ctrNum = view.getUint32(ctrPos, isLE);
    for (let i = 0;i + 4 <= src32.length; i += 4) {
      const { s0, s1, s2, s3 } = encrypt(xk, swap8IfBE(c32[0]), swap8IfBE(c32[1]), swap8IfBE(c32[2]), swap8IfBE(c32[3]));
      dst32[i + 0] = src32[i + 0] ^ swap8IfBE(s0);
      dst32[i + 1] = src32[i + 1] ^ swap8IfBE(s1);
      dst32[i + 2] = src32[i + 2] ^ swap8IfBE(s2);
      dst32[i + 3] = src32[i + 3] ^ swap8IfBE(s3);
      ctrNum = ctrNum + 1 >>> 0;
      view.setUint32(ctrPos, ctrNum, isLE);
    }
    const start = BLOCK_SIZE2 * Math.floor(src32.length / BLOCK_SIZE32);
    if (start < srcLen) {
      const { s0, s1, s2, s3 } = encrypt(xk, swap8IfBE(c32[0]), swap8IfBE(c32[1]), swap8IfBE(c32[2]), swap8IfBE(c32[3]));
      const b32 = new Uint32Array([s0, s1, s2, s3]);
      swap32IfBE(b32);
      const buf = u8(b32);
      for (let i = start, pos = 0;i < srcLen; i++, pos++)
        dst[i] = src[i] ^ buf[pos];
      clean2(b32);
    }
    return dst;
  }
  function computeTag(fn, isLE, key, data, AAD) {
    const aadLength = AAD ? AAD.length : 0;
    const h = fn.create(key, data.length + aadLength);
    if (AAD)
      h.update(AAD);
    const num = u64Lengths(8 * data.length, 8 * aadLength, isLE);
    h.update(data);
    h.update(num);
    const res = h.digest();
    clean2(num);
    return res;
  }
  var gcm = /* @__PURE__ */ wrapCipher({ blockSize: 16, nonceLength: 12, tagLength: 16, withAAD: true, varSizeNonce: true }, function aesgcm(key, nonce, AAD) {
    if (nonce.length < 8)
      throw new Error("aes/gcm: invalid nonce length");
    const tagLength = 16;
    function _computeTag(authKey, tagMask, data) {
      const tag = computeTag(ghash, false, authKey, data, AAD);
      for (let i = 0;i < tagMask.length; i++)
        tag[i] ^= tagMask[i];
      return tag;
    }
    function deriveKeys() {
      const xk = expandKeyLE(key);
      const authKey = EMPTY_BLOCK.slice();
      const counter = EMPTY_BLOCK.slice();
      ctr32(xk, false, counter, counter, authKey);
      if (nonce.length === 12) {
        counter.set(nonce);
      } else {
        const nonceLen = EMPTY_BLOCK.slice();
        const view = createView2(nonceLen);
        view.setBigUint64(8, BigInt(nonce.length * 8), false);
        const g = ghash.create(authKey).update(nonce).update(nonceLen);
        g.digestInto(counter);
        g.destroy();
      }
      const tagMask = ctr32(xk, false, counter, EMPTY_BLOCK);
      return { xk, authKey, counter, tagMask };
    }
    return {
      encrypt(plaintext) {
        const { xk, authKey, counter, tagMask } = deriveKeys();
        const out = new Uint8Array(plaintext.length + tagLength);
        const toClean = [xk, authKey, counter, tagMask];
        if (!isAligned32(plaintext))
          toClean.push(plaintext = copyBytes2(plaintext));
        ctr32(xk, false, counter, plaintext, out.subarray(0, plaintext.length));
        const tag = _computeTag(authKey, tagMask, out.subarray(0, out.length - tagLength));
        toClean.push(tag);
        out.set(tag, plaintext.length);
        clean2(...toClean);
        return out;
      },
      decrypt(ciphertext) {
        const { xk, authKey, counter, tagMask } = deriveKeys();
        const toClean = [xk, authKey, tagMask, counter];
        if (!isAligned32(ciphertext))
          toClean.push(ciphertext = copyBytes2(ciphertext));
        const data = ciphertext.subarray(0, -tagLength);
        const passedTag = ciphertext.subarray(-tagLength);
        const tag = _computeTag(authKey, tagMask, data);
        toClean.push(tag);
        if (!equalBytes(tag, passedTag)) {
          clean2(...toClean);
          throw new Error("aes-gcm: invalid tag");
        }
        const out = ctr32(xk, false, counter, data);
        clean2(...toClean);
        return out;
      }
    };
  });

  // node_modules/@noble/hashes/hmac.js
  class _HMAC {
    oHash;
    iHash;
    blockLen;
    outputLen;
    canXOF = false;
    finished = false;
    destroyed = false;
    constructor(hash, key) {
      ahash(hash);
      abytes(key, undefined, "key");
      this.iHash = hash.create();
      if (typeof this.iHash.update !== "function")
        throw new Error("expected Hash instance");
      this.blockLen = this.iHash.blockLen;
      this.outputLen = this.iHash.outputLen;
      const blockLen = this.blockLen;
      const pad = new Uint8Array(blockLen);
      pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
      for (let i = 0;i < pad.length; i++)
        pad[i] ^= 54;
      this.iHash.update(pad);
      this.oHash = hash.create();
      for (let i = 0;i < pad.length; i++)
        pad[i] ^= 54 ^ 92;
      this.oHash.update(pad);
      clean(pad);
    }
    update(buf) {
      aexists(this);
      this.iHash.update(buf);
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const buf = out.subarray(0, this.outputLen);
      this.iHash.digestInto(buf);
      this.oHash.update(buf);
      this.oHash.digestInto(buf);
      this.destroy();
    }
    digest() {
      const out = new Uint8Array(this.oHash.outputLen);
      this.digestInto(out);
      return out;
    }
    _cloneInto(to) {
      to ||= Object.create(Object.getPrototypeOf(this), {});
      const { oHash, iHash, finished, destroyed, blockLen, outputLen, canXOF } = this;
      to = to;
      to.finished = finished;
      to.destroyed = destroyed;
      to.blockLen = blockLen;
      to.outputLen = outputLen;
      to.canXOF = canXOF;
      to.oHash = oHash._cloneInto(to.oHash);
      to.iHash = iHash._cloneInto(to.iHash);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
    destroy() {
      this.destroyed = true;
      this.oHash.destroy();
      this.iHash.destroy();
    }
  }
  var hmac = /* @__PURE__ */ (() => {
    const hmac_ = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
    hmac_.create = (hash, key) => new _HMAC(hash, key);
    return hmac_;
  })();

  // node_modules/@noble/hashes/hkdf.js
  var HKDF_COUNTER = /* @__PURE__ */ Uint8Array.of(0);
  var EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
  function expand(hash, prk, info, length = 32, _recycled) {
    ahash(hash);
    anumber(length, "length");
    abytes(prk, undefined, "prk");
    const olen = hash.outputLen;
    if (prk.length < olen)
      throw new Error('"prk" must be at least HashLen octets');
    if (length > 255 * olen)
      throw new Error("Length must be <= 255*HashLen");
    const blocks = Math.ceil(length / olen);
    if (info === undefined)
      info = EMPTY_BUFFER;
    else
      abytes(info, undefined, "info");
    if (!blocks) {
      if (_recycled)
        clean(prk);
      return new Uint8Array;
    }
    const okm = _recycled && blocks === 1 ? prk : new Uint8Array(blocks * olen);
    const { iHash, oHash } = hmac.create(hash, prk);
    const T = _recycled ? prk : new Uint8Array(olen);
    const worker = blocks > 1 ? _recycled?.iHash || hash.create() : undefined;
    for (let counter = 0;counter < blocks - 1; counter++) {
      HKDF_COUNTER[0] = counter + 1;
      const iWork = iHash._cloneInto(worker);
      if (counter)
        iWork.update(T);
      iWork.update(info).update(HKDF_COUNTER).digestInto(T);
      oHash._cloneInto(worker).update(T).digestInto(T);
      okm.set(T, olen * counter);
    }
    HKDF_COUNTER[0] = blocks;
    if (blocks > 1)
      iHash.update(T);
    iHash.update(info).update(HKDF_COUNTER).digestInto(T);
    oHash.update(T).digestInto(T);
    okm.set(T, olen * (blocks - 1));
    iHash.destroy();
    oHash.destroy();
    worker?.destroy();
    if (T !== okm)
      clean(T);
    clean(HKDF_COUNTER);
    if (length === okm.length)
      return okm;
    const res = okm.slice(0, length);
    clean(okm);
    return res;
  }
  var hkdf = (hash, ikm, salt, info, length) => {
    ahash(hash);
    if (salt === undefined)
      salt = new Uint8Array(hash.outputLen);
    const HMAC = hmac.create(hash, salt).update(ikm);
    return expand(hash, HMAC.digest(), info, length, HMAC);
  };

  // bunny-src/crypto.ts
  var rngKind = "pool";
  function probeRng() {
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === "function") {
      try {
        const probe = new Uint8Array(8);
        c.getRandomValues(probe);
        if (probe.some((b) => b !== 0) || probe[0] !== 0) {
          rngKind = "webcrypto";
          return;
        }
      } catch {}
    }
    rngKind = "pool";
  }
  var pool = new Uint8Array(32);
  var poolPos = 32;
  var poolCounter = 0;
  var poolSeeded = false;
  function reseedPool() {
    const chunk = new Uint8Array(48);
    const dv = new DataView(chunk.buffer);
    let off = 0;
    const put = (v) => {
      dv.setUint32(off % 48, v >>> 0 ^ off * 2654435761, false);
      off += 4;
    };
    put(Date.now());
    put(performance.now() * 1000);
    put(poolCounter++);
    for (let i = 0;i < 5; i++)
      put(Math.floor(Math.random() * 4294967295));
    put(Date.now() % 1e6);
    const mixed = sha256(chunk);
    for (let i = 0;i < 32; i++)
      pool[i] ^= mixed[i];
  }
  function poolRandom(n) {
    const out = new Uint8Array(n);
    for (let i = 0;i < n; i++) {
      if (poolPos >= 32) {
        reseedPool();
        pool = sha256(pool);
        poolPos = 0;
      }
      out[i] = pool[poolPos++];
    }
    return out;
  }
  function randomBytes3(n) {
    if (!poolSeeded) {
      probeRng();
      poolSeeded = true;
    }
    if (rngKind === "webcrypto") {
      const out = new Uint8Array(n);
      globalThis.crypto.getRandomValues(out);
      return out;
    }
    return poolRandom(n);
  }
  function hasNativeRng() {
    if (!poolSeeded) {
      probeRng();
      poolSeeded = true;
    }
    return rngKind === "webcrypto";
  }
  function utf8(s) {
    const out = [];
    for (let i = 0;i < s.length; i++) {
      let cp = s.charCodeAt(i);
      if (cp >= 55296 && cp <= 56319 && i + 1 < s.length) {
        const lo = s.charCodeAt(i + 1);
        if (lo >= 56320 && lo <= 57343) {
          cp = 65536 + (cp - 55296 << 10) + (lo - 56320);
          i++;
        }
      }
      if (cp < 128) {
        out.push(cp);
      } else if (cp < 2048) {
        out.push(192 | cp >> 6, 128 | cp & 63);
      } else if (cp < 65536) {
        out.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
      } else {
        out.push(240 | cp >> 18, 128 | cp >> 12 & 63, 128 | cp >> 6 & 63, 128 | cp & 63);
      }
    }
    return new Uint8Array(out);
  }
  var BAD_UTF8 = "invalid UTF-8 data";
  function utf8dStrict(b) {
    let out = "";
    for (let i = 0;i < b.length; ) {
      const c = b[i];
      if (c < 128) {
        out += String.fromCharCode(c);
        i += 1;
        continue;
      }
      let len, cp;
      if ((c & 224) === 192) {
        len = 2;
        cp = c & 31;
      } else if ((c & 240) === 224) {
        len = 3;
        cp = c & 15;
      } else if ((c & 248) === 240) {
        len = 4;
        cp = c & 7;
      } else
        throw new Error(BAD_UTF8);
      if (i + len > b.length)
        throw new Error(BAD_UTF8);
      for (let k = 1;k < len; k++) {
        if ((b[i + k] & 192) !== 128)
          throw new Error(BAD_UTF8);
        cp = cp << 6 | b[i + k] & 63;
      }
      if (len === 2 && cp < 128)
        throw new Error(BAD_UTF8);
      if (len === 3 && cp < 2048)
        throw new Error(BAD_UTF8);
      if (len === 4 && cp < 65536)
        throw new Error(BAD_UTF8);
      if (cp >= 55296 && cp <= 57343)
        throw new Error(BAD_UTF8);
      if (cp > 1114111)
        throw new Error(BAD_UTF8);
      if (cp < 65536)
        out += String.fromCharCode(cp);
      else
        out += String.fromCharCode(55296 + (cp - 65536 >> 10), 56320 + (cp - 65536 & 1023));
      i += len;
    }
    return out;
  }
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function b64encode(bytes) {
    let out = "";
    for (let i = 0;i < bytes.length; i += 3) {
      const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      out += B64[b0 >> 2];
      out += B64[(b0 & 3) << 4 | (b1 === undefined ? 0 : b1 >> 4)];
      out += b1 === undefined ? "=" : B64[(b1 & 15) << 2 | (b2 === undefined ? 0 : b2 >> 6)];
      out += b2 === undefined ? "=" : B64[b2 & 63];
    }
    return out;
  }
  var B64_REV = {};
  for (let i = 0;i < 64; i++)
    B64_REV[B64[i]] = i;
  function b64decode(b64) {
    const clean = b64.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
    let o = 0, buf = 0, bits = 0;
    for (const ch of clean) {
      const v = B64_REV[ch];
      if (v === undefined)
        throw new Error("invalid base64");
      buf = buf << 6 | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[o++] = buf >> bits & 255;
      }
    }
    if (o !== out.length)
      throw new Error("invalid base64");
    return out;
  }
  function concat(...arrays) {
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) {
      out.set(a, off);
      off += a.length;
    }
    return out;
  }
  function bytesEqual(a, b) {
    if (a.length !== b.length)
      return false;
    let diff = 0;
    for (let i = 0;i < a.length; i++)
      diff |= a[i] ^ b[i];
    return diff === 0;
  }
  async function generateDH() {
    const kp = x25519.keygen(randomBytes3(32));
    return { privateKey: kp.secretKey, publicKey: kp.publicKey };
  }
  async function dh(priv, peerPub) {
    return x25519.getSharedSecret(priv, peerPub);
  }
  async function hkdfSha256(ikm, salt, info, length) {
    return hkdf(sha256, ikm, salt, info, length);
  }
  async function hmac2(keyBytes, data) {
    return hmac(sha256, keyBytes, data);
  }
  async function exportPrivateJwk(k) {
    return { kty: "oct", crv: "X25519", k: b64url(k) };
  }
  async function importPrivateJwk(j) {
    if (j.kty !== "oct" || j.crv !== "X25519") {
      throw new Error(`unsupported key JWK: kty=${j.kty} crv=${j.crv}`);
    }
    const raw = b64urlDecode(j.k);
    if (raw.length !== 32)
      throw new Error("bad X25519 private key length");
    return raw;
  }
  function b64url(bytes) {
    return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(s) {
    const std = s.replace(/-/g, "+").replace(/_/g, "/");
    return b64decode(std + "=".repeat((4 - std.length % 4) % 4));
  }
  async function kdfRK(rk, dhOut) {
    const out = await hkdfSha256(dhOut, rk, utf8("vencord-e2ee/rk"), 64);
    return { rk: out.slice(0, 32), ck: out.slice(32, 64) };
  }
  async function kdfCK(ck) {
    const mk = await hmac2(ck, new Uint8Array([1]));
    const next = await hmac2(ck, new Uint8Array([2]));
    return { ck: next, mk };
  }
  async function aeadEncrypt(mk, plaintext, ad) {
    const expanded = await hkdfSha256(mk, new Uint8Array(32), utf8("vencord-e2ee/aead"), 44);
    const cipher = gcm(expanded.slice(0, 32), expanded.slice(32, 44), ad);
    return cipher.encrypt(plaintext);
  }
  async function aeadDecrypt(mk, ciphertext, ad) {
    const expanded = await hkdfSha256(mk, new Uint8Array(32), utf8("vencord-e2ee/aead"), 44);
    const cipher = gcm(expanded.slice(0, 32), expanded.slice(32, 44), ad);
    return cipher.decrypt(ciphertext);
  }
  function serializeHeader(h) {
    const out = new Uint8Array(40);
    out.set(h.dh, 0);
    new DataView(out.buffer).setUint32(32, h.pn, false);
    new DataView(out.buffer).setUint32(36, h.n, false);
    return out;
  }
  function parseHeader(b) {
    if (b.length < 40)
      throw new Error("header too short");
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return {
      dh: b.slice(0, 32),
      pn: dv.getUint32(32, false),
      n: dv.getUint32(36, false)
    };
  }
  var MAX_SKIP = 200;
  async function ratchetInitAlice(SK, bobDHpub) {
    const DHs = await generateDH();
    const dhOut = await dh(DHs.privateKey, bobDHpub);
    const { rk, ck } = await kdfRK(SK, dhOut);
    return {
      DHs,
      DHr: bobDHpub,
      RK: rk,
      CKs: ck,
      CKr: null,
      Ns: 0,
      Nr: 0,
      PN: 0,
      skipped: {}
    };
  }
  function ratchetInitBob(SK, bobKP) {
    return {
      DHs: bobKP,
      DHr: null,
      RK: SK,
      CKs: null,
      CKr: null,
      Ns: 0,
      Nr: 0,
      PN: 0,
      skipped: {}
    };
  }
  async function ratchetEncrypt(s, plaintext, ad) {
    if (!s.CKs || !s.DHs)
      throw new Error("no sending chain (Bob must wait for Alice's first message)");
    const { ck: nextCK, mk } = await kdfCK(s.CKs);
    s.CKs = nextCK;
    const header = { dh: s.DHs.publicKey, pn: s.PN, n: s.Ns };
    s.Ns += 1;
    const headerBytes = serializeHeader(header);
    const ct = await aeadEncrypt(mk, plaintext, concat(ad, headerBytes));
    return concat(headerBytes, ct);
  }
  async function ratchetDecrypt(s, msg, ad) {
    const headerBytes = msg.slice(0, 40);
    const ct = msg.slice(40);
    const h = parseHeader(headerBytes);
    const c = { ...s, skipped: { ...s.skipped } };
    const skipKey = b64encode(h.dh) + ":" + h.n;
    if (c.skipped[skipKey]) {
      const mk = c.skipped[skipKey];
      delete c.skipped[skipKey];
      const pt = await aeadDecrypt(mk, ct, concat(ad, headerBytes));
      Object.assign(s, c);
      return pt;
    }
    if (!c.DHr || !bytesEqual(h.dh, c.DHr)) {
      await skipMessageKeys(c, h.pn);
      await dhRatchet(c, h.dh);
    }
    await skipMessageKeys(c, h.n);
    if (!c.CKr)
      throw new Error("no receive chain");
    const { ck: nextCK, mk } = await kdfCK(c.CKr);
    c.CKr = nextCK;
    c.Nr += 1;
    const pt = await aeadDecrypt(mk, ct, concat(ad, headerBytes));
    Object.assign(s, c);
    return pt;
  }
  async function skipMessageKeys(s, until) {
    if (!s.CKr)
      return;
    if (s.Nr + MAX_SKIP < until)
      throw new Error("too many skipped messages");
    while (s.Nr < until) {
      const { ck: nextCK, mk } = await kdfCK(s.CKr);
      s.CKr = nextCK;
      if (s.DHr)
        s.skipped[b64encode(s.DHr) + ":" + s.Nr] = mk;
      s.Nr += 1;
    }
    const keys = Object.keys(s.skipped);
    for (let i = 0;i < keys.length - MAX_SKIP; i++)
      delete s.skipped[keys[i]];
  }
  async function dhRatchet(s, peerNewDH) {
    s.PN = s.Ns;
    s.Ns = 0;
    s.Nr = 0;
    s.DHr = peerNewDH;
    if (!s.DHs)
      throw new Error("no own ratchet key");
    const dhOut1 = await dh(s.DHs.privateKey, peerNewDH);
    const r1 = await kdfRK(s.RK, dhOut1);
    s.RK = r1.rk;
    s.CKr = r1.ck;
    s.DHs = await generateDH();
    const dhOut2 = await dh(s.DHs.privateKey, peerNewDH);
    const r2 = await kdfRK(s.RK, dhOut2);
    s.RK = r2.rk;
    s.CKs = r2.ck;
  }
  async function serializeState(s) {
    const { DHs } = s;
    const rest = {
      DHr: s.DHr ? b64encode(s.DHr) : null,
      RK: b64encode(s.RK),
      CKs: s.CKs ? b64encode(s.CKs) : null,
      CKr: s.CKr ? b64encode(s.CKr) : null,
      Ns: s.Ns,
      Nr: s.Nr,
      PN: s.PN,
      skipped: Object.fromEntries(Object.entries(s.skipped).map(([k, v]) => [k, b64encode(v)]))
    };
    return {
      DHs: DHs ? { jwk: await exportPrivateJwk(DHs.privateKey), pub: b64encode(DHs.publicKey) } : null,
      ...rest
    };
  }
  async function deserializeState(j) {
    return {
      DHs: j.DHs ? { privateKey: await importPrivateJwk(j.DHs.jwk), publicKey: b64decode(j.DHs.pub) } : null,
      DHr: j.DHr ? b64decode(j.DHr) : null,
      RK: b64decode(j.RK),
      CKs: j.CKs ? b64decode(j.CKs) : null,
      CKr: j.CKr ? b64decode(j.CKr) : null,
      Ns: j.Ns,
      Nr: j.Nr,
      PN: j.PN,
      skipped: Object.fromEntries(Object.entries(j.skipped).map(([k, v]) => [k, b64decode(v)]))
    };
  }
  async function deriveHandshakeSecret(dh1, dh2, dh3, dh4) {
    const ikm = concat(dh1, dh2, dh3, dh4);
    return hkdfSha256(ikm, new Uint8Array(32), utf8("vencord-e2ee/handshake-v2"), 32);
  }
  async function safetyNumber(idA, idB) {
    const [lo, hi] = compareBytes(idA, idB) < 0 ? [idA, idB] : [idB, idA];
    const digest = sha256(concat(lo, hi));
    let out = "";
    for (let i = 0;i < 15; i++) {
      out += (digest[i] % 10).toString();
      out += (Math.floor(digest[i] / 10) % 10).toString();
    }
    return out.match(/.{1,5}/g).join(" ");
  }
  function compareBytes(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0;i < n; i++)
      if (a[i] !== b[i])
        return a[i] - b[i];
    return a.length - b.length;
  }

  // bunny-src/serial.ts
  var tails = new Map;
  function runExclusive(key, fn) {
    const next = (tails.get(key) ?? Promise.resolve()).then(fn);
    tails.set(key, next.catch(() => {}));
    return next;
  }
  function serialWriter(write) {
    let tail = Promise.resolve();
    let waiting = null;
    return () => waiting ??= tail = tail.catch(() => {}).then(() => {
      waiting = null;
      return write();
    });
  }

  // node_modules/fflate/esm/browser.js
  var u82 = Uint8Array;
  var u16 = Uint16Array;
  var i32 = Int32Array;
  var fleb = new u82([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]);
  var fdeb = new u82([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]);
  var clim = new u82([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i = 0;i < 31; ++i) {
      b[i] = start += 1 << eb[i - 1];
    }
    var r = new i32(b[30]);
    for (var i = 1;i < 30; ++i) {
      for (var j = b[i];j < b[i + 1]; ++j) {
        r[j] = j - b[i] << 5 | i;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2);
  var fl = _a.b;
  var revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0);
  var fd = _b.b;
  var revfd = _b.r;
  var rev = new u16(32768);
  for (i = 0;i < 32768; ++i) {
    x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var x;
  var i;
  var hMap = function(cd, mb, r) {
    var s = cd.length;
    var i = 0;
    var l = new u16(mb);
    for (;i < s; ++i) {
      if (cd[i])
        ++l[cd[i] - 1];
    }
    var le = new u16(mb);
    for (i = 1;i < mb; ++i) {
      le[i] = le[i - 1] + l[i - 1] << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i = 0;i < s; ++i) {
        if (cd[i]) {
          var sv = i << 4 | cd[i];
          var r_1 = mb - cd[i];
          var v = le[cd[i] - 1]++ << r_1;
          for (var m = v | (1 << r_1) - 1;v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i = 0;i < s; ++i) {
        if (cd[i]) {
          co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
        }
      }
    }
    return co;
  };
  var flt = new u82(288);
  for (i = 0;i < 144; ++i)
    flt[i] = 8;
  var i;
  for (i = 144;i < 256; ++i)
    flt[i] = 9;
  var i;
  for (i = 256;i < 280; ++i)
    flt[i] = 7;
  var i;
  for (i = 280;i < 288; ++i)
    flt[i] = 8;
  var i;
  var fdt = new u82(32);
  for (i = 0;i < 32; ++i)
    fdt[i] = 5;
  var i;
  var flm = /* @__PURE__ */ hMap(flt, 9, 0);
  var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
  var fdm = /* @__PURE__ */ hMap(fdt, 5, 0);
  var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
  var max = function(a) {
    var m = a[0];
    for (var i = 1;i < a.length; ++i) {
      if (a[i] > m)
        m = a[i];
    }
    return m;
  };
  var bits = function(d, p, m) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
  };
  var bits16 = function(d, p) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
  };
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (s == null || s < 0)
      s = 0;
    if (e == null || e > v.length)
      e = v.length;
    return new u82(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var inflt = function(dat, st, buf, dict) {
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
      return buf || new u82(0);
    var noBuf = !buf;
    var resize = noBuf || st.i != 2;
    var noSt = st.i;
    if (noBuf)
      buf = new u82(sl * 3);
    var cbuf = function(l) {
      var bl = buf.length;
      if (l > bl) {
        var nbuf = new u82(Math.max(bl * 2, l));
        nbuf.set(buf);
        buf = nbuf;
      }
    };
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, { l: lm, d: dm, m: lbt, n: dbt } = st;
    var tbts = sl * 8;
    do {
      if (!lm) {
        final = bits(dat, pos, 1);
        var type = bits(dat, pos + 1, 3);
        pos += 3;
        if (!type) {
          var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
          if (t > sl) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + l);
          buf.set(dat.subarray(s, t), bt);
          st.b = bt += l, st.p = pos = t * 8, st.f = final;
          continue;
        } else if (type == 1)
          lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
        else if (type == 2) {
          var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
          var tl = hLit + bits(dat, pos + 5, 31) + 1;
          pos += 14;
          var ldt = new u82(tl);
          var clt = new u82(19);
          for (var i = 0;i < hcLen; ++i) {
            clt[clim[i]] = bits(dat, pos + i * 3, 7);
          }
          pos += hcLen * 3;
          var clb = max(clt), clbmsk = (1 << clb) - 1;
          var clm = hMap(clt, clb, 1);
          for (var i = 0;i < tl; ) {
            var r = clm[bits(dat, pos, clbmsk)];
            pos += r & 15;
            var s = r >> 4;
            if (s < 16) {
              ldt[i++] = s;
            } else {
              var c = 0, n = 0;
              if (s == 16)
                n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
              else if (s == 17)
                n = 3 + bits(dat, pos, 7), pos += 3;
              else if (s == 18)
                n = 11 + bits(dat, pos, 127), pos += 7;
              while (n--)
                ldt[i++] = c;
            }
          }
          var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
          lbt = max(lt);
          dbt = max(dt);
          lm = hMap(lt, lbt, 1);
          dm = hMap(dt, dbt, 1);
        } else
          err(1);
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
      }
      if (resize)
        cbuf(bt + 131072);
      var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
      var lpos = pos;
      for (;; lpos = pos) {
        var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
        pos += c & 15;
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (!c)
          err(2);
        if (sym < 256)
          buf[bt++] = sym;
        else if (sym == 256) {
          lpos = pos, lm = null;
          break;
        } else {
          var add = sym - 254;
          if (sym > 264) {
            var i = sym - 257, b = fleb[i];
            add = bits(dat, pos, (1 << b) - 1) + fl[i];
            pos += b;
          }
          var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
          if (!d)
            err(3);
          pos += d & 15;
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
          }
          if (pos > tbts) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            var shift = dl - dt, dend = Math.min(dt, end);
            if (shift + bt < 0)
              err(3);
            for (;bt < dend; ++bt)
              buf[bt] = dict[shift + bt];
          }
          for (;bt < end; ++bt)
            buf[bt] = buf[bt - dt];
        }
      }
      st.l = lm, st.p = lpos, st.b = bt, st.f = final;
      if (lm)
        final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  };
  var wbits = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
  };
  var wbits16 = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
  };
  var hTree = function(d, mb) {
    var t = [];
    for (var i = 0;i < d.length; ++i) {
      if (d[i])
        t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
      return { t: et, l: 0 };
    if (s == 1) {
      var v = new u82(t[0].s + 1);
      v[t[0].s] = 1;
      return { t: v, l: 1 };
    }
    t.sort(function(a, b) {
      return a.f - b.f;
    });
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l, r };
    while (i1 != s - 1) {
      l = t[t[i0].f < t[i2].f ? i0++ : i2++];
      r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
      t[i1++] = { s: -1, f: l.f + r.f, l, r };
    }
    var maxSym = t2[0].s;
    for (var i = 1;i < s; ++i) {
      if (t2[i].s > maxSym)
        maxSym = t2[i].s;
    }
    var tr = new u16(maxSym + 1);
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
      var i = 0, dt = 0;
      var lft = mbt - mb, cst = 1 << lft;
      t2.sort(function(a, b) {
        return tr[b.s] - tr[a.s] || a.f - b.f;
      });
      for (;i < s; ++i) {
        var i2_1 = t2[i].s;
        if (tr[i2_1] > mb) {
          dt += cst - (1 << mbt - tr[i2_1]);
          tr[i2_1] = mb;
        } else
          break;
      }
      dt >>= lft;
      while (dt > 0) {
        var i2_2 = t2[i].s;
        if (tr[i2_2] < mb)
          dt -= 1 << mb - tr[i2_2]++ - 1;
        else
          ++i;
      }
      for (;i >= 0 && dt; --i) {
        var i2_3 = t2[i].s;
        if (tr[i2_3] == mb) {
          --tr[i2_3];
          ++dt;
        }
      }
      mbt = mb;
    }
    return { t: new u82(tr), l: mbt };
  };
  var ln = function(n, l, d) {
    return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
  };
  var lc = function(c) {
    var s = c.length;
    while (s && !c[--s])
      ;
    var cl = new u16(++s);
    var cli = 0, cln = c[0], cls = 1;
    var w = function(v) {
      cl[cli++] = v;
    };
    for (var i = 1;i <= s; ++i) {
      if (c[i] == cln && i != s)
        ++cls;
      else {
        if (!cln && cls > 2) {
          for (;cls > 138; cls -= 138)
            w(32754);
          if (cls > 2) {
            w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
            cls = 0;
          }
        } else if (cls > 3) {
          w(cln), --cls;
          for (;cls > 6; cls -= 6)
            w(8304);
          if (cls > 2)
            w(cls - 3 << 5 | 8208), cls = 0;
        }
        while (cls--)
          w(cln);
        cls = 1;
        cln = c[i];
      }
    }
    return { c: cl.subarray(0, cli), n: s };
  };
  var clen = function(cf, cl) {
    var l = 0;
    for (var i = 0;i < cl.length; ++i)
      l += cf[i] * cl[i];
    return l;
  };
  var wfblk = function(out, pos, dat) {
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0;i < s; ++i)
      out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
  };
  var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a = hTree(lf, 15), { t: dlt, l: mlb } = _a;
    var _b = hTree(df, 15), { t: ddt, l: mdb } = _b;
    var _c = lc(dlt), { c: lclt, n: nlc } = _c;
    var _d = lc(ddt), { c: lcdt, n: ndc } = _d;
    var lcfreq = new u16(19);
    for (var i = 0;i < lclt.length; ++i)
      ++lcfreq[lclt[i] & 31];
    for (var i = 0;i < lcdt.length; ++i)
      ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), { t: lct, l: mlcb } = _e;
    var nlcc = 19;
    for (;nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
      ;
    var flen = bl + 5 << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
      return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
      lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
      var llm = hMap(lct, mlcb, 0);
      wbits(out, p, nlc - 257);
      wbits(out, p + 5, ndc - 1);
      wbits(out, p + 10, nlcc - 4);
      p += 14;
      for (var i = 0;i < nlcc; ++i)
        wbits(out, p + 3 * i, lct[clim[i]]);
      p += 3 * nlcc;
      var lcts = [lclt, lcdt];
      for (var it = 0;it < 2; ++it) {
        var clct = lcts[it];
        for (var i = 0;i < clct.length; ++i) {
          var len = clct[i] & 31;
          wbits(out, p, llm[len]), p += lct[len];
          if (len > 15)
            wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
        }
      }
    } else {
      lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0;i < li; ++i) {
      var sym = syms[i];
      if (sym > 255) {
        var len = sym >> 18 & 31;
        wbits16(out, p, lm[len + 257]), p += ll[len + 257];
        if (len > 7)
          wbits(out, p, sym >> 23 & 31), p += fleb[len];
        var dst = sym & 31;
        wbits16(out, p, dm[dst]), p += dl[dst];
        if (dst > 3)
          wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
      } else {
        wbits16(out, p, lm[sym]), p += ll[sym];
      }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
  };
  var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
  var et = /* @__PURE__ */ new u82(0);
  var dflt = function(dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u82(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
      if (pos)
        w[0] = st.r >> 3;
      var opt = deo[lvl - 1];
      var n = opt >> 13, c = opt & 8191;
      var msk_1 = (1 << plvl) - 1;
      var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
      var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
      var hsh = function(i) {
        return (dat[i] ^ dat[i + 1] << bs1_1 ^ dat[i + 2] << bs2_1) & msk_1;
      };
      var syms = new i32(25000);
      var lf = new u16(288), df = new u16(32);
      var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
      for (;i + 2 < s; ++i) {
        var hv = hsh(i);
        var imod = i & 32767, pimod = head[hv];
        prev[imod] = pimod;
        head[hv] = imod;
        if (wi <= i) {
          var rem = s - i;
          if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
            pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
            li = lc_1 = eb = 0, bs = i;
            for (var j = 0;j < 286; ++j)
              lf[j] = 0;
            for (var j = 0;j < 30; ++j)
              df[j] = 0;
          }
          var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
          if (rem > 2 && hv == hsh(i - dif)) {
            var maxn = Math.min(n, rem) - 1;
            var maxd = Math.min(32767, i);
            var ml = Math.min(258, rem);
            while (dif <= maxd && --ch_1 && imod != pimod) {
              if (dat[i + l] == dat[i + l - dif]) {
                var nl = 0;
                for (;nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                  ;
                if (nl > l) {
                  l = nl, d = dif;
                  if (nl > maxn)
                    break;
                  var mmd = Math.min(dif, nl - 2);
                  var md = 0;
                  for (var j = 0;j < mmd; ++j) {
                    var ti = i - dif + j & 32767;
                    var pti = prev[ti];
                    var cd = ti - pti & 32767;
                    if (cd > md)
                      md = cd, pimod = ti;
                  }
                }
              }
              imod = pimod, pimod = prev[imod];
              dif += imod - pimod & 32767;
            }
          }
          if (d) {
            syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
            var lin = revfl[l] & 31, din = revfd[d] & 31;
            eb += fleb[lin] + fdeb[din];
            ++lf[257 + lin];
            ++df[din];
            wi = i + l;
            ++lc_1;
          } else {
            syms[li++] = dat[i];
            ++lf[dat[i]];
          }
        }
      }
      for (i = Math.max(i, wi);i < s; ++i) {
        syms[li++] = dat[i];
        ++lf[dat[i]];
      }
      pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
      if (!lst) {
        st.r = pos & 7 | w[pos / 8 | 0] << 3;
        pos -= 7;
        st.h = head, st.p = prev, st.i = i, st.w = wi;
      }
    } else {
      for (var i = st.w || 0;i < s + lst; i += 65535) {
        var e = i + 65535;
        if (e >= s) {
          w[pos / 8 | 0] = lst;
          e = s;
        }
        pos = wfblk(w, pos + 1, dat.subarray(i, e));
      }
      st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
  };
  var dopt = function(dat, opt, pre, post, st) {
    if (!st) {
      st = { l: 1 };
      if (opt.dictionary) {
        var dict = opt.dictionary.subarray(-32768);
        var newDat = new u82(dict.length + dat.length);
        newDat.set(dict);
        newDat.set(dat, dict.length);
        dat = newDat;
        st.w = dict.length;
      }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
  };
  var Deflate = /* @__PURE__ */ function() {
    function Deflate(opts, cb) {
      if (typeof opts == "function")
        cb = opts, opts = {};
      this.ondata = cb;
      this.o = opts || {};
      this.s = { l: 0, i: 32768, w: 32768, z: 32768 };
      this.b = new u82(98304);
      if (this.o.dictionary) {
        var dict = this.o.dictionary.subarray(-32768);
        this.b.set(dict, 32768 - dict.length);
        this.s.i = 32768 - dict.length;
      }
    }
    Deflate.prototype.p = function(c, f) {
      this.ondata(dopt(c, this.o, 0, 0, this.s), f);
    };
    Deflate.prototype.push = function(chunk, final) {
      if (!this.ondata)
        err(5);
      if (this.s.l)
        err(4);
      var endLen = chunk.length + this.s.z;
      if (endLen > this.b.length) {
        if (endLen > 2 * this.b.length - 32768) {
          var newBuf = new u82(endLen & -32768);
          newBuf.set(this.b.subarray(0, this.s.z));
          this.b = newBuf;
        }
        var split = this.b.length - this.s.z;
        this.b.set(chunk.subarray(0, split), this.s.z);
        this.s.z = this.b.length;
        this.p(this.b, false);
        this.b.set(this.b.subarray(-32768));
        this.b.set(chunk.subarray(split), 32768);
        this.s.z = chunk.length - split + 32768;
        this.s.i = 32766, this.s.w = 32768;
      } else {
        this.b.set(chunk, this.s.z);
        this.s.z += chunk.length;
      }
      this.s.l = final & 1;
      if (this.s.z > this.s.w + 8191 || final) {
        this.p(this.b, final || false);
        this.s.w = this.s.i, this.s.i -= 2;
      }
      if (final) {
        this.s = this.o = {};
        this.b = et;
      }
    };
    Deflate.prototype.flush = function(sync) {
      if (!this.ondata)
        err(5);
      if (this.s.l)
        err(4);
      this.p(this.b, false);
      this.s.w = this.s.i, this.s.i -= 2;
      if (sync) {
        var c = new u82(6);
        c[0] = this.s.r >> 3;
        var ep = wfblk(c, this.s.r, et);
        this.s.r = 0;
        this.ondata(c.subarray(0, ep >> 3), false);
      }
    };
    return Deflate;
  }();
  var Inflate = /* @__PURE__ */ function() {
    function Inflate(opts, cb) {
      if (typeof opts == "function")
        cb = opts, opts = {};
      this.ondata = cb;
      var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
      this.s = { i: 0, b: dict ? dict.length : 0 };
      this.o = new u82(32768);
      this.p = new u82(0);
      if (dict)
        this.o.set(dict);
    }
    Inflate.prototype.e = function(c) {
      if (!this.ondata)
        err(5);
      if (this.d)
        err(4);
      if (!this.p.length)
        this.p = c;
      else if (c.length) {
        var n = new u82(this.p.length + c.length);
        n.set(this.p), n.set(c, this.p.length), this.p = n;
      }
    };
    Inflate.prototype.c = function(final) {
      this.s.i = +(this.d = final || false);
      var bts = this.s.b;
      var dt = inflt(this.p, this.s, this.o);
      this.ondata(slc(dt, bts, this.s.b), this.d);
      this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
      this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
    };
    Inflate.prototype.push = function(chunk, final) {
      this.e(chunk), this.c(final);
    };
    return Inflate;
  }();
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder;
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {}

  // bunny-src/compress.ts
  var supported = null;
  function compressionAvailable() {
    if (supported !== null)
      return supported;
    try {
      const probe = new Uint8Array([1, 2, 3, 1, 2, 3, 1, 2, 3]);
      supported = bytesEqualLocal(fflateInflate(fflateDeflate(probe)), probe);
    } catch {
      supported = false;
    }
    return supported;
  }
  function bytesEqualLocal(a, b) {
    if (a.length !== b.length)
      return false;
    for (let i = 0;i < a.length; i++)
      if (a[i] !== b[i])
        return false;
    return true;
  }
  function concatLocal(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }
  function consumeChunks() {
    let acc = null;
    let error = null;
    return {
      ondata(a) {
        if (a instanceof Uint8Array) {
          acc = acc ? concatLocal(acc, a) : a;
        } else if (a) {
          error = new Error(`fflate error ${String(a.code ?? a)}`);
        }
      },
      result() {
        if (error)
          throw error;
        if (!acc)
          throw new Error("fflate produced no output");
        return acc;
      }
    };
  }
  function fflateDeflate(input) {
    const sink = consumeChunks();
    const d = new Deflate;
    d.ondata = sink.ondata;
    d.push(input, true);
    const out = sink.result();
    const err = d.err;
    if (typeof err === "number" && err !== 0)
      throw new Error(`fflate deflate error ${err}`);
    return out;
  }
  function fflateInflate(input) {
    const sink = consumeChunks();
    const i = new Inflate;
    i.ondata = sink.ondata;
    i.push(input, true);
    const out = sink.result();
    const err = i.err;
    if (typeof err === "number" && err !== 0)
      throw new Error(`fflate inflate error ${err}`);
    return out;
  }
  async function deflateRaw(input) {
    return fflateDeflate(input);
  }
  async function inflateRaw(input) {
    return fflateInflate(input);
  }

  // bunny-src/session.ts
  var PREFIX_INIT = "\uD83D\uDD10⟨E2EE-INIT v2⟩";
  var PREFIX_ACK = "\uD83D\uDD10⟨E2EE-ACK v2⟩";
  var PREFIX_MSG = "\uD83D\uDD10⟨E2EE v2⟩";
  var PREFIX_RESET = "\uD83D\uDD10⟨E2EE-RESET v2⟩";
  var LEGACY_PREFIXES = [
    "\uD83D\uDD10⟨E2EE-INIT v1⟩",
    "\uD83D\uDD10⟨E2EE-ACK v1⟩",
    "\uD83D\uDD10⟨E2EE v1⟩",
    "\uD83D\uDD10⟨E2EE-RESET v1⟩"
  ];
  function isCurrentE2EEMessage(content) {
    return content.startsWith(PREFIX_INIT) || content.startsWith(PREFIX_ACK) || content.startsWith(PREFIX_MSG) || content.startsWith(PREFIX_RESET);
  }
  function isLegacyE2EEMessage(content) {
    return LEGACY_PREFIXES.some((p) => content.startsWith(p));
  }
  function isE2EEMessage(content) {
    return isCurrentE2EEMessage(content) || isLegacyE2EEMessage(content);
  }
  var FRAME_RAW = 0;
  var FRAME_DEFLATE = 1;
  var COMPRESS_MIN_BYTES = 64;
  async function packFrame(text) {
    const raw = utf8(text);
    if (raw.length >= COMPRESS_MIN_BYTES && compressionAvailable()) {
      try {
        const deflated = await deflateRaw(raw);
        if (deflated.length < raw.length && bytesEqual(await inflateRaw(deflated), raw)) {
          return concat(Uint8Array.of(FRAME_DEFLATE), deflated);
        }
      } catch {}
    }
    return concat(Uint8Array.of(FRAME_RAW), raw);
  }
  async function unpackFrame(frame) {
    if (frame.length < 1)
      throw new Error("empty message frame");
    const flag = frame[0];
    const payload = frame.subarray(1);
    switch (flag) {
      case FRAME_RAW:
        return utf8dStrict(payload);
      case FRAME_DEFLATE:
        if (!compressionAvailable()) {
          throw new Error("peer sent a compressed message but DecompressionStream is unavailable here");
        }
        return utf8dStrict(await inflateRaw(payload));
      default:
        throw new Error(`unknown message codec flag 0x${flag.toString(16).padStart(2, "0")}`);
    }
  }
  var DISCORD_MAX_MESSAGE_LENGTH = 2000;
  var HEADER_BYTES = 40;
  var AEAD_TAG_BYTES = 16;
  function base64Length(n) {
    return Math.ceil(n / 3) * 4;
  }
  function projectedWireLength(frameBytes) {
    return PREFIX_MSG.length + base64Length(HEADER_BYTES + frameBytes + AEAD_TAG_BYTES);
  }
  class MessageTooLongError extends Error {
    wireLength;
    maxLength;
    constructor(wireLength, maxLength) {
      super(`encrypted message is ${wireLength} characters, over Discord's ${maxLength} limit`);
      this.name = "MessageTooLongError";
      this.wireLength = wireLength;
      this.maxLength = maxLength;
    }
    get overBy() {
      return this.wireLength - this.maxLength;
    }
    get approxCharsToRemove() {
      return Math.ceil(this.overBy * 3 / 4);
    }
  }
  async function serializeIdentity(id) {
    return { jwk: await exportPrivateJwk(id.privateKey), pub: b64encode(id.publicKey) };
  }
  async function deserializeIdentity(s) {
    return { privateKey: await importPrivateJwk(s.jwk), publicKey: b64decode(s.pub) };
  }
  async function newIdentity() {
    const kp = await generateDH();
    return { privateKey: kp.privateKey, publicKey: kp.publicKey };
  }
  async function serializeSession(s) {
    const { pendingEph } = s;
    const ratchet = s.ratchet ? serializeState(s.ratchet) : null;
    const rest = {
      phase: s.phase,
      peerIdPub: s.peerIdPub ? b64encode(s.peerIdPub) : null,
      peerEphPub: s.peerEphPub ? b64encode(s.peerEphPub) : null,
      safetyNum: s.safetyNum,
      untrustedKey: s.untrustedKey
    };
    return {
      ...rest,
      pendingEph: pendingEph ? { jwk: await exportPrivateJwk(pendingEph.privateKey), pub: b64encode(pendingEph.publicKey) } : null,
      ratchet: await ratchet
    };
  }
  async function deserializeSession(j) {
    return {
      phase: j.phase,
      peerIdPub: j.peerIdPub ? b64decode(j.peerIdPub) : null,
      peerEphPub: j.peerEphPub ? b64decode(j.peerEphPub) : null,
      pendingEph: j.pendingEph ? { privateKey: await importPrivateJwk(j.pendingEph.jwk), publicKey: b64decode(j.pendingEph.pub) } : null,
      ratchet: j.ratchet ? await deserializeState(j.ratchet) : null,
      safetyNum: j.safetyNum,
      untrustedKey: j.untrustedKey ?? false
    };
  }
  function emptySession() {
    return {
      phase: "none",
      peerIdPub: null,
      peerEphPub: null,
      pendingEph: null,
      ratchet: null,
      safetyNum: null,
      untrustedKey: false
    };
  }
  function encodeHandshakeBody(idPub, ephPub) {
    return b64encode(concat(idPub, ephPub));
  }
  function decodeHandshakeBody(payload) {
    const bytes = b64decode(payload);
    if (bytes.length !== 64)
      throw new Error(`bad handshake length: ${bytes.length}`);
    return { idPub: bytes.slice(0, 32), ephPub: bytes.slice(32, 64) };
  }
  async function buildInit(id) {
    const eph = await generateDH();
    const wire = PREFIX_INIT + encodeHandshakeBody(id.publicKey, eph.publicKey);
    return { wire, eph };
  }
  function parseInit(content) {
    const payload = content.slice(PREFIX_INIT.length);
    const { idPub, ephPub } = decodeHandshakeBody(payload);
    return { peerIdPub: idPub, peerEphPub: ephPub };
  }
  async function buildAck(id, peerIdPub, peerEphPub) {
    const myEph = await generateDH();
    const dh1 = await dh(myEph.privateKey, peerIdPub);
    const dh2 = await dh(id.privateKey, peerEphPub);
    const dh3 = await dh(myEph.privateKey, peerEphPub);
    const dh4 = await dh(id.privateKey, peerIdPub);
    const SK = await deriveHandshakeSecret(dh1, dh2, dh3, dh4);
    const ratchet = ratchetInitBob(SK, myEph);
    const session = {
      phase: "ready",
      peerIdPub,
      peerEphPub: null,
      pendingEph: null,
      ratchet,
      safetyNum: await safetyNumber(id.publicKey, peerIdPub),
      untrustedKey: false
    };
    const wire = PREFIX_ACK + encodeHandshakeBody(id.publicKey, myEph.publicKey);
    return { wire, session };
  }
  async function handleAck(id, pendingEph, content) {
    const payload = content.slice(PREFIX_ACK.length);
    const { idPub: peerIdPub, ephPub: peerEphPub } = decodeHandshakeBody(payload);
    const dh1 = await dh(id.privateKey, peerEphPub);
    const dh2 = await dh(pendingEph.privateKey, peerIdPub);
    const dh3 = await dh(pendingEph.privateKey, peerEphPub);
    const dh4 = await dh(id.privateKey, peerIdPub);
    const SK = await deriveHandshakeSecret(dh1, dh2, dh3, dh4);
    const ratchet = await ratchetInitAlice(SK, peerEphPub);
    return {
      phase: "ready",
      peerIdPub,
      peerEphPub: null,
      pendingEph: null,
      ratchet,
      safetyNum: await safetyNumber(id.publicKey, peerIdPub),
      untrustedKey: false
    };
  }
  var AD = utf8("vencord-e2ee/v2");
  async function encryptForSession(s, plaintext) {
    if (s.phase !== "ready" || !s.ratchet)
      throw new Error("session not ready");
    const frame = await packFrame(plaintext);
    const projected = projectedWireLength(frame.length);
    if (projected > DISCORD_MAX_MESSAGE_LENGTH) {
      throw new MessageTooLongError(projected, DISCORD_MAX_MESSAGE_LENGTH);
    }
    const ct = await ratchetEncrypt(s.ratchet, frame, AD);
    return PREFIX_MSG + b64encode(ct);
  }
  async function decryptForSession(s, wire) {
    if (s.phase !== "ready" || !s.ratchet)
      throw new Error("session not ready");
    if (!wire.startsWith(PREFIX_MSG))
      throw new Error("not an E2EE message");
    const frame = await ratchetDecrypt(s.ratchet, b64decode(wire.slice(PREFIX_MSG.length)), AD);
    return unpackFrame(frame);
  }

  // bunny-src/ctx.ts
  var bunny = globalThis.bunny;
  if (!bunny)
    throw new Error("E2EE: Revenge runtime not found (window.bunny is missing)");
  var metro = bunny.metro;
  var patcher = bunny.api.patcher;
  var fluxDispatcher = bunny.api.flux?.dispatcher ?? bunny.metro.common.FluxDispatcher;
  var React = bunny.metro.common.React;
  var RN = bunny.metro.common.ReactNative;
  var C = bunny.metro.common.components;
  var Toaster = bunny.metro.common.toasts;
  var alerts = bunny.ui.alerts;
  var findInReactTree = bunny.utils.findInReactTree;
  var h = React.createElement;
  var pluginStorage = bunny.plugin?.createStorage ? bunny.plugin.createStorage() : bunny.api.storage.createStorage("plugins/storage/com.tobi437a.e2ee.json");
  var MessageActions = metro.findByPropsLazy("sendMessage", "editMessage");
  var UserStore = metro.findByStoreNameLazy("UserStore");
  var ChannelStore = metro.findByStoreNameLazy("ChannelStore");
  var MessageStore = metro.findByStoreNameLazy("MessageStore");
  var SelectedChannelStore = metro.findByStoreNameLazy("SelectedChannelStore");

  // bunny-src/store.ts
  var doc = pluginStorage;
  var DataStore = {
    async get(key) {
      return doc?.kv?.[key];
    },
    async set(key, value) {
      doc.kv = doc.kv ?? {};
      doc.kv[key] = value;
    },
    async del(key) {
      if (doc.kv)
        delete doc.kv[key];
    }
  };

  // bunny-src/ui.tsx
  var alertSeq = 0;
  function nextKey(kind) {
    return `com.tobi437a.e2ee.${kind}.${Date.now()}.${alertSeq++}`;
  }
  var MIN_PASSPHRASE_LENGTH = 12;
  function askPassphrase(mode, verify) {
    return new Promise((resolve) => {
      let settled = false;
      const key = nextKey("pass");
      const PassphraseAlert = (props) => {
        const [value, setValue] = React.useState("");
        const [confirm, setConfirm] = React.useState("");
        const [error, setError] = React.useState(null);
        const [busy, setBusy] = React.useState(false);
        const creating = mode === "create";
        function localError() {
          if (value.length < MIN_PASSPHRASE_LENGTH) {
            return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
          }
          if (creating && value !== confirm)
            return "The two passwords don't match.";
          return null;
        }
        async function submit() {
          if (busy)
            return;
          const local = creating ? localError() : value.length === 0 ? "Enter your password." : null;
          if (local) {
            setError(local);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const err = await verify(value);
            if (err) {
              setError(err);
              setValue("");
              setConfirm("");
              return;
            }
            props.onDone(value);
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }
        return h(C.AlertModal, {
          title: creating ? "Choose a password" : "Enter your password",
          content: creating ? "This password protects the encrypted messages saved on this device." : "Unlock the encrypted messages saved on this device.",
          extraContent: h(React.Fragment, null, creating ? h(RN.Text, { style: { color: "#f23f43", fontWeight: "600", marginBottom: 8 } }, "Write it down somewhere safe. If you forget it, every message you've sent or received with this plugin is lost for good — there is no way to reset it.") : null, h(C.TextInput, {
            label: "Password",
            secureTextEntry: true,
            autoFocus: true,
            value,
            onChange: setValue,
            isDisabled: busy,
            placeholder: creating ? `At least ${MIN_PASSPHRASE_LENGTH} characters` : "",
            status: error ? "error" : "default",
            errorMessage: error ?? undefined
          }), creating ? h(C.TextInput, {
            label: "Type it again",
            secureTextEntry: true,
            value: confirm,
            onChange: setConfirm,
            isDisabled: busy,
            status: error ? "error" : "default"
          }) : null, busy ? h(RN.Text, { style: { opacity: 0.7, marginTop: 6 } }, "Checking… this takes a few seconds on purpose, to make guessing slow.") : null),
          actions: h(React.Fragment, null, h(C.AlertActionButton, { variant: "secondary", text: "Cancel" }), h(C.AlertActionButton, {
            variant: "primary",
            text: creating ? "Set password" : "Unlock",
            disabled: busy,
            onPress: () => {
              submit();
            }
          }))
        });
      };
      alerts.openAlert(key, h(PassphraseAlert, {
        onDone: (passphrase) => {
          settled = true;
          resolve(passphrase);
        }
      }), () => {
        if (!settled)
          resolve(null);
      });
    });
  }

  // node_modules/@noble/hashes/pbkdf2.js
  function pbkdf2Init(hash, _password, _salt, _opts) {
    ahash(hash);
    const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
    const { c, dkLen, asyncTick } = opts;
    anumber(c, "c");
    anumber(dkLen, "dkLen");
    anumber(asyncTick, "asyncTick");
    if (c < 1)
      throw new Error('"c" (iterations) must be >= 1');
    if (dkLen < 1)
      throw new Error('"dkLen" must be >= 1');
    if (dkLen > (2 ** 32 - 1) * hash.outputLen)
      throw new Error("derived key too long");
    const p = kdfInputToBytes(_password, "password");
    try {
      const s = kdfInputToBytes(_salt, "salt");
      try {
        const DK = new Uint8Array(dkLen);
        const { iHash, oHash, outputLen } = hmac.create(hash, p);
        const u = new Uint8Array(outputLen);
        const eng = pbkdf2Engine(iHash, oHash, s, u);
        return { c, dkLen, asyncTick, DK, outputLen, eng };
      } finally {
        if (typeof _salt === "string")
          clean(s);
      }
    } finally {
      if (typeof _password === "string")
        clean(p);
    }
  }
  function pbkdf2Engine(iHash, oHash, salt, u) {
    const counter = new Uint8Array(4);
    const view = createView(counter);
    const salted = iHash._cloneInto().update(salt);
    const work = oHash._cloneInto();
    const iClone = iHash._cloneInto;
    const oClone = oHash._cloneInto;
    return {
      u1: (ti, Ti) => {
        view.setInt32(0, ti, false);
        salted._cloneInto(work).update(counter).digestInto(u);
        oHash._cloneInto(work).update(u).digestInto(u);
        Ti.set(u.subarray(0, Ti.length));
      },
      rounds: (c, Ti) => {
        for (let ui = 1;ui < c; ui++) {
          iClone.call(iHash, work).update(u).digestInto(u);
          oClone.call(oHash, work).update(u).digestInto(u);
          for (let i = 0;i < Ti.length; i++)
            Ti[i] ^= u[i];
        }
      },
      output: (DK) => {
        iHash.destroy();
        oHash.destroy();
        salted.destroy();
        work.destroy();
        clean(u);
        return DK;
      }
    };
  }
  function pbkdf2(hash, password, salt, opts) {
    const { c, dkLen, DK, outputLen, eng } = pbkdf2Init(hash, password, salt, opts);
    for (let ti = 1, pos = 0;pos < dkLen; ti++, pos += outputLen) {
      const Ti = DK.subarray(pos, pos + outputLen);
      eng.u1(ti, Ti);
      eng.rounds(c, Ti);
    }
    return eng.output(DK);
  }

  // bunny-src/vault.ts
  var KDF_PBKDF2_SHA256 = "PBKDF2-SHA256";
  var DEFAULT_PBKDF2_ITERATIONS = 600000;
  var MIN_PBKDF2_ITERATIONS = 1e5;
  var SALT_BYTES = 16;
  var IV_BYTES = 12;
  var CHECK_PLAINTEXT = "vencord-e2ee/vault-check/v2";

  class WrongPassphraseError extends Error {
    constructor() {
      super("wrong passphrase");
      this.name = "WrongPassphraseError";
    }
  }
  function isVaultBlob(value) {
    return typeof value === "object" && value !== null && value.__e2eeVault === true && typeof value.iv === "string" && typeof value.ct === "string";
  }
  function isVaultMeta(value) {
    if (typeof value !== "object" || value === null)
      return false;
    const m = value;
    return isVaultBlob(m.check) && typeof m.kdf === "object" && m.kdf !== null && typeof m.kdf.salt === "string" && typeof m.kdf.iterations === "number";
  }
  function newKdfParams(iterations = DEFAULT_PBKDF2_ITERATIONS) {
    const salt = randomBytes3(SALT_BYTES);
    return { algorithm: KDF_PBKDF2_SHA256, iterations, salt: b64encode(salt) };
  }
  async function deriveVaultKey(passphrase, params) {
    if (params.algorithm !== KDF_PBKDF2_SHA256) {
      throw new Error(`unsupported vault KDF: ${params.algorithm}`);
    }
    if (!Number.isInteger(params.iterations) || params.iterations < MIN_PBKDF2_ITERATIONS) {
      throw new Error(`refusing to derive with ${params.iterations} PBKDF2 iterations`);
    }
    return pbkdf2(sha256, utf8(passphrase), b64decode(params.salt), {
      c: params.iterations,
      dkLen: 32
    });
  }
  async function vaultEncrypt(key, value) {
    const iv = randomBytes3(IV_BYTES);
    const ct = gcm(key, iv).encrypt(utf8(JSON.stringify(value)));
    return { __e2eeVault: true, v: 2, iv: b64encode(iv), ct: b64encode(ct) };
  }
  async function vaultDecrypt(key, blob) {
    let json;
    try {
      const pt = gcm(key, b64decode(blob.iv)).decrypt(b64decode(blob.ct));
      json = utf8dStrict(pt);
    } catch {
      throw new WrongPassphraseError;
    }
    return JSON.parse(json);
  }
  async function makeVaultMeta(passphrase, iterations) {
    const kdf = newKdfParams(iterations);
    const key = await deriveVaultKey(passphrase, kdf);
    return { meta: { kdf, check: await vaultEncrypt(key, CHECK_PLAINTEXT) }, key };
  }
  async function unlockVault(passphrase, meta) {
    const key = await deriveVaultKey(passphrase, meta.kdf);
    const check = await vaultDecrypt(key, meta.check);
    if (check !== CHECK_PLAINTEXT)
      throw new WrongPassphraseError;
    return key;
  }

  // bunny-src/index.ts
  var log = {
    info: (...args) => console.log("[E2EE]", ...args),
    warn: (...args) => console.warn("[E2EE]", ...args),
    error: (...args) => console.error("[E2EE]", ...args)
  };
  function toast(text, _variant = "default") {
    try {
      globalThis.bunny.ui.toasts.showToast(text);
    } catch (e) {
      log.warn("toast failed", e);
    }
  }
  function showSafetyNumberOnReady() {
    return doc?.showSafetyNumberOnReady ?? true;
  }
  var STORE_IDENTITY = "E2EE_identity_v2";
  var STORE_SESSIONS = "E2EE_sessions_v2";
  var STORE_DECRYPTED = "E2EE_decrypted_v2";
  var STORE_ENABLED = "E2EE_enabled_v2";
  var STORE_PROCESSED = "E2EE_processed_v2";
  var STORE_KNOWN_KEYS = "E2EE_knownKeys_v2";
  var STORE_VAULT = "E2EE_vault_v2";
  var LEGACY_STORE_IDENTITY = "E2EE_identity_v1";
  var LEGACY_STORE_SESSIONS = "E2EE_sessions_v1";
  var LEGACY_STORE_DECRYPTED = "E2EE_decrypted_v1";
  var LEGACY_STORE_ENABLED = "E2EE_enabled_v1";
  var LEGACY_STORE_PROCESSED = "E2EE_processed_v1";
  var LEGACY_STORE_KNOWN_KEYS = "E2EE_knownKeys_v1";
  var identity = null;
  var sessions = new Map;
  var decryptedCache = new Map;
  var enabledChannels = new Set;
  var knownPeerKeys = new Map;
  var processedHandshakeMsgs = new Set;
  var pendingOwnPlaintext = new Map;
  var MAX_PENDING_OWN = 200;
  function trimOldest(collection, max) {
    for (const key of collection.keys()) {
      if (collection.size <= max)
        break;
      collection.delete(key);
    }
  }
  function rememberOwnPlaintext(wire, plaintext) {
    pendingOwnPlaintext.delete(wire);
    pendingOwnPlaintext.set(wire, plaintext);
    trimOldest(pendingOwnPlaintext, MAX_PENDING_OWN);
  }
  function recallOwnPlaintext(wire) {
    const pt = pendingOwnPlaintext.get(wire);
    if (pt === undefined)
      return;
    pendingOwnPlaintext.delete(wire);
    pendingOwnPlaintext.set(wire, pt);
    return pt;
  }
  var inFlightWire = new Map;
  var MAX_IN_FLIGHT = 50;
  var failedSends = new Set;
  var unencryptedInSecureChat = new Set;
  var MAX_UNENCRYPTED_FLAGS = 500;
  var lockedMessages = new Map;
  var MAX_LOCKED_MESSAGES = 500;
  var MAX_DECRYPTED_CACHE = 5000;
  var decryptedDirty = false;
  var unsavedIncoming = false;
  function cacheDecrypted(messageId, plaintext) {
    decryptedCache.set(messageId, plaintext);
    trimOldest(decryptedCache, MAX_DECRYPTED_CACHE);
    decryptedDirty = true;
    unsavedIncoming = true;
  }
  var stateSubscribers = new Set;
  function notifyStateChange() {
    for (const fn of stateSubscribers) {
      try {
        fn();
      } catch (e) {
        log.warn("state subscriber threw", e);
      }
    }
  }
  var vaultKey = null;
  var vaultLocked = false;
  var vaultActive = false;
  var secretsLoaded = false;
  async function readSecret(key) {
    const raw = await DataStore.get(key);
    if (raw === undefined)
      return;
    if (isVaultBlob(raw)) {
      if (!vaultKey)
        throw new Error(`${key} is encrypted but the vault is locked`);
      return await vaultDecrypt(vaultKey, raw);
    }
    return raw;
  }
  async function writeSecret(key, value) {
    if (vaultLocked || !secretsLoaded)
      return;
    await DataStore.set(key, vaultKey ? await vaultEncrypt(vaultKey, value) : value);
  }
  async function migrateLegacyStores() {
    if (await DataStore.get(STORE_IDENTITY) !== undefined)
      return;
    const legacyIdentity = await DataStore.get(LEGACY_STORE_IDENTITY);
    if (!legacyIdentity)
      return;
    log.info("Migrating v1 data to protocol v2");
    await DataStore.set(STORE_IDENTITY, legacyIdentity);
    const legacyKnown = await DataStore.get(LEGACY_STORE_KNOWN_KEYS);
    if (legacyKnown)
      await DataStore.set(STORE_KNOWN_KEYS, legacyKnown);
    const legacyDecrypted = await DataStore.get(LEGACY_STORE_DECRYPTED);
    if (legacyDecrypted)
      await DataStore.set(STORE_DECRYPTED, legacyDecrypted);
    const legacyEnabled = await DataStore.get(LEGACY_STORE_ENABLED);
    if (legacyEnabled)
      await DataStore.set(STORE_ENABLED, legacyEnabled);
    for (const key of [
      LEGACY_STORE_IDENTITY,
      LEGACY_STORE_SESSIONS,
      LEGACY_STORE_DECRYPTED,
      LEGACY_STORE_ENABLED,
      LEGACY_STORE_PROCESSED,
      LEGACY_STORE_KNOWN_KEYS
    ]) {
      await DataStore.del(key);
    }
    log.info("Migration complete — existing DMs will re-handshake under v2");
  }
  async function promptUnlock(meta) {
    let derived = null;
    const answered = await askPassphrase("unlock", async (passphrase) => {
      try {
        derived = await unlockVault(passphrase, meta);
        return null;
      } catch (e) {
        derived = null;
        if (e instanceof WrongPassphraseError)
          return "That password isn't right. Try again.";
        log.error("Vault unlock failed", e);
        return `Could not unlock: ${e}`;
      }
    });
    return answered === null ? null : derived;
  }
  async function loadAll() {
    await migrateLegacyStores();
    const enRaw = await DataStore.get(STORE_ENABLED) ?? {};
    for (const [chId, on] of Object.entries(enRaw))
      if (on)
        enabledChannels.add(chId);
    const procRaw = await DataStore.get(STORE_PROCESSED) ?? [];
    for (const id of procRaw)
      processedHandshakeMsgs.add(id);
    const keysRaw = await DataStore.get(STORE_KNOWN_KEYS) ?? {};
    for (const [uId, k] of Object.entries(keysRaw))
      knownPeerKeys.set(uId, k);
    const meta = await DataStore.get(STORE_VAULT);
    if (isVaultMeta(meta)) {
      vaultActive = true;
      vaultLocked = true;
      notifyStateChange();
      unlockAndLoad(meta).catch((e) => log.error("Unlock failed", e));
      return;
    }
    await loadSecrets();
    await ensureIdentity();
  }
  async function unlockAndLoad(meta) {
    const key = await promptUnlock(meta);
    if (!key) {
      log.warn("E2EE data left locked — no identity or sessions loaded");
      return false;
    }
    vaultKey = key;
    try {
      await loadSecrets();
    } catch (e) {
      vaultKey = null;
      log.error("Could not read the saved E2EE data", e);
      toast("\uD83D\uDD10 Your password was right, but the saved data could not be read. See the console for details.", "critical");
      return false;
    }
    vaultLocked = false;
    await ensureIdentity();
    replayLockedMessages();
    notifyStateChange();
    return true;
  }
  async function loadSecrets() {
    const idRaw = await readSecret(STORE_IDENTITY);
    const sessRaw = await readSecret(STORE_SESSIONS) ?? {};
    const decRaw = await readSecret(STORE_DECRYPTED) ?? {};
    if (idRaw)
      identity = await deserializeIdentity(idRaw);
    for (const [chId, s] of Object.entries(sessRaw)) {
      try {
        sessions.set(chId, await deserializeSession(s));
      } catch (e) {
        log.warn("Bad stored session for", chId, e);
      }
    }
    for (const [mId, pt] of Object.entries(decRaw))
      decryptedCache.set(mId, pt);
    secretsLoaded = true;
  }
  async function ensureIdentity() {
    if (identity)
      return;
    identity = await newIdentity();
    await persistIdentity();
    log.info("Generated new identity keypair");
  }
  async function persistIdentity() {
    if (!identity)
      return;
    await writeSecret(STORE_IDENTITY, await serializeIdentity(identity));
  }
  var persistState = serialWriter(async () => {
    const plaintext = decryptedDirty ? Object.fromEntries(decryptedCache) : null;
    decryptedDirty = false;
    const pending = Array.from(sessions, async ([id, s]) => [id, await serializeSession(s)]);
    try {
      if (plaintext)
        await writeSecret(STORE_DECRYPTED, plaintext);
    } catch (e) {
      decryptedDirty = true;
      throw e;
    }
    await writeSecret(STORE_SESSIONS, Object.fromEntries(await Promise.all(pending)));
  });
  async function unlockNow() {
    const meta = await DataStore.get(STORE_VAULT);
    if (!isVaultMeta(meta)) {
      vaultLocked = false;
      notifyStateChange();
      return true;
    }
    if (!await unlockAndLoad(meta))
      return false;
    toast("\uD83D\uDD10 Unlocked — your encrypted messages are readable again.", "success");
    return true;
  }
  async function enableVault() {
    if (await DataStore.get(STORE_VAULT) !== undefined)
      return;
    if (vaultLocked) {
      toast("\uD83D\uDD10 Unlock your saved messages first.", "critical");
      return;
    }
    if (!secretsLoaded) {
      toast("\uD83D\uDD10 Turn the E2EE plugin on first, then set a password.", "critical");
      return;
    }
    const passphrase = await askPassphrase("create", async () => null);
    if (passphrase === null) {
      toast("\uD83D\uDD10 Password setup cancelled — nothing was changed.");
      return;
    }
    const { meta, key } = await makeVaultMeta(passphrase);
    vaultKey = key;
    await DataStore.set(STORE_VAULT, meta);
    await persistIdentity();
    decryptedDirty = true;
    await persistState();
    vaultActive = true;
    toast("\uD83D\uDD10 Your saved messages are now password-protected. You'll be asked for the password when Discord starts.", "success");
  }
  async function disableVault() {
    if (await DataStore.get(STORE_VAULT) === undefined)
      return;
    if (vaultLocked || !vaultKey) {
      if (!await unlockNow()) {
        toast("\uD83D\uDD10 Enter your password first to turn this off.", "critical");
        return;
      }
    }
    vaultKey = null;
    await persistIdentity();
    decryptedDirty = true;
    await persistState();
    await DataStore.del(STORE_VAULT);
    vaultActive = false;
    toast("\uD83D\uDD10 Password protection turned off. Your saved messages are no longer protected on this device.");
  }
  async function persistProcessed() {
    await DataStore.set(STORE_PROCESSED, Array.from(processedHandshakeMsgs));
  }
  async function markProcessed(messageId) {
    if (!messageId)
      return;
    if (processedHandshakeMsgs.has(messageId))
      return;
    processedHandshakeMsgs.add(messageId);
    await persistProcessed();
  }
  function checkPeerKey(userId, idPub) {
    const known = knownPeerKeys.get(userId);
    if (!known)
      return "new";
    return known === b64encode(idPub) ? "match" : "changed";
  }
  async function pinPeerKey(userId, idPub) {
    const b64 = b64encode(idPub);
    if (knownPeerKeys.get(userId) === b64)
      return;
    knownPeerKeys.set(userId, b64);
    await DataStore.set(STORE_KNOWN_KEYS, Object.fromEntries(knownPeerKeys));
  }
  function getPeerUserId(channelId) {
    const ch = ChannelStore?.getChannel?.(channelId);
    return ch?.recipients?.[0] ?? null;
  }
  async function startHandshake(channelId) {
    if (!identity)
      return;
    const { wire, eph } = await buildInit(identity);
    sessions.set(channelId, { ...emptySession(), phase: "init-sent", pendingEph: eph });
    await persistState();
    notifyStateChange();
    sendRaw(channelId, wire);
  }
  function hasChangedKey(channelId, s) {
    const peerId = getPeerUserId(channelId);
    return !!peerId && !!s.peerIdPub && checkPeerKey(peerId, s.peerIdPub) === "changed";
  }
  async function sendPrime(channelId, s) {
    const text = "\uD83D\uDD10 Secure channel established.";
    const wire = await encryptForSession(s, text);
    rememberOwnPlaintext(wire, text);
    await persistState();
    sendRaw(channelId, wire);
  }
  async function acceptInvite(channelId, s) {
    if (!identity)
      return null;
    if (!s.peerIdPub || !s.peerEphPub) {
      log.error("init-recvd phase missing peer keys", channelId);
      sessions.delete(channelId);
      await persistState();
      notifyStateChange();
      toast("\uD83D\uDD10 Handshake failed — invitation was corrupt.", "critical");
      return null;
    }
    try {
      const { wire, session: newSession } = await buildAck(identity, s.peerIdPub, s.peerEphPub);
      sessions.set(channelId, newSession);
      await persistState();
      const peerId = getPeerUserId(channelId);
      if (peerId)
        await pinPeerKey(peerId, s.peerIdPub);
      notifyStateChange();
      sendRaw(channelId, wire);
      return newSession;
    } catch (e) {
      log.error("Failed to build ACK", e);
      toast("\uD83D\uDD10 Handshake failed.", "critical");
      return null;
    }
  }
  async function onSend(channelId, data) {
    if (!enabledChannels.has(channelId))
      return;
    const ch = ChannelStore?.getChannel?.(channelId);
    if (!ch || !isDM(ch))
      return;
    const hasAttachments = Array.isArray(data?.attachments) && data.attachments.length > 0;
    try {
      const result = await sendEncrypted(channelId, data);
      if (!result?.cancel && hasAttachments) {
        toast("⚠️ Your text was encrypted, but the attached file was NOT. Discord can see it.", "critical");
      }
      return result;
    } catch (e) {
      log.error("Send hook failed", e);
      toast("\uD83D\uDD10 Something went wrong, so your message was not sent. It is still in the box.", "critical");
      return { cancel: true };
    }
  }
  async function sendEncrypted(channelId, msg) {
    if (!enabledChannels.has(channelId)) {
      toast("\uD83D\uDD10 Encryption was just turned off here. Send again to send without it.");
      return { cancel: true };
    }
    if (vaultLocked) {
      toast("\uD83D\uDD10 Locked. Tap the \uD83D\uDD11 button and enter your password before sending here.", "critical");
      return { cancel: true };
    }
    if (!identity) {
      toast("\uD83D\uDD10 E2EE isn't ready yet — try again in a moment.", "critical");
      return { cancel: true };
    }
    const s = sessions.get(channelId) ?? emptySession();
    if (s.phase === "peer-reset") {
      toast("\uD83D\uDD10 Your friend ended the encrypted chat, so nothing was sent. Tap the ⚠️ button to choose what happens next.", "critical");
      return { cancel: true };
    }
    if (s.phase === "none") {
      await startHandshake(channelId);
      toast("\uD83D\uDD10 Invitation sent. Your message is still in the box — send again once the button shows \uD83D\uDD12.");
      return { cancel: true };
    }
    if (s.phase === "init-sent") {
      toast("\uD83D\uDD10 Still waiting for your friend to accept. Send again once the button shows \uD83D\uDD12.");
      return { cancel: true };
    }
    if (s.phase === "init-recvd") {
      if (hasChangedKey(channelId, s)) {
        toast("⚠️ Nothing was sent: your friend's identity key has changed. Tap the ⚠️ button to review it.", "critical");
        return { cancel: true };
      }
      const sess = await acceptInvite(channelId, s);
      if (sess) {
        const safety = showSafetyNumberOnReady() ? ` Safety #: ${sess.safetyNum}.` : "";
        toast(`\uD83D\uDD10 Invitation accepted.${safety} Your message is still in the box — send again in a moment.`, "success");
      }
      return { cancel: true };
    }
    if (s.untrustedKey) {
      toast("⚠️ Nothing was sent: your friend's identity key has changed. Tap the ⚠️ button to review it.", "critical");
      return { cancel: true };
    }
    try {
      const plaintext = msg.content;
      const wire = await encryptForSession(s, plaintext);
      await persistState();
      msg.content = wire;
      rememberOwnPlaintext(wire, plaintext);
    } catch (e) {
      if (e instanceof MessageTooLongError) {
        toast(`\uD83D\uDD10 Too long to send encrypted: ${e.wireLength}/${e.maxLength} characters once encrypted. Remove about ${e.approxCharsToRemove} characters, or split it into two messages.`, "critical");
        return { cancel: true };
      }
      log.error("Encrypt failed", e);
      toast(String(e).includes("no sending chain") ? "\uD83D\uDD10 Waiting for the peer's first encrypted message — try again in a moment." : "\uD83D\uDD10 Encryption failed; aborting send.", "critical");
      return { cancel: true };
    }
  }
  function onEdit(channelId, args) {
    const ch = ChannelStore?.getChannel?.(channelId);
    if (!ch || !isDM(ch))
      return;
    const messageId = String(args[1] ?? "");
    const original = messageId ? MessageStore?.getMessage?.(channelId, messageId) : undefined;
    const wasE2EE = messageId && decryptedCache.has(messageId) || isE2EEMessage(original?.content ?? "");
    if (!wasE2EE)
      return;
    toast("\uD83D\uDD10 Editing encrypted messages is disabled — the ratchet can't re-key an old message.", "critical");
    return false;
  }
  async function handleIncoming(channelId, message, optimistic = false) {
    if (!message?.content)
      return;
    const content = message.content;
    if (!isE2EEMessage(content))
      return;
    const ch = ChannelStore?.getChannel?.(channelId);
    if (!ch || !isDM(ch))
      return;
    if (optimistic && failedSends.has(message.id))
      return;
    if (isLegacyE2EEMessage(content)) {
      replaceContent(channelId, message, "\uD83D\uDD10 [E2EE v1 message — this build speaks v2 only. If the peer is on v1, both of you need to update and re-handshake.]");
      return;
    }
    if (vaultLocked) {
      if (!optimistic && message.id) {
        lockedMessages.set(message.id, { channelId, message: { ...message } });
        trimOldest(lockedMessages, MAX_LOCKED_MESSAGES);
      }
      replaceContent(channelId, message, "\uD83D\uDD10 [Locked — enter your password to read this message]");
      return;
    }
    if (!identity)
      return;
    const me = UserStore?.getCurrentUser?.();
    if (!me?.id || !message.author?.id)
      return;
    const fromSelf = message.author.id === me.id;
    if (optimistic && fromSelf && message.id) {
      inFlightWire.delete(message.id);
      inFlightWire.set(message.id, content);
      trimOldest(inFlightWire, MAX_IN_FLIGHT);
    }
    const markProcessedIfReal = (id) => optimistic ? Promise.resolve() : markProcessed(id);
    const isHandshake = content.startsWith(PREFIX_INIT) || content.startsWith(PREFIX_ACK) || content.startsWith(PREFIX_RESET);
    const alreadyProcessed = isHandshake && processedHandshakeMsgs.has(message.id);
    try {
      if (content.startsWith(PREFIX_INIT)) {
        if (fromSelf) {
          replaceContent(channelId, message, "\uD83D\uDD10 [E2EE handshake invitation sent]");
          await markProcessedIfReal(message.id);
          return;
        }
        if (alreadyProcessed) {
          const current = sessions.get(channelId);
          let stillPending = false;
          let keyChanged = false;
          if (current?.phase === "init-recvd" && current.peerEphPub) {
            try {
              const parsed = parseInit(content);
              stillPending = b64encode(parsed.peerEphPub) === b64encode(current.peerEphPub);
              keyChanged = stillPending && checkPeerKey(message.author.id, parsed.peerIdPub) === "changed";
            } catch {}
          }
          replaceContent(channelId, message, stillPending ? inviteLabel(keyChanged, current?.safetyNum ?? null) : "\uD83D\uDD10 [E2EE handshake invitation — historic]");
          return;
        }
        const { peerIdPub, peerEphPub } = parseInit(content);
        const current = sessions.get(channelId);
        if (current && current.phase !== "none" && current.phase !== "peer-reset") {
          const reason = current.phase === "ready" ? "secure channel already active" : current.phase === "init-sent" ? "outgoing handshake in flight" : "another invitation already pending";
          replaceContent(channelId, message, `\uD83D\uDD10 [E2EE handshake invitation ignored — ${reason}]`);
          toast(`\uD83D\uDD10 Peer sent a handshake invitation, but ${reason}. Toggle the lock off and on to reset if you want to accept it.`);
          await markProcessedIfReal(message.id);
          return;
        }
        const keyChanged = checkPeerKey(message.author.id, peerIdPub) === "changed";
        const pending = {
          ...emptySession(),
          phase: "init-recvd",
          peerIdPub,
          peerEphPub,
          safetyNum: await safetyNumber(identity.publicKey, peerIdPub)
        };
        sessions.set(channelId, pending);
        await persistState();
        notifyStateChange();
        replaceContent(channelId, message, inviteLabel(keyChanged, pending.safetyNum));
        if (keyChanged) {
          toast("⚠️ E2EE: your friend wants to start a secure channel, but their identity key has CHANGED since you last talked. This could be a new install — or an attacker. Tap the ⚠️ button to see the safety number and compare it with them first.", "critical");
        } else {
          toast("\uD83D\uDD10 Peer wants to start a secure channel. Tap the lock to accept (or ignore to decline).");
        }
        await markProcessedIfReal(message.id);
        return;
      }
      if (content.startsWith(PREFIX_ACK)) {
        if (fromSelf) {
          replaceContent(channelId, message, "\uD83D\uDD10 [E2EE handshake response sent]");
          await markProcessedIfReal(message.id);
          return;
        }
        if (alreadyProcessed) {
          replaceContent(channelId, message, "\uD83D\uDD10 [E2EE handshake response — historic]");
          return;
        }
        const s = sessions.get(channelId);
        if (!s || s.phase !== "init-sent" || !s.pendingEph) {
          log.warn("Got ACK with no pending init for channel", channelId);
          replaceContent(channelId, message, "\uD83D\uDD10 [unexpected E2EE ACK]");
          await markProcessedIfReal(message.id);
          return;
        }
        const newSession = await handleAck(identity, s.pendingEph, content);
        newSession.untrustedKey = !!newSession.peerIdPub && checkPeerKey(message.author.id, newSession.peerIdPub) === "changed";
        sessions.set(channelId, newSession);
        await persistState();
        notifyStateChange();
        if (newSession.untrustedKey) {
          replaceContent(channelId, message, "⚠️ [E2EE invitation answered with a DIFFERENT identity key than last time. " + `Nothing will be sent until you tap the ⚠️ button and confirm. Safety number: ${newSession.safetyNum}]`);
          toast("⚠️ E2EE: your friend's identity key has CHANGED since you last talked. Nothing will be sent until you tap the ⚠️ button and confirm it.", "critical");
          await markProcessedIfReal(message.id);
          return;
        }
        if (newSession.peerIdPub)
          await pinPeerKey(message.author.id, newSession.peerIdPub);
        await sendPrime(channelId, newSession).catch((e) => log.error("Failed to send priming message", e));
        replaceContent(channelId, message, "\uD83D\uDD10 E2EE secure channel established.");
        if (showSafetyNumberOnReady()) {
          toast(`\uD83D\uDD10 Secure channel established. Safety #: ${newSession.safetyNum}`, "success");
        }
        await markProcessedIfReal(message.id);
        return;
      }
      if (content.startsWith(PREFIX_RESET)) {
        if (fromSelf) {
          replaceContent(channelId, message, "\uD83D\uDD10 [E2EE reset sent]");
          await markProcessedIfReal(message.id);
          return;
        }
        if (alreadyProcessed) {
          replaceContent(channelId, message, "\uD83D\uDD10 [E2EE reset — historic]");
          return;
        }
        if (enabledChannels.has(channelId)) {
          sessions.set(channelId, { ...emptySession(), phase: "peer-reset" });
          replaceContent(channelId, message, "⚠️ Your friend ended the encrypted chat. Nothing can be sent here until you tap the ⚠️ button and choose what to do.");
          toast("⚠️ E2EE: your friend ended the encrypted chat. Tap the ⚠️ button to choose what happens next.", "critical");
        } else {
          sessions.delete(channelId);
          replaceContent(channelId, message, "\uD83D\uDD10 [E2EE invitation withdrawn]");
        }
        await persistState();
        notifyStateChange();
        await markProcessedIfReal(message.id);
        return;
      }
      if (content.startsWith(PREFIX_MSG)) {
        if (decryptedCache.has(message.id)) {
          replaceContent(channelId, message, decryptedCache.get(message.id));
          return;
        }
        if (fromSelf) {
          const pt = recallOwnPlaintext(content);
          if (pt !== undefined) {
            if (!optimistic)
              cacheDecrypted(message.id, pt);
            replaceContent(channelId, message, pt);
          } else {
            replaceContent(channelId, message, "\uD83D\uDD10 [encrypted — sent]");
          }
          return;
        }
        const s = sessions.get(channelId);
        if (!s || s.phase !== "ready") {
          replaceContent(channelId, message, "\uD83D\uDD10 [no session — cannot decrypt]");
          return;
        }
        const plaintext = await decryptForSession(s, content);
        cacheDecrypted(message.id, plaintext);
        replaceContent(channelId, message, plaintext);
      }
    } catch (e) {
      log.error("Failed to handle incoming E2EE message", e);
      if (isHandshake)
        await markProcessedIfReal(message.id).catch(() => {});
      replaceContent(channelId, message, isHandshake ? "\uD83D\uDD10 [invalid E2EE handshake message]" : "\uD83D\uDD10 [decryption failed]");
    }
  }
  function replaceContent(channelId, message, newContent) {
    if (!message)
      return;
    message.content = newContent;
    if ("contentParsed" in message)
      delete message.contentParsed;
    if (Array.isArray(message.embeds) && message.embeds.length)
      message.embeds = [];
    if (!message.id)
      return;
    const record = MessageStore?.getMessage?.(channelId, message.id);
    if (record && record.content !== newContent) {
      try {
        record.content = newContent;
      } catch (e) {}
    }
    try {
      fluxDispatcher?.dispatch?.({ type: "MESSAGE_UPDATE", message: { id: message.id, channel_id: channelId } });
    } catch (e) {
      log.warn("rerender dispatch failed", e);
    }
  }
  function sendRaw(channelId, content) {
    try {
      Promise.resolve(MessageActions.sendMessage(channelId, { content }, undefined, { location: "com.tobi437a.e2ee" })).then((res) => {
        if (res?.ok === false) {
          log.error("sendRaw: send failed", res);
          toast("\uD83D\uDD10 Failed to send E2EE message — check your connection.", "critical");
        }
      }).catch((e) => {
        log.error("sendRaw: send rejected", e);
        toast("\uD83D\uDD10 Failed to send E2EE message — see console for details.", "critical");
      });
    } catch (e) {
      log.error("sendRaw: threw", e);
      toast("\uD83D\uDD10 Failed to send E2EE message — see console for details.", "critical");
    }
  }
  function isDM(ch) {
    return ch?.type === 1;
  }
  function inviteLabel(keyChanged, safetyNum) {
    return keyChanged ? "⚠️ [E2EE invitation — your friend's identity key has CHANGED since you last talked. " + `Compare this safety number with them before accepting: ${safetyNum ?? "tap the ⚠️ button"}]` : "\uD83D\uDD10 [E2EE handshake invitation — tap the lock to accept]";
  }
  function bySnowflake(a, b) {
    return a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  function enqueueIncoming(channelId, messages, optimistic = false) {
    const ours = messages.filter((m) => typeof m?.content === "string" && isE2EEMessage(m.content));
    if (ours.length === 0)
      return;
    runExclusive(channelId, async () => {
      for (const message of ours) {
        await handleIncoming(channelId, message, optimistic).catch((err) => log.error("Failed to handle incoming message", err));
      }
      if (unsavedIncoming) {
        unsavedIncoming = false;
        await persistState().catch((err) => {
          unsavedIncoming = true;
          throw err;
        });
      }
    }).catch((err) => log.error("Failed to save E2EE state", err));
  }
  function replayLockedMessages() {
    const byChannel = new Map;
    for (const { channelId, message } of lockedMessages.values()) {
      if (!byChannel.has(channelId))
        byChannel.set(channelId, []);
      byChannel.get(channelId).push(message);
    }
    lockedMessages.clear();
    for (const [channelId, messages] of byChannel) {
      enqueueIncoming(channelId, messages.sort(bySnowflake));
    }
  }
  function fluxInterceptor(payload) {
    switch (payload?.type) {
      case "MESSAGE_CREATE": {
        const isChat = payload.message?.type === 0 || payload.message?.type === 19;
        if (isChat && payload.channelId && enabledChannels.has(payload.channelId) && !isE2EEMessage(payload.message?.content ?? "")) {
          if (!unencryptedInSecureChat.has(payload.message.id)) {
            unencryptedInSecureChat.add(payload.message.id);
            trimOldest(unencryptedInSecureChat, MAX_UNENCRYPTED_FLAGS);
            toast("⚠️ A message in an encrypted DM arrived WITHOUT encryption.", "critical");
          }
        }
        if (payload.message?.id) {
          const cached = decryptedCache.get(payload.message.id) ?? recallOwnPlaintext(payload.message?.content ?? "");
          if (typeof cached === "string" && isE2EEMessage(payload.message.content)) {
            payload.message.content = cached;
          }
        }
        if (payload.channelId && payload.message) {
          enqueueIncoming(payload.channelId, [payload.message], payload.optimistic === true);
        }
        break;
      }
      case "MESSAGE_SUCCESS": {
        if (payload.messageId)
          inFlightWire.delete(payload.messageId);
        if (payload.message?.id)
          inFlightWire.delete(payload.message.id);
        if (payload.message)
          enqueueIncoming(payload.channelId ?? payload.message.channel_id, [payload.message]);
        break;
      }
      case "MESSAGE_SEND_FAILED": {
        if (!payload.messageId)
          break;
        failedSends.add(payload.messageId);
        trimOldest(failedSends, MAX_IN_FLIGHT);
        const wire = inFlightWire.get(payload.messageId);
        if (wire) {
          inFlightWire.delete(payload.messageId);
          const record = MessageStore?.getMessage?.(payload.channelId, payload.messageId);
          if (record) {
            try {
              record.content = wire;
            } catch {}
          }
          try {
            fluxDispatcher?.dispatch?.({ type: "MESSAGE_UPDATE", message: { id: payload.messageId, channel_id: payload.channelId } });
          } catch {}
        }
        break;
      }
      case "LOAD_MESSAGES_SUCCESS": {
        const messages = (payload?.messages ?? []).filter((m) => m?.id);
        for (const m of messages) {
          const cached = decryptedCache.get(m.id);
          if (typeof cached === "string" && isE2EEMessage(m.content ?? ""))
            m.content = cached;
        }
        if (payload?.channelId)
          enqueueIncoming(payload.channelId, messages.sort(bySnowflake));
        break;
      }
      case "MESSAGE_UPDATE": {
        if (payload.message?.channel_id)
          enqueueIncoming(payload.message.channel_id, [payload.message]);
        break;
      }
    }
    return;
  }
  var lockButtonElement = h(LockButton, { key: "e2ee-lock" });
  function insertLockButton(tree) {
    const node = globalThis.bunny.utils.findInReactTree(tree, (node) => Array.isArray(node?.props?.children));
    if (!node)
      return tree;
    const children = node.props.children;
    const index = children.indexOf(lockButtonElement);
    if (index !== -1)
      children.splice(index, 1);
    children.push(lockButtonElement);
    return tree;
  }
  var chatInputUnpatch = null;
  var chatInputRetry = null;
  function setupLockButton() {
    chatInputRetry = setInterval(() => {
      let memo;
      try {
        memo = globalThis.bunny.metro.findByFilePath("modules/chat_input/native/action_buttons/ChatInputActions.tsx", true);
      } catch {
        return;
      }
      const render = memo?.type?.render;
      if (typeof render !== "function")
        return;
      if (chatInputRetry) {
        clearInterval(chatInputRetry);
        chatInputRetry = null;
      }
      try {
        chatInputUnpatch = patcher.after("render", memo.type, (_args, ret) => insertLockButton(ret));
        log.info("Lock button installed");
      } catch (e) {
        log.error("Lock button patch failed", e);
      }
    }, 1000);
  }
  function LockButton() {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
      const fn = () => setTick((t) => t + 1);
      stateSubscribers.add(fn);
      return () => {
        stateSubscribers.delete(fn);
      };
    }, []);
    const channelId = SelectedChannelStore?.getChannelId?.() ?? null;
    const channel = channelId ? ChannelStore?.getChannel?.(channelId) : undefined;
    if (!channelId || !channel || !isDM(channel))
      return null;
    const sess = sessions.get(channelId);
    const enabled = enabledChannels.has(channelId);
    const safety = sess?.safetyNum ? ` — safety #: ${sess.safetyNum}` : "";
    let icon = "\uD83D\uDD13";
    let label = "E2EE off — tap to enable";
    if (vaultLocked) {
      icon = "\uD83D\uDD11";
      label = "Locked — tap and enter your password";
    } else if (enabled && sess?.phase === "peer-reset") {
      icon = "⚠️";
      label = "Your friend ended the encrypted chat — tap to choose what happens next";
    } else if (sess && (sess.untrustedKey || sess.phase === "init-recvd" && hasChangedKey(channelId, sess))) {
      icon = "⚠️";
      label = "Your friend's identity key has changed — tap to review it";
    } else if (enabled && sess?.phase === "ready") {
      icon = "\uD83D\uDD12";
      label = `E2EE active${safety}`;
    } else if (enabled && sess?.phase === "init-sent") {
      icon = "\uD83D\uDFE1";
      label = "E2EE handshake in progress";
    } else if (sess?.phase === "init-recvd") {
      icon = "\uD83D\uDCE9";
      label = (enabled ? "Peer requested E2EE — send a message to accept" : "Peer requested E2EE — tap the lock to accept") + safety;
    } else if (enabled) {
      icon = "\uD83D\uDFE1";
      label = "E2EE enabled — send a message to start handshake";
    }
    return h(RN.Text, { style: { fontSize: 20, padding: 4 } }, icon);
  }
  function SettingsComponent() {
    const [, setTick] = React.useState(0);
    const [busy, setBusy] = React.useState(false);
    React.useEffect(() => {
      const fn = () => setTick((t) => t + 1);
      stateSubscribers.add(fn);
      return () => {
        stateSubscribers.delete(fn);
      };
    }, []);
    const { TableRowGroup, TableSwitchRow, Stack } = globalThis.bunny.metro.common.components;
    return h(Stack, { spacing: 24 }, h(TableRowGroup, { title: "Safety" }, h(TableSwitchRow, {
      label: "Show safety number when a secure channel is ready",
      subLabel: "Compare it with your friend out-of-band to detect man-in-the-middle attacks.",
      value: showSafetyNumberOnReady(),
      onValueChange: (v) => {
        doc.showSafetyNumberOnReady = v;
        setTick((t) => t + 1);
      }
    })), h(TableRowGroup, { title: "Data at rest" }, h(TableSwitchRow, {
      label: "Password-protect saved messages",
      subLabel: "Locks the messages this plugin has saved on this device behind a password. " + "You'll enter it each time Discord starts. If you forget it, every message " + "you've sent or received with this plugin is lost for good — there is no reset.",
      value: vaultActive,
      disabled: busy,
      onValueChange: (want) => {
        setBusy(true);
        (async () => {
          try {
            if (want)
              await enableVault();
            else
              await disableVault();
          } catch (e) {
            log.error("Vault reconfiguration failed", e);
            toast(`\uD83D\uDD10 Could not change the password setting: ${e}`, "critical");
          } finally {
            setBusy(false);
            notifyStateChange();
          }
        })();
      }
    })));
  }
  var fluxUnsub = null;
  var sendUnpatch = null;
  var editUnpatch = null;
  function start() {
    globalThis.__e2eeStarted = true;
    if (!hasNativeRng()) {
      log.warn("No CSPRNG available in this runtime (crypto.getRandomValues missing). " + "Key generation falls back to a SHA-256 entropy pool — E2EE security is REDUCED. " + "Consider generating your identity on a desktop build and transferring it.");
    }
    loadAll().then(() => log.info("E2EE state loaded")).catch((e) => log.error("E2EE: initial load failed", e));
    try {
      sendUnpatch = patcher.instead("sendMessage", MessageActions, (args, orig) => {
        const [channelId, data] = args;
        if (!data || typeof data.content !== "string" || isE2EEMessage(data.content) || !enabledChannels.has(channelId)) {
          return orig(...args);
        }
        return runExclusive(channelId, () => onSend(channelId, data)).then((result) => {
          if (result?.cancel)
            return;
          return orig(...args);
        });
      });
      editUnpatch = patcher.instead("editMessage", MessageActions, (args, orig) => {
        const [channelId] = args;
        const block = onEdit(channelId, args);
        if (block === false)
          return;
        return orig(...args);
      });
    } catch (e) {
      log.error("Failed to patch message actions", e);
    }
    try {
      fluxUnsub = globalThis.bunny.api.flux.intercept(fluxInterceptor);
    } catch (e) {
      log.error("Failed to attach flux interceptor", e);
    }
    setupLockButton();
    log.info("E2EE plugin started");
  }
  function stop() {
    vaultKey = null;
    vaultLocked = vaultActive;
    try {
      sendUnpatch?.();
    } catch {}
    try {
      editUnpatch?.();
    } catch {}
    try {
      fluxUnsub?.();
    } catch {}
    try {
      chatInputUnpatch?.();
    } catch {}
    if (chatInputRetry) {
      clearInterval(chatInputRetry);
      chatInputRetry = null;
    }
    chatInputUnpatch = null;
    sendUnpatch = null;
    editUnpatch = null;
    fluxUnsub = null;
    stateSubscribers.clear();
    log.info("E2EE plugin stopped");
  }
  var instance = {
    start,
    stop,
    SettingsComponent,
    settings: SettingsComponent,
    onLoad: start,
    onUnload: stop
  };
  globalThis.plugin = instance;
  globalThis.__e2eeInstance = instance;
  try {
    if (typeof definePlugin === "function")
      definePlugin(instance);
  } catch {}
})();
