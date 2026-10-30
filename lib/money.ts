// All calculations use integer centavos. numeric(10,2) is the database limit.
export const MAX_MONEY_CENTS = 9_999_999_999;

export function toCents(value: string | number): number {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Importe inválido: usar hasta dos decimales.");
  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(MAX_MONEY_CENTS)) throw new Error("Importe fuera del rango permitido.");
  return Number(cents);
}

export type PricingLine = { id: string; unitPrice: string | number; quantity: number };
export type PricedLine = { id: string; grossCents: number; discountCents: number; netCents: number };

export function priceOrder(lines: PricingLine[], discountBasisPoints = 0) {
  if (!Number.isInteger(discountBasisPoints) || discountBasisPoints < 0 || discountBasisPoints > 10_000) throw new Error("Descuento inválido.");
  if (new Set(lines.map((line) => line.id)).size !== lines.length) throw new Error("Identificadores de líneas duplicados.");
  const gross = lines.map((line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error("Cantidad inválida.");
    const cents = BigInt(toCents(line.unitPrice)) * BigInt(line.quantity);
    if (cents > BigInt(MAX_MONEY_CENTS)) throw new Error("Importe fuera del rango permitido.");
    return cents;
  });
  const sum = gross.reduce((total, value) => total + value, BigInt(0));
  if (sum > BigInt(MAX_MONEY_CENTS)) throw new Error("Importe fuera del rango permitido.");
  // Round half up once per order, then allocate by largest remainder, UUID ascending for ties.
  const target = (sum * BigInt(discountBasisPoints) + BigInt(5000)) / BigInt(10_000);
  const shares = gross.map((value, index) => ({ index, base: sum ? value * target / sum : BigInt(0), remainder: sum ? value * target % sum : BigInt(0) }));
  const extras = Number(target - shares.reduce((total, share) => total + share.base, BigInt(0)));
  const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? (lines[a.index].id < lines[b.index].id ? -1 : 1) : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < extras; i++) ranked[i].base += BigInt(1);
  const priced: PricedLine[] = shares.map((share) => ({ id: lines[share.index].id, grossCents: Number(gross[share.index]), discountCents: Number(share.base), netCents: Number(gross[share.index] - share.base) }));
  return { grossCents: Number(sum), discountCents: Number(target), netCents: Number(sum - target), lines: priced };
}
