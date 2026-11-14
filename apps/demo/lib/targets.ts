import type { KnownTarget } from "@vistra/sdk-core";

/** Controls Acme exposes to VISTRA guides, including ones that live on other routes. */
export const TARGETS: KnownTarget[] = [
  { id: "nav.dashboard", role: "link", name: "Dashboard", route: "*" },
  { id: "nav.projects", role: "link", name: "Projects", route: "*" },
  { id: "nav.team", role: "link", name: "Team", route: "*" },
  { id: "nav.billing", role: "link", name: "Billing", route: "*" },
  { id: "nav.docs", role: "link", name: "Docs", route: "*" },
  { id: "nav.settings", role: "link", name: "Settings", route: "*" },
  { id: "projects.new", role: "button", name: "New project", route: "/projects" },
  { id: "team.invite", role: "button", name: "Invite member", route: "/team" },
  { id: "invite.name", role: "textbox", name: "Name", route: "/team" },
  { id: "invite.email", role: "textbox", name: "Email", route: "/team" },
  { id: "invite.submit", role: "button", name: "Send invitation", route: "/team" },
  { id: "billing.pay", role: "button", name: "Pay invoice", route: "/billing" },
];

export const DOCS = [
  { file: "pricing.md", title: "Acme Workspace Pricing", type: "md" },
  { file: "api-reference.md", title: "Acme API Reference", type: "md" },
  { file: "onboarding.html", title: "Onboarding Guide", type: "html" },
] as const;

/** Must match app/knowledge/parsing.py::slug so citation anchors resolve to real headings. */
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
