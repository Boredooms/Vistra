"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type Period = 7 | 14 | 30 | 90;
export const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

const Ctx = createContext<{ period: Period; setPeriod: (p: Period) => void; stamp: number; refresh: () => void }>({
  period: 14, setPeriod: () => undefined, stamp: 0, refresh: () => undefined,
});
export const usePeriod = () => useContext(Ctx);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<Period>(14);
  const [stamp, setStamp] = useState(() => Date.now());
  return <Ctx.Provider value={{ period, setPeriod, stamp, refresh: () => setStamp(Date.now()) }}>{children}</Ctx.Provider>;
}
