// Display metadata (label, icon, chip color) per tool name. New tools get an
// entry here; unknown ones fall back to a generic wrench chip.

export type ToolLook = { label: string; icon: string; className: string };

const TOOL_LOOKS: Record<string, ToolLook> = {
  read_gmail: { label: "Gmail", icon: "mail", className: "bg-surface-2 text-muted" },
  send_gmail: { label: "Gmail · send", icon: "mail", className: "bg-surface-2 text-muted" },
  read_inbox: { label: "Inbox (IMAP)", icon: "mail", className: "bg-surface-2 text-muted" },
  send_email: { label: "Email · send", icon: "mail", className: "bg-surface-2 text-muted" },
  notify: { label: "Notify", icon: "bell", className: "bg-surface-2 text-muted" },
  web_fetch: { label: "Web", icon: "globe", className: "bg-surface-2 text-muted" },
  run_python: { label: "Python", icon: "code", className: "bg-surface-2 text-muted" },
  youtube_channel_feed: { label: "YouTube", icon: "play", className: "bg-surface-2 text-muted" },
  youtube_transcript: {
    label: "YouTube · transcript", icon: "play", className: "bg-surface-2 text-muted" },
  youtube_video_info: {
    label: "YouTube · info", icon: "play", className: "bg-surface-2 text-muted" },
  list_drive_files: { label: "Drive", icon: "folder", className: "bg-surface-2 text-muted" },
  read_drive_file: { label: "Drive · read", icon: "folder", className: "bg-surface-2 text-muted" },
  list_calendar_events: {
    label: "Calendar", icon: "calendar", className: "bg-surface-2 text-muted" },
  create_calendar_event: {
    label: "Calendar · create", icon: "calendar", className: "bg-accent-soft text-accent" },
  set_reminder: { label: "Reminder", icon: "bell", className: "bg-accent-soft text-accent" },
  create_task: { label: "Create task", icon: "calendar", className: "bg-accent-soft text-accent" },
  update_task: { label: "Update task", icon: "calendar", className: "bg-accent-soft text-accent" },
  list_tasks: { label: "List tasks", icon: "calendar", className: "bg-surface-2 text-muted" },
  delete_task: { label: "Delete task", icon: "trash", className: "bg-danger-soft text-danger" },
  run_task_now: { label: "Run task", icon: "play", className: "bg-accent-soft text-accent" },
  list_recent_runs: { label: "Recent runs", icon: "clock", className: "bg-surface-2 text-muted" },
  create_skill: { label: "Create skill", icon: "book", className: "bg-accent-soft text-accent" },
  list_skills: { label: "List skills", icon: "book", className: "bg-surface-2 text-muted" },
};

export const toolLook = (name: string): ToolLook => {
  const known = TOOL_LOOKS[name];
  if (known) return known;
  if (name.startsWith("mcp_")) {
    return {
      label: name.split("_")[1] ?? "MCP", icon: "plug",
      className: "bg-surface-2 text-muted" };
  }
  return { label: name, icon: "wrench", className: "bg-surface-2 text-muted" };
};
