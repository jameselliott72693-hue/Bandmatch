/** Imagined tour poster and setlist. The rooms are fictional. No photos and no likenesses. */

export const ROOMS = [
  "Paper Hall",
  "The Late Door",
  "Soft Amplifier",
  "Night Window",
  "Second Room",
  "Unlit Lobby",
  "The Extra Chair",
  "Quiet Balcony",
];

export const POSTER_NOTE = "Imagined tour. Not a real itinerary. No photos and no likenesses.";

const PALETTES = {
  rock: ["#1c1410", "#ff6a45", "#f0c27a"],
  pop: ["#241820", "#ff7a9c", "#ffe08a"],
  soul: ["#1a120c", "#e07a3d", "#f3d2a2"],
  jazz: ["#101820", "#d4a574", "#efe6d6"],
  funk: ["#1a1020", "#ff4d8d", "#f0c24a"],
  metal: ["#100c0c", "#c4352a", "#8d8d92"],
  hiphop: ["#14110e", "#f0c27a", "#ff6a45"],
  country: ["#1c1810", "#e6b15a", "#f4efe4"],
  punk: ["#140c10", "#ff3355", "#f4f0ea"],
  blues: ["#0e141c", "#6aa0c8", "#e7d7b8"],
  electronic: ["#100818", "#7af0d2", "#ff5ad1"],
  classical: ["#161410", "#efe6d2", "#8c3a32"],
  folk: ["#1a1610", "#c4a574", "#efe4cc"],
  disco: ["#160818", "#ffd15a", "#ff4fa3"],
  default: ["#14110e", "#ff6a45", "#f0c27a"],
};

function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function rng() {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function tourStops(album) {
  const total = Math.min(6, Math.max(4, album?.tracks?.length || 4));
  const rng = mulberry32(hashString(`${album?.seed || ""}:${album?.bandName || ""}:tour`));
  const rooms = ROOMS.slice();
  const stops = [];
  for (let night = 1; night <= total && rooms.length; night += 1) {
    const index = Math.floor(rng() * rooms.length);
    const room = rooms.splice(index, 1)[0];
    stops.push({ night, room, label: `Night ${night}` });
  }
  return stops;
}

export function posterCopy(album) {
  const stops = tourStops(album);
  return {
    bandName: album?.bandName || "Imagined band",
    albumTitle: album?.albumTitle || "Imagined album",
    stops,
    nights: stops.map((stop) => `${stop.label} · ${stop.room}`),
    tracks: (album?.tracks || []).map((track, index) => `${index + 1}. ${track.title}`),
    note: POSTER_NOTE,
  };
}

function paletteFor(album) {
  const genre = album?.tracks?.[0]?.genres?.[0] || album?.tracks?.[0]?.bank || "default";
  return PALETTES[genre] || PALETTES.default;
}

function fontSize(ctx, text, maxWidth, size, family) {
  let next = size;
  while (next > 22 && ctx.measureText(text).width > maxWidth) {
    next -= 2;
    ctx.font = family(next);
  }
  return next;
}

function writeLine(ctx, text, x, y, maxWidth, size, family, color) {
  ctx.fillStyle = color;
  ctx.font = family(size);
  fontSize(ctx, text, maxWidth, size, family);
  ctx.fillText(text, x, y);
}

export function drawPoster(canvas, album) {
  const copy = posterCopy(album);
  const palette = paletteFor(album);
  const width = 900;
  const height = 1280;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const serif = (size) => `560 ${size}px Fraunces, Georgia, serif`;
  const sans = (size) => `560 ${size}px Outfit, sans-serif`;
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = palette[1];
  ctx.lineWidth = 10;
  ctx.strokeRect(40, 40, width - 80, height - 80);
  ctx.beginPath();
  ctx.moveTo(72, 300);
  ctx.lineTo(width - 72, 300);
  ctx.lineWidth = 2;
  ctx.stroke();
  writeLine(ctx, "AN IMAGINED TOUR", 72, 120, width - 144, 22, sans, palette[2]);
  writeLine(ctx, copy.bandName, 72, 220, width - 144, 78, serif, "#f6f0e6");
  writeLine(ctx, copy.albumTitle, 72, 274, width - 144, 34, serif, palette[1]);
  writeLine(ctx, "ROOMS", 72, 360, width - 144, 18, sans, palette[2]);
  copy.nights.forEach((line, index) => {
    writeLine(ctx, line, 72, 414 + index * 46, width - 144, 30, sans, "#f6f0e6");
  });
  const setTop = 430 + copy.nights.length * 46;
  writeLine(ctx, "SET", 72, setTop, width - 144, 18, sans, palette[2]);
  copy.tracks.slice(0, 8).forEach((line, index) => {
    writeLine(ctx, line, 72, setTop + 48 + index * 40, width - 144, 26, sans, "#f6f0e6");
  });
  writeLine(ctx, copy.note, 72, height - 78, width - 144, 18, sans, palette[2]);
  return canvas;
}

export function drawSetlist(canvas, album) {
  const copy = posterCopy(album);
  const width = 800;
  const height = 1100;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const serif = (size) => `560 ${size}px Fraunces, Georgia, serif`;
  const sans = (size) => `560 ${size}px Outfit, sans-serif`;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, width - 56, height - 56);
  writeLine(ctx, "SETLIST", 64, 100, width - 128, 20, sans, "#8c3a32");
  writeLine(ctx, copy.bandName, 64, 168, width - 128, 54, serif, "#1a1410");
  writeLine(ctx, copy.albumTitle, 64, 214, width - 128, 26, serif, "#5c4636");
  copy.tracks.slice(0, 8).forEach((line, index) => {
    writeLine(ctx, line, 64, 290 + index * 52, width - 128, 30, sans, "#1a1410");
  });
  const roomsTop = 320 + Math.min(copy.tracks.length, 8) * 52;
  writeLine(ctx, "ROOMS", 64, roomsTop, width - 128, 16, sans, "#8c3a32");
  copy.nights.forEach((line, index) => {
    writeLine(ctx, line, 64, roomsTop + 40 + index * 32, width - 128, 20, sans, "#1a1410");
  });
  writeLine(ctx, copy.note, 64, height - 72, width - 128, 16, sans, "#5c4636");
  return canvas;
}
