import type { ReactNode } from "react";
import { LiveBlob } from "@/components/assistant/LiveBlob";
import { Footer, Nav } from "@/components/home/Chrome";

/** Marketing surface: shared nav, footer and the live corner assistant (real SDK against the website's own app). */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
      <LiveBlob />
    </>
  );
}
