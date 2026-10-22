/** A remix link keeps the original lineup and the swapped one. Both songs stay imagined. */

import { ROLE_IDS, ROLE_LABEL } from "./musicians.js";
import { decodeShare, encodeShare } from "./song.js";

export function remixChanges(originalSlots, remixSlots) {
  const changes = [];
  ROLE_IDS.forEach((role) => {
    const before = originalSlots?.[role] || null;
    const after = remixSlots?.[role] || null;
    if ((before?.id || "") === (after?.id || "")) return;
    const label = ROLE_LABEL[role];
    if (before && after) changes.push({ role, kind: "swapped", text: `${label}: ${before.name} → ${after.name}` });
    else if (after) changes.push({ role, kind: "added", text: `${label}: ${after.name} added` });
    else changes.push({ role, kind: "removed", text: `${label}: ${before.name} left the chair` });
  });
  return changes;
}

export function encodeRemix(originalSlots, originalSeed, remixSlots, remixSeed) {
  return `${encodeShare(originalSlots, originalSeed)}~${encodeShare(remixSlots, remixSeed)}`;
}

export function decodeRemix(encoded) {
  const parts = String(encoded || "").split("~");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("That remix link could not be read.");
  return {
    original: decodeShare(parts[0]),
    remix: decodeShare(parts[1]),
  };
}
