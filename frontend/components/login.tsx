"use client";

import { useState } from "react";
import { setToken, verifyToken } from "@/lib/api";
import { Button, inputClass } from "./ui";

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
    <main className="relative grid min-h-screen place-items-center overflow-hidden
      bg-background px-4">
      <div className="hero-glow" aria-hidden />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="anim-rise w-full max-w-sm rounded-2xl border border-line bg-surface p-8
          shadow-lg"
      >
        <div className="mb-6 flex items-center gap-3">
          <span
            className="spark-pulse grid h-10 w-10 place-items-center rounded-xl bg-accent
              text-lg font-bold text-accent-fg"
          >
            ⚡
          </span>
          <div>
            <h1 className="text-lg font-semibold">SparkClone</h1>
            <p className="text-xs text-muted">Mission control for your personal agent</p>
          </div>
        </div>

        <label className="mb-1.5 block text-[13px] font-medium text-muted">API token</label>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="SPARK_API_TOKEN value"
          className={inputClass}
          autoFocus
        />
        <p className="mt-2 text-xs text-muted">
          Found as <code className="font-mono">SPARK_API_TOKEN</code> in the project&apos;s
          <code className="font-mono"> .env</code> file.
        </p>

        {state.kind === "error" ? (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            {state.message}
          </p>
        ) : null}

        <div className="mt-5">
          <Button type="submit" variant="primary" disabled={state.kind === "checking"}>
            {state.kind === "checking" ? "Checking…" : "Connect"}
          </Button>
        </div>
      </form>
    </main>
  );
}
