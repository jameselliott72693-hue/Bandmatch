/** A weekly lineup rule chosen from the date. No server, and the musician list stays unchanged. */

import { ROLE_IDS } from "./musicians.js";
import { decodeShare, encodeShare } from "./song.js";

/** Breakthrough year, kept off the musician records so old share links stay the same. */
export const ACTIVE_YEAR = {
  "freddie-mercury": 1970,
  "aretha-franklin": 1961,
  "david-bowie": 1969,
  "billie-holiday": 1933,
  beyonce: 1997,
  "johnny-cash": 1955,
  "kurt-cobain": 1989,
  "lauryn-hill": 1994,
  "dolly-parton": 1967,
  "nina-simone": 1958,
  "james-brown": 1956,
  "jimi-hendrix": 1966,
  "jimmy-page": 1966,
  "bb-king": 1949,
  "eddie-van-halen": 1978,
  "nile-rodgers": 1977,
  prince: 1978,
  "johnny-marr": 1982,
  "tony-iommi": 1969,
  "joan-jett": 1975,
  "stevie-ray-vaughan": 1983,
  "james-jamerson": 1959,
  flea: 1983,
  "jaco-pastorius": 1976,
  "carol-kaye": 1957,
  "paul-mccartney": 1960,
  "bootsy-collins": 1970,
  "geddy-lee": 1974,
  "cliff-burton": 1982,
  "john-bonham": 1968,
  questlove: 1987,
  "ringo-starr": 1962,
  "sheila-e": 1976,
  "dave-grohl": 1990,
  "clyde-stubblefield": 1965,
  "max-roach": 1944,
  "herbie-hancock": 1962,
  "ray-charles": 1949,
  "stevie-wonder": 1962,
  "elton-john": 1969,
  "bernie-worrell": 1970,
  "thelonious-monk": 1944,
  "willie-nelson": 1956,
  "chuck-berry": 1955,
  "missy-elliott": 1997,
  "neil-peart": 1974,
  "miles-davis": 1945,
  "louis-armstrong": 1923,
  "john-coltrane": 1955,
  "charlie-parker": 1940,
  "dizzy-gillespie": 1937,
  "maceo-parker": 1964,
  "fred-wesley": 1968,
  "clarence-clemons": 1971,
  "sonny-rollins": 1949,
  "trombone-shorty": 2005,
  "chet-baker": 1952,
  "kamasi-washington": 2015,
  "grandmaster-flash": 1976,
  "kool-herc": 1973,
  "dj-premier": 1989,
  "j-dilla": 1996,
  "frankie-knuckles": 1977,
  "jazzy-jeff": 1986,
  "mix-master-mike": 1990,
  "fatboy-slim": 1996,
  "larry-levan": 1977,
  "dj-shadow": 1996,
  "a-trak": 1997,
  "yo-yo-ma": 1971,
  "stephane-grappelli": 1934,
  "jean-luc-ponty": 1964,
  "itzhak-perlman": 1963,
  "john-cale": 1965,
  "andrew-bird": 1996,
  "regina-carter": 1995,
  "warren-ellis": 1993,
  "hilary-hahn": 1999,
  "arthur-russell": 1978,
  "alison-krauss": 1987,
  "fred-durst": 1994,
  "jimmy-chamberlin": 1991,
  bono: 1980,
  "david-lee-roth": 1978,
  "joe-jonas": 2005,
  "billy-corgan": 1991,
  "danny-carey": 1990,
  "the-edge": 1980,
  "tom-scholz": 1976,
  "tom-petty": 1976,
  "brad-delp": 1976,
  "wes-borland": 1995,
  "joe-satriani": 1986,
  "chuck-mangione": 1960,
};

