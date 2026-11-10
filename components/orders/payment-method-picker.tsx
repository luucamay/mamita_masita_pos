"use client";

const methods = { cash: "Efectivo", qr: "QR", mixed: "Efectivo + QR" } as const;
export type PaymentChoice = keyof typeof methods;

export function PaymentMethodPicker({
  method, onMethodChange, disabled,
}: {
  method: PaymentChoice | null;
  onMethodChange: (method: PaymentChoice) => void;
  total: string | number;
  cash: string;
  onCashChange: (cash: string) => void;
  disabled?: boolean;
}) {
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
    </fieldset>
  );
}
