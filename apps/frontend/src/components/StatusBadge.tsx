const STYLES: Record<string, string> = {
  ACTIVE: "bg-success/10 text-success",
  SUSPENDED: "bg-danger/10 text-danger",
  PENDING: "bg-warning/10 text-warning",
  VERIFIED: "bg-success/10 text-success",
  REJECTED: "bg-danger/10 text-danger",
  SUBMITTED: "bg-info/10 text-info",
  NEEDS_INFORMATION: "bg-warning/10 text-warning",
  NOT_STARTED: "bg-muted/20 text-text-secondary",
  AVAILABLE: "bg-success/10 text-success",
  OUT_OF_STOCK: "bg-warning/10 text-warning",
  TEMPORARILY_UNAVAILABLE: "bg-warning/10 text-warning",
  DISCONTINUED: "bg-danger/10 text-danger",
  DRAFT: "bg-muted/20 text-text-secondary",
  INACTIVE: "bg-muted/20 text-text-secondary",
  ARCHIVED: "bg-muted/20 text-text-secondary",
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
