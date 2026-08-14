"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ClearHistoryButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clearHistory() {
    if (
      !window.confirm(
        "Se eliminarán permanentemente todo el historial y todos los pedidos. Esta acción no se puede deshacer. ¿Continuar?",
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    const { error: clearError } = await createClient().rpc("clear_order_history");

    if (clearError) {
      setError(clearError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => void clearHistory()}
        disabled={loading}
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Vaciando..." : "Vaciar historial y pedidos"}
      </button>
      {error ? <p role="alert" className="max-w-xs text-right text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
