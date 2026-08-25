"use client";

import { useEffect, useRef } from "react";

// Keeps the feed scrolled to its end while new items arrive. Runs follow only
// while live; chat follows every new message.
export function useAutoscroll(count: number, follow: boolean) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (follow && count > 0) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [count, follow]);
  return endRef;
}
