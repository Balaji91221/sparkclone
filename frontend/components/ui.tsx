"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { RunStatus } from "@/lib/types";

const STATUS_STYLES: Record<RunStatus, string> = {
  queued: "bg-info-soft text-info",
  running: "bg-accent-soft text-accent",
  waiting_approval: "bg-warn-soft text-warn",
  succeeded: "bg-ok-soft text-ok",
  failed: "bg-danger-soft text-danger",
  cancelled: "bg-surface-2 text-muted",
};

export function StatusChip({ status }: { status: RunStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs
        font-medium ${STATUS_STYLES[status]}`}
    >
      {status === "running" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {status.replace("_", " ")}
    </span>
  );
}

type ModalProps = { open: boolean; title: string; onClose: () => void; children: ReactNode };

export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(560px,92vw)] rounded-xl border border-line bg-surface p-7
        text-foreground shadow-[var(--shadow-pop)] backdrop:bg-black/30"
    >
      <h3 className="mb-5 text-lg font-semibold">{title}</h3>
      {open ? children : null}
    </dialog>
  );
}

type FieldProps = { label: string; hint?: string; children: ReactNode };

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground " +
  "outline-none transition duration-150 placeholder:text-muted/70 focus:border-accent/50 focus:ring-2 focus:ring-accent/10";

type ButtonVariant = "primary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  ghost: "border border-line bg-surface text-foreground hover:bg-surface-2",
  danger: "border border-danger/25 bg-surface text-danger hover:bg-danger-soft",
};

type ButtonProps = {
  variant?: ButtonVariant;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  children: ReactNode;
};

export function Button({ variant = "ghost", onClick, type = "button", disabled, children }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition
        duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50
        ${BUTTON_STYLES[variant]}`}
    >
      {children}
    </button>
  );
}

type PageHeaderProps = { title: string; lede: string; action?: ReactNode };

export function PageHeader({ title, lede, action }: PageHeaderProps) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">{lede}</p>
      </div>
      {action}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-line bg-surface
        shadow-[var(--shadow-card)]"
    >
      {children}
    </div>
  );
}

type EmptyStateProps = { title: string; hint: string };

export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger">
      {message}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-b border-line px-5 py-4 last:border-0">
          <div className="skeleton-shimmer h-3.5 w-1/3 rounded" />
          <div className="skeleton-shimmer mt-2 h-3 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}

type StatCardProps = { label: string; value: string; hint?: string; tone?: "ok" | "warn" | "default" };

export function StatCard({ label, value, hint, tone = "default" }: StatCardProps) {
  const valueClass =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-foreground";
  return (
    <div
      className="rounded-xl border border-line bg-surface px-4 py-3.5
        shadow-[var(--shadow-card)]"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${valueClass}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
