import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import {getActiveAccess} from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mamita Masita",
  description: "Pedidos y ventas de Mamita Masita",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#232323",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The same request-scoped access read is reused by protected pages. Navigation
  // must not start empty while a second browser request verifies the same role.
  const access=await getActiveAccess().catch(()=>null);
  return (
    <html lang="es">
      <body>
        <AppShell initialRole={access?.profile.role??null}>{children}</AppShell>
      </body>
    </html>
  );
}
