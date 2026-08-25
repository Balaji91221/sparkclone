"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  getSession,
  getToken,
  googleStatus,
  listApprovals,
  logout,
  subscribeToken,
} from "@/lib/api";
import type { Session } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Login } from "./login";
import { Sidebar } from "./sidebar";
import { LogoMark } from "./icons";

const serverSnapshot = () => "";

type AuthState =
  | { kind: "checking" }
  | { kind: "signed-out"; session: Session }
  | { kind: "signed-in" };

// Re-checks the cookie session whenever the stored token changes or is
// cleared (clearToken fires the token event even when nothing was stored,
// which is how a 401 or sign-out gets us back to the login screen).
function useAuthState(): AuthState {
  const token = useSyncExternalStore(subscribeToken, getToken, serverSnapshot);
  const [tick, setTick] = useState(0);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => subscribeToken(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    if (token) return;
    const ac = new AbortController();
    getSession(ac.signal)
      .then(setSession)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setSession({ signedIn: false, email: "", googleEnabled: false });
        }
      });
    return () => ac.abort();
  }, [token, tick]);

  if (token) return { kind: "signed-in" };
  if (!session) return { kind: "checking" };
  return session.signedIn ? { kind: "signed-in" } : { kind: "signed-out", session };
}

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuthState();

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

  switch (auth.kind) {
    case "checking":
      return <main className="min-h-screen bg-background" />;
    case "signed-out":
      return <Login session={auth.session} />;
    case "signed-in":
      return <ConnectedShell>{children}</ConnectedShell>;
    default: {
      const _exhaustive: never = auth;
      throw new Error(`unhandled auth state: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

type ShellData = { pendingApprovals: number; googleEmail: string };

function ConnectedShell({ children }: { children: ReactNode }) {
  // A transient failure of the status call (dev proxy hiccup, abort) must not
  // flip the sidebar to "Connect Google"; keep the last known answer instead.
  const lastGoogleEmail = useRef("");
  const fetchShellData = useCallback(async (signal: AbortSignal): Promise<ShellData> => {
    const [approvals, google] = await Promise.all([
      listApprovals(signal),
      googleStatus(signal).catch(() => null),
    ]);
    if (google) lastGoogleEmail.current = google.connected ? google.email : "";
    return { pendingApprovals: approvals.length, googleEmail: lastGoogleEmail.current };
  }, []);
  const { state } = usePoll(fetchShellData, 5000);
  // Keep showing the last good snapshot through a failed poll (dev proxy
  // hiccups are common with several pages polling at once). Render-time
  // state adjustment, per react.dev "storing information from previous renders".
  const [data, setData] = useState<ShellData | null>(null);
  if (state.kind === "ready" && state.data !== data) setData(state.data);
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
      onSignOut={() => void logout()}
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
        <div
          key={pathname}
          // Chat is a full-height workspace; every other page reads best as a column.
          className={`anim-fade mx-auto ${pathname === "/chat" ? "max-w-[1400px]" : "max-w-4xl"}`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
