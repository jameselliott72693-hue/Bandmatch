/** Procedural album cover. Geometry and type only — no photos and no likenesses. */

const PALETTES = {
  rock: ["#1c1410", "#ff6a45", "#f0c27a", "#3a2a22"],
  pop: ["#241820", "#ff7a9c", "#ffe08a", "#3d2438"],
  soul: ["#1a120c", "#e07a3d", "#f3d2a2", "#4a2c18"],
  jazz: ["#101820", "#d4a574", "#efe6d6", "#1c3a4a"],
  funk: ["#1a1020", "#ff4d8d", "#f0c24a", "#2a1840"],
  metal: ["#100c0c", "#c4352a", "#8d8d92", "#2a1818"],
  hiphop: ["#14110e", "#f0c27a", "#ff6a45", "#2c241c"],
  country: ["#1c1810", "#e6b15a", "#f4efe4", "#3d4a28"],
  punk: ["#140c10", "#ff3355", "#f4f0ea", "#241418"],
  blues: ["#0e141c", "#6aa0c8", "#e7d7b8", "#1a2838"],
  electronic: ["#100818", "#7af0d2", "#ff5ad1", "#241040"],
  classical: ["#161410", "#efe6d2", "#8c3a32", "#2a2620"],
  folk: ["#1a1610", "#c4a574", "#efe4cc", "#3a4030"],
  disco: ["#160818", "#ffd15a", "#ff4fa3", "#301848"],
  default: ["#14110e", "#ff6a45", "#f0c27a", "#2a211c"],
};

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export function drawCover(canvas, song) {
  const ctx = canvas.getContext("2d");
  const size = 800;
  canvas.width = size;
  canvas.height = size;
  const genre = song.genres?.[0] || song.bank || "default";
  const palette = PALETTES[genre] || PALETTES[song.bank] || PALETTES.default;
  const rng = mulberry32(hashString(`${song.seed}::${song.signature}::${genre}`));
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);

  const shapes = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < shapes; i += 1) {
    ctx.save();
    ctx.translate(rng() * size, rng() * size);
    ctx.rotate((rng() - 0.5) * Math.PI);
    ctx.globalAlpha = 0.28 + rng() * 0.45;
    ctx.fillStyle = palette[1 + (i % 3)];
    const kind = Math.floor(rng() * 3);
    if (kind === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 40 + rng() * 180, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 1) {
      const w = 40 + rng() * 280;
      const h = 16 + rng() * 90;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -40 - rng() * 80);
      ctx.lineTo(50 + rng() * 70, 40 + rng() * 40);
      ctx.lineTo(-50 - rng() * 70, 30 + rng() * 50);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette[2];
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(size * 0.72, size * 0.28, 70 + rng() * 40, rng() * Math.PI, rng() * Math.PI + Math.PI * 1.4);
  ctx.stroke();

  ctx.fillStyle = "rgba(16, 12, 10, 0.55)";
  ctx.fillRect(36, size - 250, size - 72, 196);
  ctx.fillStyle = palette[2];
  ctx.font = "600 28px Outfit, sans-serif";
  ctx.fillText(song.bandName, 56, size - 196);
  ctx.fillStyle = "#f7f1ea";
  ctx.font = "560 54px Fraunces, serif";
  const lines = wrap(ctx, song.title, size - 130);
  lines.forEach((line, index) => {
    ctx.fillText(line, 56, size - 130 + index * 58);
  });
  ctx.font = "500 18px Outfit, sans-serif";
  ctx.fillStyle = palette[1];
  ctx.fillText("Imagined original", 56, size - 42);
  return canvas;
}
