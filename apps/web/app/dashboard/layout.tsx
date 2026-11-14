import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dash/Shell";

export const metadata = { title: "Dashboard" };

/** Clerk Core 3: protect the resource itself (not via middleware route matching). */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return <DashboardShell>{children}</DashboardShell>;
}
