export function money(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function sqft(value: number): string {
  return `${value.toLocaleString("en-US")} sqft`;
}

export function sourceLabel(source: string): string {
  if (source === "manual") return "Manual";
  if (source.startsWith("bot:")) return `Bot · ${source.slice(4)}`;
  return source;
}
