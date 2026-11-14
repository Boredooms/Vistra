"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR, { type SWRConfiguration } from "swr";

export const API_URL = process.env.NEXT_PUBLIC_VISTRA_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface Application {
  id: string;
  name: string;
  status: string;
  domains: string[];
  tool_base_url: string | null;
  has_tool_secret: boolean;
  knowledge_base_id: string | null;
  collection_id: string | null;
}
export interface Me {
  organization: { id: string; name: string };
  current_application_id: string;
  actor: string;
  applications: Application[];
}

interface Ctx {
  me: Me | undefined;
  app: Application | undefined;
  setAppId: (id: string) => void;
  refreshMe: () => Promise<unknown>;
  call: <T = unknown>(path: string, init?: RequestInit & { json?: unknown; appId?: string }) => Promise<T>;
  loading: boolean;
  error: unknown;
}
const AppCtx = createContext<Ctx | null>(null);
export const useVistra = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useVistra outside provider");
  return c;
};

export function VistraApiProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [appId, setAppIdState] = useState<string | undefined>();
  useEffect(() => setAppIdState(localStorage.getItem("vistra.app") ?? undefined), []);

  const call = useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown; appId?: string } = {}): Promise<T> => {
      const token = await getToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...((init.headers as Record<string, string>) ?? {}) };
      const aid = init.appId ?? appId;
      if (aid) headers["X-Vistra-Application"] = aid;
      if (init.json !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(`${API_URL}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
      if (res.status === 204) return undefined as T;
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, body.code ?? "HTTP_ERROR", body.detail ?? body.title ?? `HTTP ${res.status}`);
      return body as T;
    },
    [getToken, appId],
  );

  // Stable key: Clerk Core 3 refreshes tokens in the background and useAuth() can flicker during that.
  // Once signed in we keep the key (and the previous data) so the current app never drops to undefined.
  const [everSignedIn, setEverSignedIn] = useState(false);
  useEffect(() => { if (isLoaded && isSignedIn) setEverSignedIn(true); }, [isLoaded, isSignedIn]);
  const meSwr = useSWR<Me>(everSignedIn ? "/v1/me" : null, () => call<Me>("/v1/me"),
    { revalidateOnFocus: false, revalidateIfStale: false, keepPreviousData: true, dedupingInterval: 60_000 });
  const app = meSwr.data?.applications.find((a) => a.id === (appId ?? meSwr.data?.current_application_id)) ?? meSwr.data?.applications[0];

  const value = useMemo<Ctx>(
    () => ({
      me: meSwr.data,
      app,
      setAppId: (id) => {
        localStorage.setItem("vistra.app", id);
        setAppIdState(id);
      },
      refreshMe: () => meSwr.mutate(),
      call,
      loading: meSwr.isLoading,
      error: meSwr.error,
    }),
    [meSwr, app, call],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** SWR bound to the current application. Pass null to pause. */
export function useGet<T>(path: string | null, config?: SWRConfiguration<T>) {
  const { call, app } = useVistra();
  return useSWR<T>(path && app ? [path, app.id] : null, () => call<T>(path as string, { appId: app?.id }),
    { revalidateOnFocus: false, keepPreviousData: true, ...config });
}
