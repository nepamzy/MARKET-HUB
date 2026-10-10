/**
 * Maps a notification's relatedEntityType to the route that actually shows
 * that entity. Only entity types with a real, always-reachable detail page
 * are listed — anything else returns null and the frontend renders the
 * notification as plain, non-clickable text rather than fabricating a link
 * to a page that doesn't exist.
 */
const ROUTE_BY_ENTITY_TYPE: Record<string, (id: string) => string> = {
  Order: (id) => `/orders/${id}`,
  Rfq: (id) => `/rfqs/${id}`,
  Negotiation: (id) => `/negotiations/${id}`,
  PurchaseOrder: (id) => `/purchase-orders/${id}`,
  Fulfillment: (id) => `/fulfillments/${id}`,
  Delivery: (id) => `/deliveries/${id}`,
  Organization: (id) => `/organizations/${id}`,
};

export function resolveNotificationHref(relatedEntityType: string | null, relatedEntityId: string | null): string | null {
  if (!relatedEntityType || !relatedEntityId) return null;
  const toHref = ROUTE_BY_ENTITY_TYPE[relatedEntityType];
  return toHref ? toHref(relatedEntityId) : null;
}
