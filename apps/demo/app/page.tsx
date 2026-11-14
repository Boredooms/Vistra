import { redirect } from "next/navigation";
import { publicConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const c = await publicConfig().catch(() => ({ configured: false }));
  redirect(c.configured ? "/dashboard" : "/setup");
}
