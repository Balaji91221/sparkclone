"use client";

// Renders the agent's message history. Block shapes come from the LLM provider,
// so everything is narrowed from unknown and falls back to raw JSON.

type Turn = { role: string; blocks: Block[] };

type Block =
  | { kind: "text"; text: string }
  | { kind: "tool_use"; name: string; input: unknown }
  | { kind: "tool_result"; content: string }
  | { kind: "raw"; value: unknown };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toBlock(v: unknown): Block {
  if (typeof v === "string") return { kind: "text", text: v };
  if (!isRecord(v)) return { kind: "raw", value: v };
  if (v.type === "text" && typeof v.text === "string") return { kind: "text", text: v.text };
  if (v.type === "tool_use" && typeof v.name === "string") {
    return { kind: "tool_use", name: v.name, input: v.input };
  }
  if (v.type === "tool_result") {
    const c = v.content;
    if (typeof c === "string") return { kind: "tool_result", content: c };
    return { kind: "tool_result", content: JSON.stringify(c, null, 2) };
  }
  return { kind: "raw", value: v };
}

// OpenAI-style assistant tool calls: {id, function: {name, arguments: "<json>"}}
function openAiToolCallBlocks(v: unknown): Block[] {
  if (!Array.isArray(v)) return [];
  const blocks: Block[] = [];
  for (const tc of v) {
    if (!isRecord(tc) || !isRecord(tc.function)) continue;
    const name = typeof tc.function.name === "string" ? tc.function.name : "(tool)";
    let input: unknown = tc.function.arguments;
    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        // keep the raw string when arguments are not valid JSON
      }
    }
    blocks.push({ kind: "tool_use", name, input });
  }
  return blocks;
}

function toTurns(transcript: unknown): Turn[] | null {
  if (!Array.isArray(transcript) || transcript.length === 0) return null;
  const turns: Turn[] = [];
  for (const msg of transcript) {
    if (!isRecord(msg) || typeof msg.role !== "string") return null;
    const content = msg.content;
    let blocks: Block[];
    if (msg.role === "tool") {
      // OpenAI-style tool result message
      blocks = [{
        kind: "tool_result",
        content: typeof content === "string" ? content : JSON.stringify(content, null, 2),
      }];
    } else if (Array.isArray(content)) {
      blocks = content.map(toBlock);
    } else if (content == null) {
      blocks = [];
    } else {
      blocks = [toBlock(content)];
    }
    blocks.push(...openAiToolCallBlocks(msg.tool_calls));
    if (blocks.length === 0) continue;
    turns.push({ role: msg.role === "tool" ? "tool result" : msg.role, blocks });
  }
  return turns;
}

const pre =
  "mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 " +
  "font-mono text-xs leading-relaxed text-muted";

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return <p className="whitespace-pre-wrap text-sm leading-relaxed">{block.text}</p>;
    case "tool_use":
      return (
        <div>
          <span
            className="inline-block rounded-full bg-accent-soft px-2.5 py-0.5 font-mono
              text-xs font-medium text-accent"
          >
            → {block.name}
          </span>
          <pre className={pre}>{JSON.stringify(block.input, null, 2)}</pre>
        </div>
      );
    case "tool_result":
      return <pre className={pre}>{block.content}</pre>;
    case "raw":
      return <pre className={pre}>{JSON.stringify(block.value, null, 2)}</pre>;
    default: {
      const _exhaustive: never = block;
      throw new Error(`unhandled block: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function Transcript({ transcript }: { transcript: unknown }) {
  const turns = toTurns(transcript);

  if (!turns) {
    return (
      <pre className={pre}>
        {transcript == null ? "(empty)" : JSON.stringify(transcript, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-4">
      {turns.map((turn, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {turn.role}
          </p>
          <div className="space-y-3">
            {turn.blocks.map((b, j) => (
              <BlockView key={j} block={b} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
