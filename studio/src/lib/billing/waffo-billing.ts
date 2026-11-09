import type { ServiceEnv } from "../../env";
import { waffoCheckoutUrl, waffoClient, waffoSuccessUrl } from "../payments/waffo";
import type { PlanPriceRow } from "./plans";

export async function createWaffoSubscriptionCheckout(env: ServiceEnv, params: {
  price: PlanPriceRow;
  userId: string;
  buyerEmail: string;
  successUrl: string;
  originOrderId?: string;
}) {
  const client = waffoClient(env);
  const common = {
    productId: params.price.provider_price_id,
    currency: params.price.currency,
    buyerIdentity: params.userId,
    successUrl: waffoSuccessUrl(params.successUrl),
    metadata: {
      userId: params.userId,
      planId: params.price.plan_id,
      priceId: params.price.id,
      providerProductId: params.price.provider_price_id,
      ...(params.originOrderId ? { originOrderId: params.originOrderId } : {}),
    },
  };
  const session = params.originOrderId
    ? await client.checkout.authenticated.createPlanChange({
        ...common,
        originOrderId: params.originOrderId,
        withTrial: false,
      })
    : await client.checkout.authenticated.create({ ...common, buyerEmail: params.buyerEmail });
  if (!session.sessionId) throw new Error("waffo_checkout_missing_id");
  return { id: session.sessionId, url: waffoCheckoutUrl(session.checkoutUrl, env) };
}

export async function createWaffoPortalLink(env: ServiceEnv, userId: string): Promise<string> {
  const result = await waffoClient(env).auth.createCustomerPortalLink({
    storeId: env.WAFFO_STORE_ID!,
    buyerIdentity: userId,
  });
  return waffoCheckoutUrl(result.portalUrl, env);
}

export async function resumeWaffoSubscription(env: ServiceEnv, userId: string, orderId: string) {
  const client = waffoClient(env);
  const session = await client.auth.issueSessionToken({ storeId: env.WAFFO_STORE_ID!, buyerIdentity: userId });
  return client.customer(session.token).reactivateSubscription({ orderId });
}
