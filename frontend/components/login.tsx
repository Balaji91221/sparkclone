"use client";

import { useState } from "react";
import { setToken, verifyToken } from "@/lib/api";
import type { Session } from "@/lib/api";
import { inputClass } from "./ui";
import { LogoMark } from "./icons";

type LoginState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "error"; message: string };

type LoginProps = { session: Session };

// The OAuth callback redirects here with ?auth=denied&email=... when the
// Google account is not on SPARK_ALLOWED_EMAILS. Read once on mount.
function deniedEmail(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("auth") !== "denied") return null;
  return params.get("email") ?? "";
}

// Storing the token via setToken notifies the app shell, which swaps this
// screen for the dashboard — no callback needed. Google sign-in is a full-page
// round-trip that ends with a session cookie; the shell picks that up on load.
export function Login({ session }: LoginProps) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<LoginState>({ kind: "idle" });
  const [denied] = useState(deniedEmail);
  const [showToken, setShowToken] = useState(!session.googleEnabled);

  const submit = async () => {
    const candidate = value.trim();
    if (!candidate) {
      setState({ kind: "error", message: "Paste the API token from your .env file." });
      return;
    }
    setState({ kind: "checking" });
    try {
      const ok = await verifyToken(candidate);
      if (!ok) {
        setState({ kind: "error", message: "That token was rejected by the backend." });
        return;
      }
      setToken(candidate);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ kind: "error", message: `Could not reach the backend: ${message}` });
    }
  };

  const signInWithGoogle = () => {
    // Backend route (proxied), not a Next.js page — full-page navigation is
    // required so Google's redirects can take over.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${window.location.origin}/auth/google/login`);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="anim-rise mb-10 flex flex-col items-center text-center"
          style={{ "--d": "0ms" } as React.CSSProperties}>
          <LogoMark className="h-14 w-14" />
          <h1 className="mt-5 text-[1.75rem] font-semibold tracking-[-0.02em]">
            Welcome to Astra
          </h1>
          <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">
            Your always-on agent. Describe a task once — Astra runs it on
            schedule, and asks before anything sensitive.
          </p>
        </div>

        <div
          className="anim-rise rounded-xl border border-line bg-surface p-6
            shadow-[var(--shadow-card)]"
          style={{ "--d": "80ms" } as React.CSSProperties}
        >
          {denied !== null ? (
            <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {denied ? <><code className="font-mono">{denied}</code> is not allowed</>
                : "That Google account is not allowed"}
              {" "}to use this Astra. Add it to{" "}
              <code className="font-mono">SPARK_ALLOWED_EMAILS</code> and try again.
            </p>
          ) : null}

          {session.googleEnabled ? (
            <>
              <button
                type="button"
                onClick={signInWithGoogle}
                className="btn-primary w-full rounded-full py-2.5 text-sm font-medium"
              >
                Sign in with Google
              </button>
              <p className="mt-2 text-center text-xs text-muted">
                Also connects Gmail, Drive &amp; Calendar for the agent.
              </p>
              {showToken ? null : (
                <button
                  type="button"
                  onClick={() => setShowToken(true)}
                  className="mt-4 w-full text-center text-xs text-muted underline-offset-2
                    hover:underline"
                >
                  Use API token instead
                </button>
              )}
            </>
          ) : null}

          {showToken ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className={session.googleEnabled ? "mt-5 border-t border-line pt-5" : ""}
            >
              <label className="mb-1.5 block text-[13px] font-medium text-muted">
                API token
              </label>
              <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Paste your token"
                className={inputClass}
                autoFocus={!session.googleEnabled}
              />

              {state.kind === "error" ? (
                <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                  {state.message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={state.kind === "checking"}
                className="mt-4 w-full rounded-full border border-line py-2.5 text-sm font-medium
                  transition hover:bg-surface-2
                  disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.kind === "checking" ? "Signing in…" : "Sign in with token"}
              </button>
            </form>
          ) : null}
        </div>

        <p className="anim-rise mt-5 text-center text-xs leading-relaxed text-muted"
          style={{ "--d": "160ms" } as React.CSSProperties}>
          Self-hosted, single-user.
          {session.googleEnabled
            ? " Only accounts listed in SPARK_ALLOWED_EMAILS can sign in."
            : " The token is SPARK_API_TOKEN in your .env file."}
        </p>
      </div>
    </main>
  );
}
