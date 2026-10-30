"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPricingContext, type PricingContext } from "@/lib/promotions";
export function usePricingContext(initial: PricingContext | null, initialError?: string | null) {
  const [quote, setQuote] = useState(initial);
  const [quoteError, setError] = useState(initialError ?? "");
  const [checking, setChecking] = useState(false);
  const request = useRef(0);
  useEffect(() => { setQuote(initial); setError(initialError ?? ""); }, [initial, initialError]);
  const refreshQuote = useCallback(async () => {
    const id = ++request.current; setChecking(true);
    try {
      const result = await createClient().rpc("get_order_pricing_context");
      if (result.error || !isPricingContext(result.data)) throw new Error();
      if (id === request.current) { setQuote(result.data); setError(""); }
      return result.data;
    } catch { if (id === request.current) setError("No se pudo verificar la promoción. Actualiza antes de confirmar el pedido."); return null; }
    finally { if (id === request.current) setChecking(false); }
  }, []);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") void refreshQuote(); };
    const interval = window.setInterval(update, 60_000);
    window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); request.current++; };
  }, [refreshQuote]);
  useEffect(() => {
    if (!quote) return;
    const delay = Math.min(Math.max(Date.parse(quote.expires_at) - Date.now() + 100, 1000), 2_147_483_647);
    const timer = window.setTimeout(() => void refreshQuote(), delay);
    return () => window.clearTimeout(timer);
  }, [quote, refreshQuote]);
  return { quote, quoteError, checking, refreshQuote };
}
