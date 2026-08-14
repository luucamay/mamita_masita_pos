"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js");
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      return;
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    function handleAppInstalled() {
      setVisible(false);
      setInstallEvent(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!visible || !installEvent) return null;

  async function install() {
    const event = installEvent;
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
  }

  return (
    <aside className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl bg-[var(--sidebar)] px-4 py-3 text-sm text-white shadow-xl md:left-auto md:max-w-sm">
      <span>Instala Mamita Masita para abrirla más rápido.</span>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => setVisible(false)} className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white">
          Ahora no
        </button>
        <button type="button" onClick={() => void install()} className="rounded-lg bg-orange-500 px-3 py-1 font-semibold hover:bg-orange-400">
          Instalar
        </button>
      </div>
    </aside>
  );
}
