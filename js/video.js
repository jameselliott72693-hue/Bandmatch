/** Shapes drawn from the arrangement and the live spectrum. No footage and no likenesses. */

const PALETTE = {
  rock: ["#1c1410", "#ff6a45", "#f0c27a", "#f6f0e6"],
  pop: ["#241820", "#ff7a9c", "#ffe08a", "#f6f0e6"],
  soul: ["#1a120c", "#e07a3d", "#f3d2a2", "#f6f0e6"],
  jazz: ["#101820", "#d4a574", "#efe6d6", "#f6f0e6"],
  funk: ["#1a1020", "#ff4d8d", "#f0c24a", "#f6f0e6"],
  metal: ["#100c0c", "#c4352a", "#8d8d92", "#f6f0e6"],
  hiphop: ["#14110e", "#f0c27a", "#ff6a45", "#f6f0e6"],
  country: ["#1c1810", "#e6b15a", "#f4efe4", "#f6f0e6"],
  punk: ["#140c10", "#ff3355", "#f4f0ea", "#f6f0e6"],
  blues: ["#0e141c", "#6aa0c8", "#e7d7b8", "#f6f0e6"],
  electronic: ["#100818", "#7af0d2", "#ff5ad1", "#f6f0e6"],
  classical: ["#161410", "#efe6d2", "#8c3a32", "#f6f0e6"],
  default: ["#14110e", "#ff6a45", "#f0c27a", "#f6f0e6"],
};

function average(list) {
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length / 255;
}

export function energiesFromBins(bins) {
  const list = bins ? Array.from(bins) : [];
  const bars = [];
  if (!list.length) {
    return { low: 0, mid: 0, high: 0, bars: Array(16).fill(0) };
  }
  const count = list.length;
  for (let i = 0; i < 16; i += 1) {
    const start = Math.floor((i * count) / 16);
    const end = Math.max(start + 1, Math.floor(((i + 1) * count) / 16));
    bars.push(average(list.slice(start, end)));
  }
  return {
    low: average(list.slice(0, Math.max(1, Math.floor(count * 0.22)))),
    mid: average(list.slice(Math.floor(count * 0.22), Math.max(1, Math.floor(count * 0.6)))),
    high: average(list.slice(Math.floor(count * 0.6))),
    bars,
  };
}

export function videoModel({ genres, sectionIndex, time, bins }) {
  const energy = energiesFromBins(bins);
  const genre = genres?.[0] || "default";
  const section = Number(sectionIndex) || 0;
  const seconds = Number(time) || 0;
  return {
    genre,
    palette: PALETTE[genre] || PALETTE.default,
    section,
    time: seconds,
    energy,
    spin: section * 0.65 + seconds * (0.18 + energy.mid * 0.8),
  };
}

export function drawVideo(canvas, model) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const { palette, energy, spin, section, time } = model;
  const ink = palette[1];
  const paper = palette[2];
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, width, height);
  const centerX = width * 0.5;
  const centerY = height * 0.4;
  const reach = Math.min(width, height) * 0.42;
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i += 1) {
    const pulse = 0.84 + energy.low * 0.5 + Math.sin(time * 1.7 + i) * 0.05;
    const radius = reach * (0.26 + i * 0.13) * pulse;
    ctx.beginPath();
    ctx.strokeStyle = i % 2 === 0 ? ink : paper;
    ctx.globalAlpha = 0.72 + energy.high * 0.25;
    ctx.lineWidth = 8 + energy.mid * 16;
    const start = spin + i * 0.55;
    ctx.arc(centerX, centerY, radius, start, start + Math.PI * (1.2 + energy.high * 0.45));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = ink;
  const core = reach * (0.1 + energy.low * 0.18 + Math.abs(Math.sin(time * 2.2)) * 0.04);
  ctx.arc(centerX, centerY, core, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const bars = energy.bars;
  const gap = Math.max(6, width * 0.008);
  const barWidth = (width * 0.86 - gap * (bars.length - 1)) / bars.length;
  const left = width * 0.07;
  bars.forEach((level, index) => {
    const idle = 0.18 + Math.abs(Math.sin(time * 2.4 + index * 0.45 + section)) * 0.28;
    const amount = Math.max(level, idle);
    const barHeight = height * (0.05 + amount * 0.4);
    ctx.fillStyle = index % 2 === 0 ? ink : paper;
    ctx.fillRect(left + index * (barWidth + gap), height * 0.9 - barHeight, barWidth, barHeight);
  });
  ctx.globalAlpha = 1;
  return canvas;
}
