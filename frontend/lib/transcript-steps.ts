// Normalizes a run transcript (OpenAI-format from the NVIDIA provider, or
// Anthropic-format blocks) into a flat list of activity steps for the feed.

export type Step =
  | { kind: "task"; text: string }
  | { kind: "reasoning"; text: string }
  | { kind: "narration"; text: string }
  | { kind: "tool"; id: string; name: string; input: unknown; result: string | null }
  | { kind: "raw"; value: unknown };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asText(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

function parseArguments(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function attachResult(steps: Step[], id: string | null, content: string): boolean {
  if (id) {
    for (const s of steps) {
      if (s.kind === "tool" && s.id === id) {
        s.result = content;
        return true;
      }
    }
  }
  for (const s of steps) {
    if (s.kind === "tool" && s.result === null) {
      s.result = content;
      return true;
    }
  }
  return false;
}

function assistantSteps(msg: Record<string, unknown>, steps: Step[]): void {
  if (typeof msg.reasoning === "string" && msg.reasoning.trim()) {
    steps.push({ kind: "reasoning", text: msg.reasoning.trim() });
  }
  const content = msg.content;
  if (typeof content === "string" && content.trim()) {
    steps.push({ kind: "narration", text: content.trim() });
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (!isRecord(b)) continue;
      if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
        steps.push({ kind: "narration", text: b.text.trim() });
      } else if (b.type === "tool_use" && typeof b.name === "string") {
        steps.push({
          kind: "tool",
          id: typeof b.id === "string" ? b.id : "",
          name: b.name,
          input: b.input,
          result: null,
        });
      }
    }
  }
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      if (!isRecord(tc) || !isRecord(tc.function)) continue;
      steps.push({
        kind: "tool",
        id: typeof tc.id === "string" ? tc.id : "",
        name: typeof tc.function.name === "string" ? tc.function.name : "(tool)",
        input: parseArguments(tc.function.arguments),
        result: null,
      });
    }
  }
}

export function toSteps(transcript: unknown): Step[] {
  if (!Array.isArray(transcript)) return [];
  const steps: Step[] = [];
  for (const msg of transcript) {
    if (!isRecord(msg) || typeof msg.role !== "string") {
      steps.push({ kind: "raw", value: msg });
      continue;
    }
    if (msg.role === "assistant") {
      assistantSteps(msg, steps);
    } else if (msg.role === "tool") {
      const id = typeof msg.tool_call_id === "string" ? msg.tool_call_id : null;
      attachResult(steps, id, asText(msg.content));
    } else if (msg.role === "user") {
      const content = msg.content;
      if (typeof content === "string") {
        steps.push({ kind: "task", text: content });
      } else if (Array.isArray(content)) {
        for (const b of content) {
          if (isRecord(b) && b.type === "tool_result") {
            const id = typeof b.tool_use_id === "string" ? b.tool_use_id : null;
            attachResult(steps, id, asText(b.content));
          } else if (isRecord(b) && b.type === "text" && typeof b.text === "string") {
            steps.push({ kind: "task", text: b.text });
          }
        }
      }
    } else {
      steps.push({ kind: "raw", value: msg });
    }
  }
  return steps;
}

// One-line summary of a tool call's most informative argument.
export function toolSummary(input: unknown): string {
  if (!isRecord(input)) return "";
  for (const key of ["query", "url", "channel", "video_id", "to", "subject", "file_id",
                     "message", "code"]) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) {
      const flat = v.replace(/\s+/g, " ").trim();
      return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
    }
  }
  return "";
}
