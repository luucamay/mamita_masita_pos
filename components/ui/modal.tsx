"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

/** Native dialog contains focus, makes the background inert and restores focus on close. */
export function Modal({ open, title, children, onClose, busy = false, wide = false }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => {
    if (open && ref.current) { ref.current.scrollTop = 0; ref.current.querySelector<HTMLElement>('input:not([type="hidden"]),select,button')?.focus(); }
  }, [open, title]);
  return <dialog ref={ref} aria-labelledby={titleId} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onKeyDownCapture={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); } }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
    className={`fixed inset-0 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-0 text-[var(--ink)] shadow-xl backdrop:bg-stone-950/45 ${wide ? "max-w-4xl" : "max-w-lg"}`}>
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-4 py-2">
      <h2 id={titleId} className="min-w-0 text-lg font-semibold">{title}</h2>
      <button type="button" aria-label="Cerrar ventana" disabled={busy} onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-700 disabled:opacity-40"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>
    <div className="p-4">{children}</div>
  </dialog>;
}
