const STYLES: Record<string, string> = {
  ACTIVE: "bg-success/10 text-success",
  SUSPENDED: "bg-danger/10 text-danger",
  PENDING: "bg-warning/10 text-warning",
  VERIFIED: "bg-success/10 text-success",
  REJECTED: "bg-danger/10 text-danger",
  OWNER: "bg-navy/10 text-navy",
  MANAGER: "bg-info/10 text-info",
  STAFF: "bg-muted/20 text-text-secondary",
};

/**
 * Status is always communicated as text + color, never color alone
 * (UI/UX design system: "never use color alone").
 */
export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-muted/20 text-text-secondary";
  return <span className={`badge ${style}`}>{status.replace(/_/g, " ")}</span>;
}
