import type { ReactNode } from "react";

/** The page title lives in the dashboard topbar (single h1). This row carries the description and page actions. */
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h2 className="sr-only">{title}</h2>
      {sub ? <p className="max-w-2xl text-sm text-muted">{sub}</p> : <span />}
      {actions}
    </div>
  );
}
