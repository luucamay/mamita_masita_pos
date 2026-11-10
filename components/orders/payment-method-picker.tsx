"use client";

import { splitPayment } from "@/lib/money";

const methods = { cash: "Efectivo", qr: "QR", mixed: "Efectivo + QR" } as const;
const money = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export type PaymentChoice = keyof typeof methods;

export function PaymentMethodPicker({
  method, onMethodChange, total, cash, onCashChange, disabled,
}: {
  method: PaymentChoice | null;
  onMethodChange: (method: PaymentChoice) => void;
  total: string | number;
  cash: string;
  onCashChange: (cash: string) => void;
  disabled?: boolean;
}) {
  const split = method === "mixed" ? splitPayment(total, cash) : null;
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="mb-1 text-xs font-medium text-[var(--muted)]">Medio de pago</legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(methods) as PaymentChoice[]).map(value => (
          <button key={value} type="button" aria-pressed={method === value} onClick={() => onMethodChange(value)}
            className={`min-h-11 rounded-lg border px-1 text-sm font-semibold disabled:opacity-50 ${method === value ? "border-orange-500 bg-orange-50 text-orange-900" : "border-[var(--border)] bg-white"}`}>
            {methods[value]}
          </button>
        ))}
      </div>
      {method === "mixed" ? (
        <>
          <div className="grid grid-cols-2 items-end gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs font-medium">Efectivo recibido (Bs)</span>
              <input inputMode="decimal" placeholder="0,00" value={cash} maxLength={11}
                aria-invalid={cash.trim() !== "" && !split}
                onChange={event => onCashChange(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[var(--border)] px-3 text-base tabular-nums" />
            </label>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium">Restante por QR</p>
              <output className="flex min-h-11 items-center rounded-lg bg-stone-100 px-3 text-sm font-semibold tabular-nums" aria-live="polite">
                {split ? `Bs ${money.format(split.p_qr)}` : "—"}
              </output>
            </div>
          </div>
          {cash.trim() && !split ? <p className="text-xs text-red-700">Ingresa un efectivo mayor a cero y menor al total, con hasta dos decimales.</p> : null}
        </>
      ) : null}
    </fieldset>
  );
}
