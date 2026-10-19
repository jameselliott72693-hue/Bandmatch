/** Compact share text. Short payloads stay plain base64url. Longer ones are compressed, with a z. prefix. */

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(text) {
  let normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function lzCompress(text) {
  const input = new TextEncoder().encode(text);
  const out = [];
  let i = 0;
  while (i < input.length) {
    let bestLen = 0;
    let bestDist = 0;
    const windowStart = Math.max(0, i - 4095);
    const limit = Math.min(input.length, i + 63);
    for (let j = windowStart; j < i; j += 1) {
      let len = 0;
      while (i + len < limit && input[j + len] === input[i + len]) len += 1;
      if (len > bestLen) {
        bestLen = len;
        bestDist = i - j;
        if (bestLen >= 63) break;
      }
    }
    if (bestLen >= 4) {
      out.push(0x80 | bestLen, (bestDist >> 8) & 255, bestDist & 255);
      i += bestLen;
    } else {
      out.push(input[i] & 0x7f);
      i += 1;
    }
  }
  return Uint8Array.from(out);
}

function lzDecompress(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length;) {
    const flag = bytes[i];
    if (flag & 0x80) {
      const len = flag & 0x3f;
      const dist = (bytes[i + 1] << 8) | bytes[i + 2];
      i += 3;
      if (!dist || dist > out.length || !len) throw new Error("Bad share compression.");
      const start = out.length - dist;
      for (let k = 0; k < len; k += 1) out.push(out[start + k]);
    } else {
      out.push(flag);
      i += 1;
    }
  }
  return new TextDecoder().decode(Uint8Array.from(out));
}

export function packText(text) {
  const plain = toBase64Url(new TextEncoder().encode(text));
  if (plain.length < 900) return plain;
  const compressed = `z.${toBase64Url(lzCompress(text))}`;
  return compressed.length < plain.length ? compressed : plain;
}

export function unpackText(packed) {
  const source = String(packed || "");
  if (source.startsWith("z.")) return lzDecompress(fromBase64Url(source.slice(2)));
  return new TextDecoder().decode(fromBase64Url(source));
}
