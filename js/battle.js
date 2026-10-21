/** Two imagined songs, side by side. The score is a toy for the arrangements, not a ranking of real musicians. */

import { ROLE_IDS } from "./musicians.js";
import { blankSlots, decodeShare, encodeShare, generateSong } from "./song.js";

export function rivalLineup(slots, musicians, rng) {
  const next = blankSlots();
  const used = new Set();
  ROLE_IDS.forEach((role) => {
    const current = slots?.[role];
    if (!current) return;
    const home = new Set(current.genres || []);
    const options = musicians.filter((person) => (
      person.roles.includes(role) && person.id !== current.id && !used.has(person.id)
    ));
    if (!options.length) return;
    const ranked = options.map((person) => ({
      person,
      shared: person.genres.filter((genre) => home.has(genre)).length,
      roll: rng(),
    })).sort((a, b) => a.shared - b.shared || a.roll - b.roll);
    const best = ranked[0].shared;
    const pool = ranked.filter((item) => item.shared === best);
    const pick = pool[Math.floor(rng() * pool.length)] || pool[0];
    used.add(pick.person.id);
    next[role] = pick.person;
  });
  return next;
}

export function roomScore(song) {
  const tempo = Math.max(0, Math.min(1, ((Number(song?.tempo) || 72) - 72) / 84));
  const energy = tempo * 0.45 + (Number(song?.density) || 0) * 0.3 + (Number(song?.drive) || 0) * 0.25;
  return Math.round(Math.max(0, Math.min(1, energy)) * 100);
}

export function battleCall(home, away) {
  const homeScore = roomScore(home);
  const awayScore = roomScore(away);
  let call = "even";
  if (homeScore - awayScore >= 4) call = "home";
  else if (awayScore - homeScore >= 4) call = "away";
  return { home: homeScore, away: awayScore, call };
}

export function encodeBattle(home, away) {
  return `${encodeShare(home.slots, home.seed)}~${encodeShare(away.slots, away.seed)}`;
}

export function decodeBattle(encoded) {
  const parts = String(encoded || "").split("~");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("That rivalry link could not be read.");
  const home = decodeShare(parts[0]);
  const away = decodeShare(parts[1]);
  return { home, away };
}

export function battleSongs(homeSlots, homeSeed, awaySlots, awaySeed) {
  return {
    home: generateSong(homeSlots, homeSeed),
    away: generateSong(awaySlots, awaySeed),
  };
}
