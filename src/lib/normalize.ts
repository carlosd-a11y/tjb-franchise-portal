import { LIMITS } from "./model";

function part(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function zip5(zip: string): string {
  const match = zip.trim().match(/\d{5}/);
  return match ? match[0] : "";
}

export function normalizeAddress(
  address: string,
  city: string,
  state: string,
  zip: string,
): string {
  return [part(address), part(city), part(state), zip5(zip)].join("|");
}

export function normalizedAddressOk(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= LIMITS.normalized &&
    /^[a-z0-9| -]+$/.test(value)
  );
}
