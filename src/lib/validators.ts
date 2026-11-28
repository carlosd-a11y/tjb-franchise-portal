import { LIMITS, REASON_CODES } from "./model";
import { normalizeAddress, normalizedAddressOk, zip5 } from "./normalize";
import type { ReasonCode } from "../types";

export type DraftLocation = {
  address: string;
  city: string;
  state: string;
  zip: string;
  sqft: string;
  rent: string;
  lat: string;
  lng: string;
  listingUrl?: string;
  contactName?: string;
  contactPhone?: string;
};

export type ParsedLocation = {
  address: string;
  city: string;
  state: string;
  zip: string;
  normalizedAddress: string;
  sqft: number;
  rent: number;
  lat: number | null;
  lng: number | null;
  listingUrl?: string;
  contactName?: string;
  contactPhone?: string;
};

function clean(value: string, max: number): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function whole(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value.trim());
  if (!Number.isSafeInteger(number) || number < min || number > max) return null;
  return number;
}

export function parseDraftLocation(draft: DraftLocation): { value: ParsedLocation } | { error: string } {
  const address = clean(draft.address, LIMITS.address);
  const city = clean(draft.city, LIMITS.city);
  const state = draft.state.trim().toUpperCase();
  const zip = zip5(draft.zip);
  if (!address) return { error: "Enter an address." };
  if (!city) return { error: "Enter a city." };
  if (!/^[A-Z]{2}$/.test(state)) return { error: "Use a 2-letter state." };
  if (!/^\d{5}$/.test(zip)) return { error: "Use a 5-digit ZIP." };
  const sqft = whole(draft.sqft, LIMITS.sqftMin, LIMITS.sqftMax);
  const rent = whole(draft.rent, LIMITS.rentMin, LIMITS.rentMax);
  if (sqft === null) return { error: "Enter the square feet." };
  if (rent === null) return { error: "Enter the monthly rent." };

  const latText = draft.lat.trim();
  const lngText = draft.lng.trim();
  let lat: number | null = null;
  let lng: number | null = null;
  if (latText !== "" || lngText !== "") {
    lat = Number(latText);
    lng = Number(lngText);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: "Latitude looks wrong." };
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { error: "Longitude looks wrong." };
  }

  const normalizedAddress = normalizeAddress(address, city, state, zip);
  if (!normalizedAddressOk(normalizedAddress)) return { error: "That address cannot be saved." };
  const listingUrl = (draft.listingUrl ?? "").trim();
  const contactName = (draft.contactName ?? "").trim();
  const contactPhone = (draft.contactPhone ?? "").trim();
  if (listingUrl && !/^https?:\/\/[^\s/?#]+\S*$/i.test(listingUrl)) {
    return { error: "The listing link must start with http:// or https://." };
  }
  if (contactName.length > LIMITS.name) return { error: "Contact name is too long." };
  if (contactPhone && contactPhone.replace(/\D/g, "").length < 7) return { error: "That phone number looks wrong." };

  // Left out when empty, so a record without them has the same shape as before.
  const extras = {
    ...(listingUrl ? { listingUrl } : {}),
    ...(contactName ? { contactName } : {}),
    ...(contactPhone ? { contactPhone } : {}),
  };
  return { value: { address, city, state, zip, normalizedAddress, sqft, rent, lat, lng, ...extras } };
}

export type DraftAddress = Pick<DraftLocation, "address" | "city" | "state" | "zip">;

export type ParsedAddress = Pick<ParsedLocation, "address" | "city" | "state" | "zip" | "normalizedAddress">;

export function parseDraftAddress(draft: DraftAddress): { value: ParsedAddress } | { error: string } {
  const address = clean(draft.address, LIMITS.address);
  const city = clean(draft.city, LIMITS.city);
  const state = draft.state.trim().toUpperCase();
  const zip = zip5(draft.zip);
  if (!address) return { error: "Enter an address." };
  if (!city) return { error: "Enter a city." };
  if (!/^[A-Z]{2}$/.test(state)) return { error: "Use a 2-letter state." };
  if (!/^\d{5}$/.test(zip)) return { error: "Use a 5-digit ZIP." };
  const normalizedAddress = normalizeAddress(address, city, state, zip);
  if (!normalizedAddressOk(normalizedAddress)) return { error: "That address cannot be saved." };
  return { value: { address, city, state, zip, normalizedAddress } };
}

export function parsePassReason(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 3 || trimmed.length > LIMITS.reason) return null;
  return trimmed;
}

export function parseNote(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > LIMITS.note) return null;
  return trimmed;
}

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as string[]).includes(value);
}
