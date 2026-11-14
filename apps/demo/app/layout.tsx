import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { VistraWidget } from "@/components/VistraWidget";
import "./globals.css";

export const metadata: Metadata = { title: "Acme Workspace", description: "Reference app embedding VISTRA" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 px-10 py-9">
            <div className="mx-auto max-w-5xl">{children}</div>
          </main>
        </div>
        <VistraWidget />
      </body>
    </html>
  );
}
