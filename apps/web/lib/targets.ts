import type { KnownTarget } from "@boredooms/vistra-sdk";

/** Controls on this website that guides may point at (including on other routes). */
export const WEB_TARGETS: KnownTarget[] = [
  { id: "nav.overview", role: "link", name: "Overview", route: "/dashboard" },
  { id: "nav.analytics", role: "link", name: "Analytics", route: "/dashboard" },
  { id: "nav.agents", role: "link", name: "Agents", route: "/dashboard" },
  { id: "nav.logs", role: "link", name: "Logs", route: "/dashboard" },
  { id: "nav.applications", role: "link", name: "Applications", route: "/dashboard" },
  { id: "agents.publish", role: "button", name: "Save and publish", route: "/dashboard/agents" },
  { id: "nav.keys", role: "link", name: "API keys", route: "/dashboard" },
  { id: "nav.knowledge", role: "link", name: "Knowledge", route: "/dashboard" },
  { id: "nav.runs", role: "link", name: "Runs", route: "/dashboard" },
  { id: "nav.install", role: "link", name: "Install", route: "/dashboard" },
  { id: "applications.new", role: "button", name: "New application", route: "/dashboard/applications" },
  { id: "keys.create", role: "button", name: "Create key", route: "/dashboard/keys" },
  { id: "knowledge.add", role: "button", name: "Add source", route: "/dashboard/knowledge" },
  { id: "site.docs", role: "link", name: "Docs", route: "/" },
  { id: "site.dashboard", role: "link", name: "Dashboard", route: "/" },
  { id: "site.start", role: "link", name: "Get started", route: "/" },
  { id: "site.packages", role: "link", name: "Packages", route: "/" },
];
