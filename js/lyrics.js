/** A one-page sheet of the imagined song's original lyrics. Nothing here is sung. */

import { formatProgression } from "./edit.js";

export function lyricBlocks(song) {
  return (song?.structure || []).map((section, index) => ({
    index: Number.isInteger(section.index) ? section.index : index,
    name: section.name || "Section",
    chords: formatProgression(section.chords || [], song.spell),
    lines: (section.lines || []).map((line) => String(line).trim()).filter(Boolean),
  }));
}

export function lyricText(song) {
  const blocks = lyricBlocks(song);
  const lines = [
    song?.title || "Imagined song",
    song?.bandName || "",
    [song?.tempo ? `${song.tempo} BPM` : "", song?.key || "", song?.timeSignature || ""].filter(Boolean).join(" · "),
    "Original lyrics for this imagined song. Not sung, and not taken from a real song.",
    "",
  ];
  blocks.forEach((block) => {
    lines.push(String(block.name).toUpperCase());
    if (block.chords) lines.push(block.chords);
    if (block.lines.length) lines.push(...block.lines);
    else lines.push("(instrumental)");
    lines.push("");
  });
  return `${lines.join("\n").trim()}\n`;
}
