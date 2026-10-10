import type {
  AccountStatus,
  BusinessType,
  MembershipRole,
  NotificationType,
  OrganizationStatus,
  PermissionLevel,
  PermissionResource,
  PlatformRole,
  VerificationStatus,
} from "@market-hub/shared";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  platformRole: PlatformRole;
  accountStatus: AccountStatus;
  createdAt: string;
}

export interface Organization {
  id: string;
  legalName: string;
  businessType: BusinessType;
  status: OrganizationStatus;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationWithRole extends Organization {
  membershipRole: MembershipRole;
}

export interface Member {
  id: string;
  role: MembershipRole;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface MemberPermissions {
  role: MembershipRole;
  permissions: Record<PermissionResource, PermissionLevel>;
}

export interface InviteLink {
  id: string;
  inviteeEmail: string | null;
  role: MembershipRole;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface JoinRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; name: string; email: string };
}

export interface OrganizationProfile {
  id: string;
  legalName: string;
  businessType: BusinessType;
  verificationStatus: VerificationStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  registrationNumber: string | null;
}

export type KYCStatusValue = "DRAFT" | "SUBMITTED" | "NEEDS_INFORMATION" | "VERIFIED" | "REJECTED";

export interface OnboardingStatus {
  profile: OrganizationProfile;
  profileComplete: boolean;
  missingFields: string[];
  kyc: {
    status: KYCStatusValue;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    reviewedByName: string | null;
  } | null;
}

export interface KycSubmissionSummary {
  id: string;
  status: KYCStatusValue;
  submittedAt: string | null;
  reviewedAt: string | null;
  organization: { id: string; legalName: string; businessType: BusinessType };
}

export interface KycSubmissionDetail extends KycSubmissionSummary {
  reviewNote: string | null;
  submittedBy: { id: string; name: string; email: string } | null;
  reviewedBy: { id: string; name: string } | null;
  organization: OrganizationProfile;
}

export type SupplierCapabilityValue = "MANUFACTURER" | "DISTRIBUTOR" | "WHOLESALER" | "RETAILER" | "SERVICE_PROVIDER" | "OTHER";

export interface SupplierProfile {
  capabilities: SupplierCapabilityValue[];
  categories: string[];
  countriesServed: string[];
  regionsServed: string[];
  citiesServed: string[];
  minimumOrderInfo: string | null;
  isActive: boolean;
  isDiscoverable: boolean;
  updatedAt: string;
}

export interface DirectoryListing {
  id: string;
  legalName: string;
  businessType: BusinessType;
  verificationStatus: VerificationStatus;
  country: string | null;
  state: string | null;
  city: string | null;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  supplierProfile: {
    capabilities: SupplierCapabilityValue[];
    categories: string[];
    countriesServed: string[];
    regionsServed: string[];
    citiesServed: string[];
    minimumOrderInfo: string | null;
  };
}

export interface AdminDirectoryEntry {
  id: string;
  legalName: string;
  businessType: BusinessType;
  status: OrganizationStatus;
  verificationStatus: VerificationStatus;
  country: string | null;
  city: string | null;
  supplierProfile: {
    capabilities: SupplierCapabilityValue[];
    categories: string[];
    isActive: boolean;
    isDiscoverable: boolean;
    updatedAt: string;
  } | null;
}

export type ProductStatusValue = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type ProductUnitValue =
  | "PIECE"
  | "PACK"
  | "CARTON"
  | "BOX"
  | "KILOGRAM"
  | "GRAM"
  | "LITRE"
  | "MILLILITRE"
  | "METRE"
  | "CASE"
  | "OTHER";
export type PriceTierValue = "RETAIL" | "WHOLESALE" | "BUSINESS";
export type OfferAvailabilityValue = "AVAILABLE" | "OUT_OF_STOCK" | "TEMPORARILY_UNAVAILABLE" | "DISCONTINUED";

export interface CommercialOffer {
  availability: OfferAvailabilityValue;
  maxQuantity: number | null;
  orderIncrement: number | null;
  leadTimeDays: number | null;
  leadTimeNote: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface ProductPriceEntry {
  id?: string;
  tier: PriceTierValue;
  minQuantity: number;
  unitPriceMinor: number;
  currency: string;
}

export interface OrganizationProduct {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  brand: string | null;
  unit: ProductUnitValue;
  status: ProductStatusValue;
  isDiscoverable: boolean;
  minimumOrderQuantity: number | null;
  primaryImageUrl: string | null;
  additionalImageUrls: string[];
  createdAt: string;
  updatedAt: string;
  prices: ProductPriceEntry[];
  commercialOffer: CommercialOffer | null;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  brand: string | null;
  unit: ProductUnitValue;
  minimumOrderQuantity: number | null;
  primaryImageUrl: string | null;
  additionalImageUrls: string[];
  prices: ProductPriceEntry[];
  commercialOffer: CommercialOffer | null;
  organization: {
    id: string;
    legalName: string;
    businessType: BusinessType;
    verificationStatus: VerificationStatus;
    country: string | null;
    city: string | null;
  };
}

// --- Phase 6: Cart, Checkout & Order foundation -------------------------

export interface CartItemView {
  id: string;
  productId: string;
  quantity: number;
  valid: boolean;
  invalidReason?: string;
  productName?: string;
  unit?: ProductUnitValue;
  sellerOrganizationId?: string;
  sellerOrganizationName?: string;
  unitPriceMinor?: number;
  currency?: string;
  lineTotalMinor?: number;
}

export interface CartView {
  cartId: string;
  items: CartItemView[];
  subtotalByCurrency: Record<string, number>;
  totalQuantity: number;
}

export type OrderStatusValue = "PENDING" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED";

export interface OrderItemView {
  id: string;
  productId: string;
  productName: string;
  sellerOrganizationName: string;
  unit: ProductUnitValue;
  tier: PriceTierValue;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  lineTotalMinor: number;
}

export interface OrderView {
  id: string;
  buyerUserId: string;
  buyerUser: { id: string; name: string; email: string };
  sellerOrganizationId: string;
  sellerOrganization: { id: string; legalName: string };
  status: OrderStatusValue;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  totalQuantity: number;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemView[];
  viewerRole?: "buyer" | "seller";
  viewerSellerRole?: MembershipRole | null;
}

// --- Phase 10: Payments -------------------------------------------------

export type PaymentStatusValue = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
export type PaymentProviderValue = "PAYSTACK";

export interface PaymentView {
  id: string;
  orderId: string;
  buyerUserId: string;
  provider: PaymentProviderValue;
  status: PaymentStatusValue;
  amountMinor: number;
  currency: string;
  reference: string;
  providerTransactionId: string | null;
  authorizationUrl: string | null;
  failureReason: string | null;
  initializedAt: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Phase 11: Inventory foundation --------------------------------------

export type StockMovementTypeValue = "RECEIPT" | "SALE" | "RESERVATION" | "RELEASE" | "ADJUSTMENT" | "RETURN";

export interface InventoryRow {
  id: string;
  organizationId: string;
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string; sku: string | null; unit: ProductUnitValue };
}

export interface ProductInventoryDetail {
  tracked: boolean;
  product: { id: string; name: string };
  inventory: InventoryRow | null;
}

export interface StockMovementView {
  id: string;
  type: StockMovementTypeValue;
  quantity: number;
  orderId: string | null;
  actorUserId: string | null;
  actorUser: { id: string; name: string } | null;
  reason: string | null;
  createdAt: string;
}

// --- Phase 12: Fulfillment, Delivery & Driver Tracking -------------------

export type FulfillmentStatusValue = "READY" | "PROCESSING" | "PACKED" | "DISPATCHED" | "EXCEPTION";
export type DeliveryStatusValue = "PENDING_PICKUP" | "IN_TRANSIT" | "DELIVERED" | "FAILED";
export type DeliveryEventTypeValue = "CREATED" | "DRIVER_ASSIGNED" | "PICKED_UP" | "DELIVERED" | "FAILED";

export interface FulfillmentItemView {
  id: string;
  orderItemId: string;
  productName: string;
  quantity: number;
}

export interface FulfillmentView {
  id: string;
  orderId: string;
  sellerOrganizationId: string;
  sellerOrganization: { id: string; legalName: string };
  status: FulfillmentStatusValue;
  packedAt: string | null;
  dispatchedAt: string | null;
  exceptionReason: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  items: FulfillmentItemView[];
  delivery: { id: string; status: DeliveryStatusValue } | null;
  viewerRole?: "buyer" | "seller";
}

export interface DeliveryView {
  id: string;
  fulfillmentId: string;
  orderId: string;
  sellerOrganizationId: string;
  sellerOrganization: { id: string; legalName: string };
  buyerUserId: string;
  buyerUser: { id: string; name: string };
  status: DeliveryStatusValue;
  recipientName: string;
  recipientPhone: string;
  destinationAddressLine: string;
  destinationCity: string;
  destinationState: string | null;
  destinationCountry: string;
  driverUserId: string | null;
  driverUser: { id: string; name: string; email: string } | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  viewerRole?: "buyer" | "seller" | "driver";
}

export interface DeliveryEventView {
  id: string;
  type: DeliveryEventTypeValue;
  note: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface DeliveryLocationView {
  latitude: number;
  longitude: number;
  recordedAt: string;
  stale: boolean;
}

// --- Phase 7: Procurement Engine — Requisition & RFQ foundation --------

export type RequisitionStatusValue = "DRAFT" | "SUBMITTED" | "RFQ_CREATED" | "CANCELLED";
export type RfqStatusValue = "DRAFT" | "ISSUED" | "AWARDED";
export type RfqSupplierTargetStatusValue = "INVITED" | "RESPONDED";
export type SupplierResponseStatusValue = "DRAFT" | "SUBMITTED" | "WITHDRAWN";
export type NegotiationStatusValue = "OPEN" | "ACCEPTED" | "CLOSED";
export type NegotiationEventAuthorValue = "BUYER" | "SUPPLIER";

export interface RequisitionItemView {
  id: string;
  productId: string | null;
  itemName: string;
  quantity: number;
  unit: ProductUnitValue;
  specification: string | null;
  createdAt: string;
}

export interface RequisitionView {
  id: string;
  reference: string;
  sequenceNumber: number;
  buyerOrganizationId: string;
  requestedByUserId: string;
  requestedByUser: { id: string; name: string; email: string };
  title: string;
  status: RequisitionStatusValue;
  submittedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: RequisitionItemView[];
  rfqs: { id: string; status: RfqStatusValue }[];
}

export interface RfqItemView {
  id: string;
  requisitionItemId: string | null;
  productId: string | null;
  itemName: string;
  specification: string | null;
  quantity: number;
  unit: ProductUnitValue;
  createdAt: string;
}

export interface RfqTargetView {
  id: string;
  supplierOrganizationId: string;
  supplierOrganization?: { id: string; legalName: string };
  status: RfqSupplierTargetStatusValue;
  invitedAt: string;
  respondedAt: string | null;
}

export interface SupplierResponseItemView {
  id: string;
  rfqItemId: string;
  quantity: number;
  unit: ProductUnitValue;
  unitPriceMinor: number;
  currency: string;
  leadTimeDays: number | null;
  notes: string | null;
}

export interface SupplierResponseView {
  id: string;
  rfqId?: string;
  supplierOrganizationId: string;
  supplierOrganization?: { id: string; legalName: string };
  status: SupplierResponseStatusValue;
  notes: string | null;
  submittedAt: string | null;
  withdrawnAt: string | null;
  items: SupplierResponseItemView[];
}

export interface RfqListEntry {
  id: string;
  reference: string;
  sequenceNumber: number;
  title: string;
  status: RfqStatusValue;
  responseDeadline: string | null;
  issuedAt: string | null;
  createdAt: string;
  _count: { targets: number; responses: number };
}

export interface AwardView {
  id: string;
  responseId: string;
  supplierOrganizationId: string;
  supplierOrganization: { id: string; legalName: string };
  awardedByUserId: string;
  reason: string | null;
  createdAt: string;
}

/** The shared RFQ detail shape — fields present depend on viewerRole, same
 * convention as OrderView's viewerRole-gated fields. */
export interface RfqView {
  id: string;
  reference: string;
  sequenceNumber: number;
  buyerOrganizationId: string;
  // Supplier-only — the buyer already knows their own organization.
  buyerOrganization?: { id: string; legalName: string };
  requisitionId: string;
  createdByUserId?: string;
  title: string;
  description: string | null;
  status: RfqStatusValue;
  responseDeadline: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: RfqItemView[];
  viewerRole: "buyer" | "supplier";
  viewerSupplierOrganizationId: string | null;
  // Buyer-only:
  targets?: RfqTargetView[];
  responses?: SupplierResponseView[];
  award?: AwardView | null;
  purchaseOrder?: { id: string; status: PurchaseOrderStatusValue } | null;
  // Supplier-only:
  target?: { status: RfqSupplierTargetStatusValue; invitedAt: string; respondedAt: string | null };
  response?: SupplierResponseView | null;
  youWereAwarded?: boolean | null;
  negotiation?: { id: string; status: NegotiationStatusValue } | null;
}

// --- Phase 8: Comparison, Negotiation & Award ---------------------------

export interface ComparisonResponseView extends SupplierResponseView {
  negotiation: { id: string; status: NegotiationStatusValue; updatedAt: string } | null;
}

export interface RfqComparisonView {
  id: string;
  reference: string;
  sequenceNumber: number;
  title: string;
  status: RfqStatusValue;
  items: RfqItemView[];
  responses: ComparisonResponseView[];
  award: AwardView | null;
}

export interface NegotiationEventItemView {
  id: string;
  rfqItemId: string;
  quantity: number;
  unit: ProductUnitValue;
  unitPriceMinor: number;
  currency: string;
  notes: string | null;
}

export interface NegotiationEventView {
  id: string;
  authorRole: NegotiationEventAuthorValue;
  actorUserId: string;
  message: string | null;
  createdAt: string;
  items: NegotiationEventItemView[];
}

export interface NegotiationView {
  id: string;
  rfqId: string;
  responseId: string;
  buyerOrganizationId: string;
  supplierOrganizationId: string;
  openedByUserId: string;
  status: NegotiationStatusValue;
  closedAt: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
  events: NegotiationEventView[];
  viewerRole: "buyer" | "supplier";
  rfq: {
    id: string;
    sequenceNumber: number;
    reference: string;
    title: string;
    items: { id: string; itemName: string; unit: ProductUnitValue }[];
  };
  buyerOrganization: { id: string; legalName: string };
  supplierOrganization: { id: string; legalName: string };
}

// --- Phase 9: Purchase Order & Procurement Award Execution Foundation ---

export type PurchaseOrderStatusValue = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "CONFIRMED";

export interface PurchaseOrderItemView {
  id: string;
  rfqItemId: string | null;
  productId: string | null;
  itemName: string;
  specification: string | null;
  quantity: number;
  unit: ProductUnitValue;
  unitPriceMinor: number;
  currency: string;
  lineTotalMinor: number;
  createdAt: string;
}

export interface PurchaseOrderListEntry {
  id: string;
  sequenceNumber: number;
  reference: string;
  rfqId: string;
  rfqReference: string;
  rfqTitle: string;
  status: PurchaseOrderStatusValue;
  currency: string;
  totalMinor: number;
  totalQuantity: number;
  buyerOrganizationName: string;
  supplierOrganizationName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderView {
  id: string;
  sequenceNumber: number;
  reference: string;
  awardId: string;
  rfqId: string;
  rfqReference: string;
  rfqTitle: string;
  responseId: string;
  buyerOrganizationId: string;
  buyerOrganizationName: string;
  supplierOrganizationId: string;
  supplierOrganizationName: string;
  createdByUserId: string;
  status: PurchaseOrderStatusValue;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  totalQuantity: number;
  notes: string | null;
  submittedForApprovalAt: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItemView[];
  viewerRole: "buyer" | "supplier";
}

// --- Phase 8 frontend pass, Part B: Master Admin Control Center ---------

export interface AdminStats {
  organizations: { total: number; byVerification: Record<string, number> };
  users: { total: number };
  kyc: { pendingReview: number };
  directory: { discoverable: number };
  products: { total: number };
  orders: { total: number };
  rfqs: { total: number };
  purchaseOrders: { total: number };
  payments: { total: number; byStatus: Record<string, number> };
  inventory: { total: number };
  fulfillments: { total: number; byStatus: Record<string, number> };
  deliveries: { total: number; byStatus: Record<string, number> };
  drivers: { total: number };
}

// --- Phase 13 frontend pass: Notifications --------------------------------

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: NotificationView[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
}

export interface AdminAuditLogEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
  organization: { id: string; legalName: string } | null;
}
