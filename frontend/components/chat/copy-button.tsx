"use client";

import { useEffect, useState } from "react";

// Copies the raw reply text; shows a brief "Copied" confirmation.
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context); fail quietly.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label="Copy reply"
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted
        transition hover:bg-surface-2 hover:text-foreground"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {copied
          ? <path d="M5 12l5 5L20 7" />
          : <path d="M9 9h10v11H9zM5 15V4h10" />}
      </svg>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
