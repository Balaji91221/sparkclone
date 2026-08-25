"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Styled Markdown for agent output — headings, lists, code chips, tables.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0" {...p} />,
          h2: (p) => <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0" {...p} />,
          h3: (p) => <h4 className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0" {...p} />,
          p: (p) => <p className="mb-3 last:mb-0" {...p} />,
          ul: (p) => <ul className="mb-3 list-disc space-y-1.5 pl-5 marker:text-muted" {...p} />,
          ol: (p) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 marker:text-muted" {...p} />,
          a: (p) => <a className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
          code: ({ children, className }) =>
            className ? (
              <code className={`${className} font-mono text-xs`}>{children}</code>
            ) : (
              <code
                className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]
                  text-foreground"
              >
                {children}
              </code>
            ),
          pre: (p) => (
            <pre
              className="mb-2.5 overflow-auto rounded-lg bg-surface-2 p-3 font-mono
                text-xs leading-relaxed"
              {...p}
            />
          ),
          table: (p) => (
            <div className="md-table mb-4 overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full border-collapse text-[13px]" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-surface-2/70" {...p} />,
          th: (p) => (
            <th className="whitespace-nowrap border-b border-line px-3 py-2 text-left text-xs
              font-semibold uppercase tracking-wide text-muted" {...p} />
          ),
          td: ({ children, ...p }) => {
            const text = typeof children === "string" ? children : "";
            const numeric = /^[-+₹$€£]?[\d,.]+%?$/.test(text.trim());
            return (
              <td
                className={`whitespace-nowrap border-b border-line px-3 py-2 align-top
                  tabular-nums [tr:last-child>&]:border-0 ${numeric ? "text-right" : ""}`}
                {...p}
              >
                {children}
              </td>
            );
          },
          blockquote: (p) => (
            <blockquote className="mb-2.5 border-l-2 border-accent/50 pl-3 text-muted" {...p} />
          ),
          hr: () => <hr className="my-3 border-line" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
