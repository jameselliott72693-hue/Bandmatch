/** Lineup ideas from the pool. This never seats anyone. */

import { GENRE_LABEL, ROLE_LABEL } from "./musicians.js";

const ORDER = ["singer", "guitar", "bass", "drums", "keys", "horns", "dj", "strings"];

const STARTERS = [
  ["aretha-franklin", "singer", "The singer chair is empty. Aretha Franklin is one way to start a soul lineup."],
  ["nile-rodgers", "guitar", "The guitar chair is empty. Nile Rodgers is one way to start a funk lineup."],
  ["james-jamerson", "bass", "The bass chair is empty. James Jamerson is one way to start a soul lineup."],
  ["questlove", "drums", "The drums chair is empty. Questlove is one way to start a hip-hop lineup."],
  ["miles-davis", "horns", "The horns chair is empty. Miles Davis is one way to start a jazz lineup."],
];

function mean(list, key) {
  return list.reduce((sum, entry) => sum + entry.person[key], 0) / list.length;
}

function reasonFor(person, role, seated, genreWeight) {
  const chair = ROLE_LABEL[role].toLowerCase();
  const shared = person.genres.find((genre) => genreWeight[genre]);
  const partner = shared ? seated.find((entry) => entry.person.genres.includes(shared)) : null;
  if (partner && shared) {
    return `Open ${chair} chair. ${person.name} shares ${GENRE_LABEL[shared].toLowerCase()} with ${partner.person.name}.`;
  }
  const heavy = seated.find((entry) => entry.person.weight >= 0.66);
  if (heavy && person.weight < 0.45) {
    return `Open ${chair} chair. A lighter ${GENRE_LABEL[person.genres[0]].toLowerCase()} touch next to ${heavy.person.name}.`;
  }
  const swung = seated.find((entry) => entry.person.swing >= 0.45);
  if (swung && person.swing >= 0.45) {
    return `Open ${chair} chair. ${person.name} swings in the same pocket as ${swung.person.name}.`;
  }
  return `Open ${chair} chair. ${GENRE_LABEL[person.genres[0]]} phrasing sits with this lineup.`;
}

export function suggestLineup(slots, musicians, limit = 4) {
  const seated = ORDER.filter((role) => slots?.[role]).map((role) => ({ role, person: slots[role] }));
  const used = new Set(seated.map((entry) => entry.person.id));
  const empty = ORDER.filter((role) => !slots?.[role]);
  if (!empty.length) return [];
  if (!seated.length) {
    return STARTERS.slice(0, limit).map(([id, role, reason]) => {
      const person = musicians.find((item) => item.id === id);
      return person ? { id, name: person.name, role, reason } : null;
    }).filter(Boolean);
  }
  const genreWeight = {};
  seated.forEach(({ person }) => {
    person.genres.forEach((genre, index) => {
      genreWeight[genre] = (genreWeight[genre] || 0) + (1.2 - index * 0.25);
    });
  });
  const avg = {
    swing: mean(seated, "swing"),
    weight: mean(seated, "weight"),
    density: mean(seated, "density"),
    tempo: seated.reduce((sum, entry) => sum + (entry.person.tempoMin + entry.person.tempoMax) / 2, 0) / seated.length,
  };
  const picks = [];
  const taken = new Set(used);
  empty.forEach((role) => {
    if (picks.length >= limit) return;
    let best = null;
    musicians.forEach((person) => {
      if (taken.has(person.id) || !person.roles.includes(role)) return;
      const genre = person.genres.reduce((sum, item, index) => sum + (genreWeight[item] || 0) * (1 - index * 0.15), 0);
      const tempoMid = (person.tempoMin + person.tempoMax) / 2;
      const distance = Math.abs(person.swing - avg.swing) * 0.7
        + Math.abs(person.weight - avg.weight) * 0.45
        + Math.abs(person.density - avg.density) * 0.25
        + Math.min(1, Math.abs(tempoMid - avg.tempo) / 80) * 0.4;
      const score = genre * 1.6 + (1.4 - distance);
      if (!best || score > best.score || (score === best.score && person.id < best.id)) {
        best = { id: person.id, name: person.name, role, reason: reasonFor(person, role, seated, genreWeight), score };
      }
    });
    if (!best) return;
    picks.push({ id: best.id, name: best.name, role: best.role, reason: best.reason });
    taken.add(best.id);
  });
  return picks;
}
