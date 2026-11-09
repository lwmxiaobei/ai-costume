import type { Env, PaymentProvider } from "../../env";
import { isCreemCheckoutUrl } from "./creem";
import { isPolarCheckoutUrl, polarCheckoutRequest } from "./polar";
import { isStripeCheckoutUrl, stripeCheckoutRequest } from "./stripe";
import { createWaffoCheckout } from "./waffo";

interface CheckoutParams {
  env: Env;
  provider: PaymentProvider;
  productId: string;
  pendingId: string;
  projectId: string;
  quantity: number;
  unitAmountCents: number;
  successUrl: string;
  cancelUrl: string;
  customerIpAddress?: string;
  userId?: string;
  buyerEmail?: string;
}

export async function createHostedCheckout(params: CheckoutParams): Promise<{ id: string; url: string }> {
  if (params.provider === "waffo") {
    if (!params.userId || !params.buyerEmail) throw new Error("waffo_customer_required");
    return createWaffoCheckout({ ...params, userId: params.userId, buyerEmail: params.buyerEmail });
  }
  let response: Response;
  if (params.provider === "stripe") {
    response = await fetch((params.env.STRIPE_API_BASE || "https://api.stripe.com") + "/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: "Bearer " + params.env.STRIPE_SECRET_KEY,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": params.pendingId,
      },
      body: stripeCheckoutRequest(params).toString(),
    });
  } else if (params.provider === "polar") {
    response = await fetch((params.env.POLAR_API_BASE || "https://api.polar.sh") + "/v1/checkouts/", {
      method: "POST",
      headers: {
        authorization: "Bearer " + params.env.POLAR_ACCESS_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify(polarCheckoutRequest(
        params.productId,
        params.quantity * params.unitAmountCents,
        params.pendingId,
        params.projectId,
        params.successUrl,
        params.cancelUrl,
        params.customerIpAddress,
      )),
    });
  } else {
    const apiBase = params.env.CREEM_API_KEY?.startsWith("creem_test_")
      ? "https://test-api.creem.io"
      : params.env.CREEM_API_BASE || "https://api.creem.io";
    response = await fetch(apiBase + "/v1/checkouts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": params.env.CREEM_API_KEY!,
      },
      body: JSON.stringify({
        product_id: params.productId,
        request_id: params.pendingId,
        units: params.quantity,
        success_url: params.successUrl,
        metadata: { pendingCheckoutId: params.pendingId, projectId: params.projectId },
      }),
    });
  }

  const body: Record<string, unknown> = await response
    .json<Record<string, unknown>>()
    .catch((): Record<string, unknown> => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const url = params.provider === "creem"
    ? typeof body.checkout_url === "string" ? body.checkout_url : ""
    : typeof body.url === "string" ? body.url : "";
  const validUrl = params.provider === "stripe"
    ? isStripeCheckoutUrl(url)
    : params.provider === "polar"
      ? isPolarCheckoutUrl(url)
      : isCreemCheckoutUrl(url);
  if (!response.ok || !id || !validUrl) throw new Error("provider_checkout_failed_" + response.status);
  return { id, url };
}
