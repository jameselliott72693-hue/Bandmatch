/** Stored ZIP (no compression) so the page can bundle files without a library. */

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function dosStamp(date) {
  const when = date || new Date(2026, 0, 1, 0, 0, 0);
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2);
  const day = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  return { time, day };
}

function u16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function u32(view, offset, value) {
  view.setUint32(offset, value, true);
}

export function zipStore(files) {
  const entries = files.map((file) => {
    const name = new TextEncoder().encode(String(file.name).replace(/\\/g, "/"));
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    return { name, data, crc: crc32(data) };
  });
  const stamp = dosStamp();
  let size = 22;
  entries.forEach((entry) => {
    size += 30 + entry.name.length + entry.data.length;
    size += 46 + entry.name.length;
  });
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  const locals = [];
  entries.forEach((entry) => {
    locals.push(offset);
    u32(view, offset, 0x04034b50);
    u16(view, offset + 4, 20);
    u16(view, offset + 8, 0);
    u16(view, offset + 10, stamp.time);
    u16(view, offset + 12, stamp.day);
    u32(view, offset + 14, entry.crc);
    u32(view, offset + 18, entry.data.length);
    u32(view, offset + 22, entry.data.length);
    u16(view, offset + 26, entry.name.length);
    out.set(entry.name, offset + 30);
    out.set(entry.data, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.data.length;
  });
  const central = offset;
  entries.forEach((entry, index) => {
    u32(view, offset, 0x02014b50);
    u16(view, offset + 4, 20);
    u16(view, offset + 6, 20);
    u16(view, offset + 12, stamp.time);
    u16(view, offset + 14, stamp.day);
    u32(view, offset + 16, entry.crc);
    u32(view, offset + 20, entry.data.length);
    u32(view, offset + 24, entry.data.length);
    u16(view, offset + 28, entry.name.length);
    u32(view, offset + 42, locals[index]);
    out.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  });
  u32(view, offset, 0x06054b50);
  u16(view, offset + 8, entries.length);
  u16(view, offset + 10, entries.length);
  u32(view, offset + 12, offset - central);
  u32(view, offset + 16, central);
  return out;
}
