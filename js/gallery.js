/** Sample band pages, plus bands the listener saves on this device. */

import { planAlbum } from "./band.js";
import { getMusician } from "./musicians.js";
import { blankSlots, encodeShare } from "./song.js";

export const BANDS_KEY = "bandmatch.v1.bands";
export const BAND_LIMIT = 24;

const FEATURED = [
  {
    id: "paper-room",
    seed: "soul01",
    note: "A sample soul and funk lineup. The album is imagined for this page.",
    slots: {
      singer: "aretha-franklin",
      guitar: "nile-rodgers",
      bass: "james-jamerson",
      drums: "clyde-stubblefield",
      keys: "stevie-wonder",
    },
  },
  {
    id: "delay-room",
    seed: "edge02",
    note: "A sample rock lineup. Nothing here is a real band or a real show.",
    slots: {
      singer: "bono",
      guitar: "the-edge",
      bass: "paul-mccartney",
      drums: "john-bonham",
    },
  },
  {
    id: "after-hours",
    seed: "jazz03",
    note: "A sample jazz lineup. The named musicians are not involved.",
    slots: {
      singer: "billie-holiday",
      horns: "miles-davis",
      keys: "herbie-hancock",
      drums: "max-roach",
    },
  },
  {
    id: "odd-meter",
    seed: "metal4",
    note: "A sample heavy lineup. The songs are original and synthesized.",
    slots: {
      singer: "billy-corgan",
      guitar: "tony-iommi",
      bass: "cliff-burton",
      drums: "danny-carey",
    },
  },
];

function slotsFromIds(ids) {
  const slots = blankSlots();
  Object.entries(ids).forEach(([role, id]) => {
    const person = getMusician(id);
    if (!person || !person.roles.includes(role)) throw new Error(`Unknown musician ${id}`);
    slots[role] = person;
  });
  return slots;
}

export function featuredBands() {
  return FEATURED.map((feature) => {
    const slots = slotsFromIds(feature.slots);
    const album = planAlbum(slots, feature.seed);
    return {
      id: feature.id,
      note: feature.note,
      sample: true,
      album,
      encoded: encodeShare(slots, feature.seed),
    };
  });
}

export function bandRecord(album, encoded) {
  return {
    bandName: album.bandName,
    albumTitle: album.albumTitle,
    encoded: String(encoded || ""),
    savedAt: Date.now(),
  };
}

export function rememberBand(list, record) {
  const encoded = String(record?.encoded || "");
  if (!encoded || !record?.bandName) return (list || []).slice(0, BAND_LIMIT);
  const next = [record, ...(list || []).filter((item) => item.encoded !== encoded)];
  return next.slice(0, BAND_LIMIT);
}

export function forgetBand(list, encoded) {
  return (list || []).filter((item) => item.encoded !== encoded);
}
