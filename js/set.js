/** A live set plays an album in order, with a short break between tracks. */

export const TRANSITION_MS = 3200;

export function nextTrack(index, count) {
  const next = Number(index) + 1;
  if (!Number.isInteger(next) || next < 0 || next >= count) return null;
  return next;
}

export function liveKicker(between) {
  return between ? "Between songs" : "Now playing";
}
