/** Per-chair mixer. Settings live on the song and in the share link when they differ from the defaults. */

const ORDER = ["drums", "bass", "guitar", "keys", "lead", "horns", "dj", "strings", "backing"];

export const CHANNEL_LABEL = {
  drums: "Drums",
  bass: "Bass",
  guitar: "Guitar",
  keys: "Keys",
  lead: "Lead",
  horns: "Horns",
  dj: "DJ",
  strings: "Strings",
  backing: "Backing",
};

const ROLE_CHANNEL = {
  drums: "drums",
  bass: "bass",
  singer: "lead",
  guitar: "guitar",
  keys: "keys",
  horns: "horns",
  dj: "dj",
  strings: "strings",
};

export function defaultChannel() {
  return { volume: 0.82, pan: 0, mute: false, solo: false, reverb: 0.16, tone: 0.7 };
}

export function defaultMixer(roster) {
  const roles = new Set((roster || []).map((entry) => entry.role));
  const channels = {};
  Object.entries(ROLE_CHANNEL).forEach(([role, id]) => {
    if (roles.has(role)) channels[id] = defaultChannel();
  });
  const needsBacking = !roles.has("drums") || !roles.has("bass") || !roles.has("singer")
    || (!roles.has("guitar") && !roles.has("keys"));
  if (needsBacking) channels.backing = defaultChannel();
  return { master: 0.85, channels };
}

export function channelOrder(mixer) {
  return ORDER.filter((id) => mixer?.channels?.[id]);
}

export function channelIdsForPart(mixer, part) {
  const channels = mixer?.channels || {};
  if (part === "chords") {
    const ids = ["guitar", "keys"].filter((id) => channels[id]);
    return ids.length ? ids : (channels.backing ? ["backing"] : []);
  }
  if (channels[part]) return [part];
  if ((part === "drums" || part === "bass" || part === "lead") && channels.backing) return ["backing"];
  return [];
}

export function partIsMuted(mixer, part) {
  const ids = channelIdsForPart(mixer, part);
  return ids.length > 0 && ids.every((id) => mixer.channels[id].mute);
}

export function setPartMuted(mixer, part, muted) {
  channelIdsForPart(mixer, part).forEach((id) => {
    mixer.channels[id].mute = Boolean(muted);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function compactMixer(mixer) {
  if (!mixer) return null;
  const base = defaultChannel();
  const channels = {};
  Object.entries(mixer.channels || {}).forEach(([id, channel]) => {
    const slim = {};
    if (Math.abs(channel.volume - base.volume) > 0.009) slim.v = round2(clamp(channel.volume, 0, 1));
    if (Math.abs(channel.pan) > 0.009) slim.p = round2(clamp(channel.pan, -1, 1));
    if (channel.mute) slim.m = 1;
    if (channel.solo) slim.s = 1;
    if (Math.abs(channel.reverb - base.reverb) > 0.009) slim.r = round2(clamp(channel.reverb, 0, 1));
    if (Math.abs(channel.tone - base.tone) > 0.009) slim.t = round2(clamp(channel.tone, 0, 1));
    if (Object.keys(slim).length) channels[id] = slim;
  });
  const master = Math.abs((mixer.master ?? 0.85) - 0.85) > 0.009 ? round2(clamp(mixer.master, 0, 1)) : null;
  if (!Object.keys(channels).length && master == null) return null;
  const payload = { c: channels };
  if (master != null) payload.M = master;
  return payload;
}

export function applyCompactMix(mixer, compact) {
  const next = {
    master: mixer?.master ?? 0.85,
    channels: Object.fromEntries(Object.entries(mixer?.channels || {}).map(([id, channel]) => [id, { ...channel }])),
  };
  if (!compact || typeof compact !== "object") return next;
  if (compact.M != null) next.master = clamp(compact.M, 0, 1);
  Object.entries(compact.c || {}).forEach(([id, slim]) => {
    if (!next.channels[id] || !slim || typeof slim !== "object") return;
    const channel = next.channels[id];
    if (slim.v != null) channel.volume = clamp(slim.v, 0, 1);
    if (slim.p != null) channel.pan = clamp(slim.p, -1, 1);
    if (slim.m) channel.mute = true;
    if (slim.s) channel.solo = true;
    if (slim.r != null) channel.reverb = clamp(slim.r, 0, 1);
    if (slim.t != null) channel.tone = clamp(slim.t, 0, 1);
  });
  return next;
}

export function midiCc(mixer, id) {
  const channel = mixer?.channels?.[id] || mixer?.channels?.backing;
  if (!channel) return { volume: 100, pan: 64 };
  const anySolo = Object.values(mixer.channels).some((entry) => entry.solo);
  const silenced = channel.mute || (anySolo && !channel.solo);
  const volume = silenced ? 0 : Math.round(clamp(channel.volume, 0, 1) * 127);
  const pan = Math.round((clamp(channel.pan, -1, 1) + 1) * 63.5);
  return { volume, pan };
}

export function toneHz(id, tone) {
  const t = clamp(tone, 0, 1);
  if (id === "drums") return 800 + t * t * 15000;
  if (id === "bass") return 120 + t * 2600;
  return 320 * Math.pow(24, t);
}
