"use client";

import clsx from "clsx";
import { Check, Copy, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline" | "ghost" | "danger"; size?: "sm" | "md" | "lg" };

export function Button({ variant = "outline", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={clsx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background,color,border-color,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-9 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        variant === "solid" && "bg-ink text-bg hover:bg-white",
        variant === "outline" && "border border-line-strong text-ink hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-ink",
        variant === "danger" && "border border-line-strong text-bad hover:bg-hover",
        className,
      )}
    />
  );
}

const field = "w-full rounded-lg border border-line-strong bg-raised px-3 text-sm text-ink placeholder:text-subtle transition-colors focus:border-ink focus:outline-none";
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={clsx(field, "h-9", className)} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={clsx(field, "min-h-32 py-2 font-mono text-[13px]", className)} />;
}
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={clsx(field, "h-9 appearance-none pr-8", className)} />;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-line-strong text-muted",
        tone === "ok" && "border-line-strong text-ok",
        tone === "warn" && "border-line-strong text-warn",
        tone === "bad" && "border-line-strong text-bad",
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", tone === "neutral" ? "bg-subtle" : "bg-current")} />
      {children}
    </span>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={clsx("skeleton", className)} />;

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** Native <dialog>: focus trap, Escape and top-layer for free. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx("m-auto w-[calc(100%-2rem)] rounded-2xl border border-line-strong bg-panel p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm", wide ? "max-w-2xl" : "max-w-md")}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ---- toasts ----------------------------------------------------------------------------------------
type Toast = { id: number; text: string; tone: "ok" | "bad" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "bad") => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role="status" className={clsx("rounded-lg border border-line-strong bg-panel px-4 py-2.5 text-sm shadow-xl", t.tone === "bad" ? "text-bad" : "text-ink")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return <p role="alert" className="rounded-lg border border-line-strong px-3 py-2 text-sm text-bad">{error instanceof Error ? error.message : String(error)}</p>;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