export const THEMES = [
  {
    id: "before-1975",
    title: "A band from before 1975",
    detail: "Every seated musician broke through before 1975.",
  },
  {
    id: "all-strings",
    title: "An all-strings band",
    detail: "Every seated musician plays strings.",
  },
  {
    id: "one-decade",
    title: "One decade only",
    detail: "Every seated musician belongs to the same decade.",
  },
  {
    id: "classic-room",
    title: "A classic room",
    detail: "Every seated musician broke through before 1960.",
  },
  {
    id: "seventies",
    title: "A seventies band",
    detail: "Every seated musician belongs to the 1970s.",
  },
  {
    id: "no-turntables",
    title: "No turntables",
    detail: "Leave the DJ chair empty, and seat someone who plays horns or strings.",
  },
];

export function yearOf(person) {
  if (!person || person.custom) return null;
  const year = ACTIVE_YEAR[person.id];
  return Number.isInteger(year) ? year : null;
}

export function isoWeek(date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
  return { year, week };
}

export function themeStamp(year, week) {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function themeFromStamp(stamp) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(stamp || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const theme = THEMES[(year * 53 + week) % THEMES.length];
  return { ...theme, year, week, stamp: themeStamp(year, week) };
}

export function themeForDate(date) {
  const { year, week } = isoWeek(date);
  return themeFromStamp(themeStamp(year, week));
}

function seated(slots) {
  return ROLE_IDS.map((role) => slots?.[role]).filter(Boolean);
}

function decade(year) {
  return Math.floor(year / 10) * 10;
}

export function challengeReport(theme, slots) {
  const people = seated(slots);
  const reasons = [];
  if (people.length < 2) reasons.push("Seat at least two musicians.");
  if (theme?.id === "all-strings") {
    people.filter((person) => !person.roles.includes("strings")).forEach((person) => {
      reasons.push(`${person.name} does not play strings.`);
    });
  } else if (theme?.id === "no-turntables") {
    if (slots?.dj) reasons.push("Leave the DJ chair empty.");
    if (people.length >= 2 && !people.some((person) => person.roles.includes("horns") || person.roles.includes("strings"))) {
      reasons.push("Seat someone who plays horns or strings.");
    }
  } else if (theme) {
    const known = [];
    people.forEach((person) => {
      const year = yearOf(person);
      if (year == null) reasons.push(`${person.name} has no breakthrough year for this week's rule.`);
      else known.push({ person, year });
    });
    if (theme.id === "before-1975") {
      known.filter((item) => item.year >= 1975).forEach((item) => {
        reasons.push(`${item.person.name} broke through in ${item.year}.`);
      });
    } else if (theme.id === "classic-room") {
      known.filter((item) => item.year >= 1960).forEach((item) => {
        reasons.push(`${item.person.name} broke through in ${item.year}.`);
      });
    } else if (theme.id === "seventies") {
      known.filter((item) => item.year < 1970 || item.year > 1979).forEach((item) => {
        reasons.push(`${item.person.name} broke through in ${item.year}.`);
      });
    } else if (theme.id === "one-decade" && known.length) {
      const first = decade(known[0].year);
      if (known.some((item) => decade(item.year) !== first)) reasons.push("The lineup spans more than one decade.");
    }
  }
  return { pass: reasons.length === 0, reasons };
}

export function personFits(theme, person, slots) {
  if (!person) return false;
  if (theme?.id === "all-strings") return person.roles.includes("strings");
  if (theme?.id === "no-turntables") return !person.roles.every((role) => role === "dj");
  const year = yearOf(person);
  if (year == null) return false;
  if (theme?.id === "before-1975") return year < 1975;
  if (theme?.id === "classic-room") return year < 1960;
  if (theme?.id === "seventies") return year >= 1970 && year <= 1979;
  if (theme?.id === "one-decade") {
    const anchor = seated(slots).map(yearOf).find((value) => value != null);
    return anchor == null || decade(year) === decade(anchor);
  }
  return true;
}

export function encodeChallenge(stamp, slots, seed) {
  return `${stamp}~${encodeShare(slots, seed)}`;
}

export function decodeChallenge(encoded) {
  const parts = String(encoded || "").split("~");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("That challenge link could not be read.");
  const theme = themeFromStamp(parts[0]);
  if (!theme) throw new Error("That challenge link could not be read.");
  return { theme, ...decodeShare(parts[1]) };
}
