"use client";

import { useEffect, useRef } from "react";

type ComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
};

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M12 3a9 9 0 019 9" />
    </svg>
  );
}

// Multi-line composer: Enter sends, Shift+Enter inserts a newline, height
// grows with content up to ~6 lines.
export function Composer({ value, onChange, onSend, busy }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const canSend = !busy && value.trim() !== "";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      className="mx-auto w-full max-w-3xl"
    >
      <div
        className="flex items-end gap-3 rounded-[1.75rem] border border-line bg-background/70
          py-2 pl-5 pr-2 transition duration-200 focus-within:border-accent/50
          focus-within:bg-surface focus-within:shadow-[var(--shadow-card-hover)]"
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={busy ? "Astra is working…" : "What can we do next?"}
          aria-label="Message Astra"
          className="max-h-42 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed
            outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition
            duration-200 ${
              canSend
                ? "bg-accent text-accent-fg hover:opacity-90"
                : "bg-surface-2 text-muted"
            } disabled:cursor-not-allowed`}
        >
          {busy ? <Spinner /> : <SendIcon />}
        </button>
      </div>
      <p className="mt-2.5 text-center text-[12px] text-muted">
        Astra is AI and can make mistakes. Sensitive actions pause for your approval.
      </p>
    </form>
  );
}
