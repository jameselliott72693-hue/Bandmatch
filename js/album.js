/** An editable tracklist on top of the imagined album. An untouched album keeps the old link. */

import { planAlbum } from "./band.js";
import { generateSong } from "./song.js";

export const TRACK_MIN = 1;
export const TRACK_MAX = 8;
export const TITLE_LIMIT = 48;

const SEED = /^[a-z0-9]{1,24}$/;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function cleanAlbumTitle(title) {
  return String(title || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, TITLE_LIMIT);
}

export function cleanTrackSeed(seed) {
  const value = String(seed || "").trim().toLowerCase();
  return SEED.test(value) ? value : "";
}

function seedsOf(tracks) {
  return tracks.map((track) => track.seed).join("|");
}

function shape(base, tracks, title) {
  const plannedSeeds = base.plannedSeeds || base.tracks.map((track) => track.seed);
  const plannedTitle = base.plannedTitle || base.albumTitle;
  return {
    seed: base.seed,
    signature: base.signature,
    bandName: base.bandName,
    albumTitle: title,
    tracks,
    plannedTitle,
    plannedSeeds,
    custom: title !== plannedTitle || seedsOf(tracks) !== plannedSeeds.join("|"),
  };
}

export function buildAlbum(slots, seed, code) {
  const base = planAlbum(slots, seed);
  const planned = shape(base, base.tracks, base.albumTitle);
  if (!code || typeof code !== "object") return planned;
  const title = cleanAlbumTitle(code.at) || planned.albumTitle;
  const seeds = [];
  const seen = new Set();
  (Array.isArray(code.tr) ? code.tr : []).forEach((raw) => {
    const trackSeed = cleanTrackSeed(raw);
    if (!trackSeed || seen.has(trackSeed) || seeds.length >= TRACK_MAX) return;
    seen.add(trackSeed);
    seeds.push(trackSeed);
  });
  if (!seeds.length) return shape(planned, planned.tracks, title);
  return shape(planned, seeds.map((trackSeed) => generateSong(slots, trackSeed)), title);
}

export function renameAlbum(album, title) {
  const clean = cleanAlbumTitle(title);
  if (!clean) return album;
  return shape(album, album.tracks, clean);
}

export function moveTrack(album, index, delta) {
  const next = index + delta;
  if (!album?.tracks?.[index] || next < 0 || next >= album.tracks.length) return album;
  const tracks = album.tracks.slice();
  const [item] = tracks.splice(index, 1);
  tracks.splice(next, 0, item);
  return shape(album, tracks, album.albumTitle);
}

export function removeTrack(album, index) {
  if (!album?.tracks?.[index] || album.tracks.length <= TRACK_MIN) return album;
  return shape(album, album.tracks.filter((_, item) => item !== index), album.albumTitle);
}

export function addTrack(album, song) {
  if (!song || !album?.tracks || album.tracks.length >= TRACK_MAX) return album;
  if (album.tracks.some((track) => track.seed === song.seed)) return album;
  return shape(album, [...album.tracks, song], album.albumTitle);
}

export function freshTrackSeed(album, rng) {
  const used = new Set((album?.tracks || []).map((track) => track.seed));
  for (let attempt = 0; attempt < 24; attempt += 1) {
    let seed = "";
    for (let i = 0; i < 6; i += 1) seed += ALPHABET[Math.floor(rng() * ALPHABET.length)];
    if (!used.has(seed)) return seed;
  }
  return "";
}

export function albumPayload(album) {
  if (!album?.custom) return null;
  return {
    at: album.albumTitle,
    tr: album.tracks.map((track) => track.seed),
  };
}

export function coverSong(album) {
  const song = album.tracks[0];
  const retitled = album.custom && album.albumTitle !== album.plannedTitle;
  return {
    ...song,
    title: album.albumTitle,
    signature: retitled ? `${song.signature}::${album.albumTitle}` : song.signature,
  };
}
