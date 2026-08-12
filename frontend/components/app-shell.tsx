"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { clearToken, getToken, googleStatus, listApprovals, subscribeToken } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Login } from "./login";
import { Sidebar } from "./sidebar";
import { LogoMark } from "./icons";

const serverSnapshot = () => "";

export function AppShell({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribeToken, getToken, serverSnapshot);

  // Once an entrance animation finishes, drop the fill-mode pin so hover
  // transforms (.hover-lift) on the same element work again.
  useEffect(() => {
    const onEnd = (e: AnimationEvent) => {
      const el = e.target;
      if (el instanceof HTMLElement && (e.animationName === "rise" || e.animationName === "fade")) {
        el.classList.add("anim-done");
      }
    };
    document.addEventListener("animationend", onEnd);
    return () => document.removeEventListener("animationend", onEnd);
  }, []);

  if (!token) return <Login />;
  return <ConnectedShell>{children}</ConnectedShell>;
}

type ShellData = { pendingApprovals: number; googleEmail: string };

function ConnectedShell({ children }: { children: ReactNode }) {
  const fetchShellData = useCallback(async (signal: AbortSignal): Promise<ShellData> => {
    const [approvals, google] = await Promise.all([
      listApprovals(signal),
      googleStatus(signal).catch(() => ({ connected: false, email: "", scopes: [] })),
    ]);
    return {
      pendingApprovals: approvals.length,
      googleEmail: google.connected ? google.email : "",
    };
  }, []);
  const { state } = usePoll(fetchShellData, 5000);
  const data = state.kind === "ready" ? state.data : null;
  const pathname = usePathname();

  // Desktop: sidebar toggles between full and hidden (close button).
  // Mobile: sidebar is an overlay drawer opened from the top bar.
  const [navOpen, setNavOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer when navigation changes the route
  // (render-time state adjustment; see react.dev "adjusting state on prop change").
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  const sidebar = (
    <Sidebar
      pendingApprovals={data?.pendingApprovals ?? 0}
      googleEmail={data?.googleEmail ?? ""}
      onSignOut={clearToken}
      onClose={() => {
        setNavOpen(false);
        setDrawerOpen(false);
      }}
    />
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className={`hidden md:block ${navOpen ? "" : "md:hidden"}`}>{sidebar}</div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="anim-fade absolute inset-y-0 left-0 w-[248px]">{sidebar}</div>
        </div>
      ) : null}

      {/* Top bar: hamburger on mobile, reopen button on desktop when closed */}
      <header
        className={`glass sticky top-0 z-20 flex items-center gap-3 border-b border-line
          px-4 py-2.5 md:px-6 ${navOpen ? "md:hidden" : ""}`}
      >
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => {
            if (window.matchMedia("(min-width: 768px)").matches) setNavOpen(true);
            else setDrawerOpen(true);
          }}
          className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2
            hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <LogoMark className="h-7 w-7" />
        <p className="text-[15px] font-semibold tracking-tight">Astra</p>
      </header>

      <main
        className={`px-4 py-6 md:px-8 md:py-8 ${navOpen ? "md:ml-[232px]" : ""}`}
      >
        {/* Keyed by route so page changes get a soft cross-fade. */}
        <div key={pathname} className="anim-fade mx-auto max-w-4xl">
          {children}
        </div>
      </main>
    </div>
  );
}
