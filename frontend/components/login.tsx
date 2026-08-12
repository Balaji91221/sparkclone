"use client";

import { useState } from "react";
import { setToken, verifyToken } from "@/lib/api";
import { inputClass } from "./ui";
import { LogoMark } from "./icons";

type LoginState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "error"; message: string };

// Storing the token via setToken notifies the app shell, which swaps this
// screen for the dashboard — no callback needed.
export function Login() {
  const [value, setValue] = useState("");
  const [state, setState] = useState<LoginState>({ kind: "idle" });

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

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="anim-rise mb-10 flex flex-col items-center text-center"
          style={{ "--d": "0ms" } as React.CSSProperties}>
          <LogoMark className="h-14 w-14" />
          <h1 className="mt-5 text-[1.75rem] font-semibold tracking-[-0.02em]">
            Welcome to Arclight
          </h1>
          <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">
            Your always-on agent. Describe a task once — Arclight runs it on
            schedule, and asks before anything sensitive.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="anim-rise rounded-xl border border-line bg-surface p-6
            shadow-[var(--shadow-card)]"
          style={{ "--d": "80ms" } as React.CSSProperties}
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
            autoFocus
          />

          {state.kind === "error" ? (
            <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {state.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={state.kind === "checking"}
            className="btn-primary mt-4 w-full rounded-full py-2.5 text-sm font-medium
              disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === "checking" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="anim-rise mt-5 text-center text-xs leading-relaxed text-muted"
          style={{ "--d": "160ms" } as React.CSSProperties}>
          Self-hosted, single-user. The token is
          <code className="font-mono"> SPARK_API_TOKEN</code> in your
          <code className="font-mono"> .env</code> file.
        </p>
      </div>
    </main>
  );
}
