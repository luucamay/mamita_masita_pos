const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/La_Paz",
  calendar: "gregory",
  numberingSystem: "latn",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dateParts(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  const hour = Number(part("hour"));
  // ICU versions disagree on the whitespace/punctuation of Spanish day periods.
  // Compose the visible text ourselves so SSR and hydration use identical bytes.
  const time = `${String(hour % 12 || 12).padStart(2, "0")}:${part("minute")} ${hour < 12 ? "a. m." : "p. m."}`;
  return { day: part("day"), month: part("month"), time };
}

export function formatOrderDate(value: string): string {
  const parts = dateParts(value);
  return parts ? `${parts.day}/${parts.month}, ${parts.time}` : "—";
}

export function formatOrderTime(value: string): string {
  return dateParts(value)?.time ?? "—";
}
