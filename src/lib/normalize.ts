import { LIMITS } from "./model";

/** Street-suffix tokens and the spelled-out form they share. Street line only. */
const SUFFIXES: Record<string, string> = {
  st: "street",
  street: "street",
  ave: "avenue",
  avenue: "avenue",
  rd: "road",
  road: "road",
  blvd: "boulevard",
  boulevard: "boulevard",
  dr: "drive",
  drive: "drive",
  ln: "lane",
  lane: "lane",
  ct: "court",
  court: "court",
  pl: "place",
  place: "place",
  pkwy: "parkway",
  parkway: "parkway",
  hwy: "highway",
  highway: "highway",
  rte: "route",
  route: "route",
};

const DIRECTIONS: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
  north: "north",
  south: "south",
  east: "east",
  west: "west",
  northeast: "northeast",
  northwest: "northwest",
  southeast: "southeast",
  southwest: "southwest",
};

const WORD_ORDINALS: Record<string, string> = {
  first: "1",
  second: "2",
  third: "3",
  fourth: "4",
  fifth: "5",
  sixth: "6",
  seventh: "7",
  eighth: "8",
  ninth: "9",
  tenth: "10",
};

function scrub(value: string): string {
  let text = value.trim().toLowerCase().replace(/&/g, " and ");
  text = text
    .replace(/\bu\s*\.\s*s\s*\.?/g, " us ")
    .replace(/\bn\s*\.\s*e\s*\.?/g, " northeast ")
    .replace(/\bn\s*\.\s*w\s*\.?/g, " northwest ")
    .replace(/\bs\s*\.\s*e\s*\.?/g, " southeast ")
    .replace(/\bs\s*\.\s*w\s*\.?/g, " southwest ");
  text = text.replace(/#/g, " unit ");
  text = text.replace(/[^a-z0-9\s]/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function stripUnits(value: string): string {
  let text = value;
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/\b(apt|apartment|unit|suite|ste)(?:\s+(?:apt|apartment|unit|suite|ste))+\b/g, "$1");
    text = text.replace(/\b(?:apt|apartment|unit|suite|ste)\s+[a-z0-9]+\b/g, " ");
    text = text.replace(/\s+/g, " ").trim();
  }
  return text;
}

function rewriteToken(token: string, street: boolean): string {
  const numeric = token.match(/^(\d+)(st|nd|rd|th)$/);
  if (numeric) return numeric[1];
  if (WORD_ORDINALS[token]) return WORD_ORDINALS[token];
  if (DIRECTIONS[token]) return DIRECTIONS[token];
  if (street && SUFFIXES[token]) return SUFFIXES[token];
  return token;
}

function rewrite(value: string, street: boolean): string {
  let text = scrub(value);
  if (street) {
    text = stripUnits(text).replace(/\bu s\b/g, "us");
  }
  return text
    .split(" ")
    .filter((token) => token.length > 0)
    .map((token) => rewriteToken(token, street))
    .join(" ");
}

export function zip5(zip: string): string {
  const match = zip.trim().match(/\d{5}/);
  return match ? match[0] : "";
}

/**
 * Canonical key for dedupe and rejection matching.
 * The street line folds suffixes, directions, units, and ordinals.
 * The city folds directions and punctuation, and leaves "St. Pete" as "st pete"
 * so a city abbreviation is not treated as the street suffix Street.
 * ZIP warnings stay on the 5-digit ZIP, separate from this key.
 */
export function normalizeAddress(
  address: string,
  city: string,
  state: string,
  zip: string,
): string {
  const stateKey = state.toLowerCase().replace(/[^a-z]/g, "");
  return [rewrite(address, true), rewrite(city, false), stateKey, zip5(zip)].join("|");
}

export function normalizedAddressOk(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= LIMITS.normalized &&
    /^[a-z0-9| -]+$/.test(value)
  );
}
