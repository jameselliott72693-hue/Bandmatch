/** A shareable supergroup page: one lineup, one album, several related seeds. */

import { ROLE_LABEL } from "./musicians.js";
import { generateSong, hashString, mulberry32, slotSignature } from "./song.js";

const ALBUMS = [
  "After the Soundcheck",
  "Room Tone",
  "Second Set",
  "Paper Setlist",
  "Late Doors",
  "Unreleased Room",
  "Soft Amplifiers",
  "The Extra Chair",
];

function trackSeed(rng) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let seed = "";
  for (let i = 0; i < 6; i += 1) seed += alphabet[Math.floor(rng() * alphabet.length)];
  return seed;
}

export function planAlbum(slots, seed) {
  const signature = slotSignature(slots);
  const rng = mulberry32(hashString(`${seed}::${signature}::album`));
  const count = 3 + Math.floor(rng() * 4);
  const seeds = [];
  for (let i = 0; i < count; i += 1) seeds.push(trackSeed(rng));
  seeds[0] = String(seed).slice(0, 24);
  const tracks = seeds.map((trackSeedValue) => generateSong(slots, trackSeedValue));
  const anchor = tracks[0];
  return {
    seed: seeds[0],
    signature,
    bandName: anchor.bandName,
    albumTitle: ALBUMS[Math.floor(rng() * ALBUMS.length)],
    tracks,
  };
}

export function imaginedBio(album) {
  const song = album.tracks[0];
  const members = song.roster.map((entry) => `${entry.name} in the ${ROLE_LABEL[entry.role].toLowerCase()} chair`).join("; ");
  const feel = song.swing > 0.45 ? "swung" : "straight";
  const weight = song.weight > 0.66 ? "heavy" : song.weight < 0.4 ? "light" : "mid-weight";
  return `Imagined bio, not a history of any real group. ${album.bandName} is a made-up supergroup assembled for this page. In the fantasy, ${members}. The room leans ${feel} and ${weight}. ${song.blend || song.pocket} The named musicians are not involved, and nothing here is a real quote, session, or recording.`;
}
