"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: string };

const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/tasks", label: "Tasks", icon: "M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v5l3 2" },
  { href: "/skills", label: "Skills", icon: "M6 4h9a3 3 0 013 3v13H8a2 2 0 01-2-2V4zM9 8h6M9 12h6" },
  { href: "/runs", label: "Runs", icon: "M4 17l5-5-5-5M11 19h9" },
  {
    href: "/approvals",
    label: "Approvals",
    icon: "M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4zM9 12l2 2 4-4",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "M12 9a3 3 0 110 6 3 3 0 010-6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  },
];

type SidebarProps = { pendingApprovals: number; onSignOut: () => void };

export function Sidebar({ pendingApprovals, onSignOut }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-10 flex w-[220px] flex-col border-r border-line
        bg-surface px-3 py-5"
    >
      <div className="mb-7 flex items-center gap-2.5 px-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-[15px]
            font-bold text-accent-fg"
        >
          ⚡
        </span>
        <div>
          <p className="text-[15px] font-semibold leading-tight">SparkClone</p>
          <p className="text-[11px] text-muted">Personal agent</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
                transition ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={item.icon} />
              </svg>
              <span className="flex-1">{item.label}</span>
              {item.href === "/approvals" && pendingApprovals > 0 ? (
                <span
                  className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold
                    text-warn"
                >
                  {pendingApprovals}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onSignOut}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted
          transition hover:bg-surface-2 hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        Sign out
      </button>
    </aside>
  );
}
