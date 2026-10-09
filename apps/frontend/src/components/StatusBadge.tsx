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
  CONFIRMED: "bg-info/10 text-info",
  PROCESSING: "bg-info/10 text-info",
  COMPLETED: "bg-success/10 text-success",
  CANCELLED: "bg-danger/10 text-danger",
  RFQ_CREATED: "bg-info/10 text-info",
  ISSUED: "bg-info/10 text-info",
  INVITED: "bg-muted/20 text-text-secondary",
  RESPONDED: "bg-success/10 text-success",
  WITHDRAWN: "bg-danger/10 text-danger",
  AWARDED: "bg-success/10 text-success",
  OPEN: "bg-info/10 text-info",
  ACCEPTED: "bg-success/10 text-success",
  CLOSED: "bg-muted/20 text-text-secondary",
  PENDING_APPROVAL: "bg-warning/10 text-warning",
  APPROVED: "bg-success/10 text-success",
  SUCCESS: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
  READY: "bg-muted/20 text-text-secondary",
  PACKED: "bg-info/10 text-info",
  DISPATCHED: "bg-info/10 text-info",
  EXCEPTION: "bg-danger/10 text-danger",
  PENDING_PICKUP: "bg-warning/10 text-warning",
  IN_TRANSIT: "bg-info/10 text-info",
  DELIVERED: "bg-success/10 text-success",
  CREATED: "bg-muted/20 text-text-secondary",
  DRIVER_ASSIGNED: "bg-info/10 text-info",
  PICKED_UP: "bg-info/10 text-info",
};

/**
 * Status is always communicated as text + color, never color alone
 * (UI/UX design system: "never use color alone").
 */
export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-muted/20 text-text-secondary";
  return <span className={`badge ${style}`}>{status.replace(/_/g, " ")}</span>;
}
