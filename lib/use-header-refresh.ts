"use client";
import { useEffect, useRef } from "react";
/** A client-managed screen can refresh through the shared header action. */
export function useHeaderRefresh(refresh: () => void, enabled = true) {
  const callback = useRef(refresh);
  useEffect(() => { callback.current = refresh; });
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: Event) => { event.preventDefault(); callback.current(); };
    window.addEventListener("mamita:refresh", handler);
    return () => window.removeEventListener("mamita:refresh", handler);
  }, [enabled]);
}
