import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SiteCursor } from "@/components/SiteCursor";
import { SmoothScroll } from "@/components/SmoothScroll";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "VISTRA: an agent that points, explains and does", template: "%s | VISTRA" },
  description:
    "Embed an agent in your product that answers from your docs with citations, guides users with a visible cursor, and runs approved actions it then verifies.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {/* Clerk Core 3: the provider lives inside <body>. */}
        <ClerkProvider
          afterSignOutUrl="/"
          appearance={{
            theme: dark,
            variables: {
              colorPrimary: "#f5f5f5",
              colorPrimaryForeground: "#0a0a0a",
              colorBackground: "#161616",
              colorForeground: "#f5f5f5",
              colorInput: "#1f1f1f",
              borderRadius: "0.6rem",
              fontFamily: "var(--font-sans)",
            },
          }}
        >
          <SmoothScroll />
          <SiteCursor />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
