export interface PublicConfig {
  appName: string;
  paymentsEnabled: boolean;
  paymentProvider: string | null;
  subscriptionsEnabled: boolean;
  unitPriceCents: number;
  googleSignInEnabled: boolean;
  emailPasswordEnabled: boolean;
  magicLinkEnabled: boolean;
  emailEnabled: boolean;
  turnstileSiteKey: string | null;
  signupsEnabled: boolean;
  maintenanceMessage: string;
}

export interface SessionUser {
  id: string;
  sessionId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  banned: boolean;
  twoFactorEnabled: boolean;
  locale: string;
}

export interface MeResponse {
  user: SessionUser | null;
}

export interface Project {
  id: string;
  url: string;
  name: string;
  description: string;
  imageUrl: string | null;
  supportCents: number;
  status: "draft" | "active";
  ownerId: string | null;
}

export interface PlanPrice {
  id: string;
  provider: string;
  providerPriceId: string;
  interval: "month" | "year";
  amountCents: number;
  currency: string;
  usageType: "licensed" | "metered";
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  seatBased: boolean;
  trialDays: number;
  features: string[];
  quotas: Record<string, number>;
  prices: PlanPrice[];
}

export interface Entitlement {
  planId: string;
  planName: string;
  status: string;
  source: "subscription" | "default" | "none";
  features: string[];
  quotas: Record<string, number>;
  seats: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionSummary {
  id: string;
  planId: string;
  priceId: string | null;
  provider: string;
  status: string;
  quantity: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}

export interface BillingState {
  entitlement: Entitlement;
  usage: { period: string; metrics: Record<string, number> };
  subscription: SubscriptionSummary | null;
}

export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  locale: string;
  twoFactorEnabled: boolean;
  createdAt: string | null;
}

export interface DeviceSession {
  id: string;
  current: boolean;
  device: string;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}
