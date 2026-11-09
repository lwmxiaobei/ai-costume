import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n/I18nProvider";
import { apiErrorMessage, interpolate } from "../i18n/utils";
import { api, ApiRequestError, jsonBody } from "../lib/api";
import type { BillingState, Plan, PublicConfig } from "../types";
import type { Route } from "../hooks/useRoute";

type Interval = "month" | "year";

export function PricingPage({
  config,
  onNavigate,
}: {
  config: PublicConfig | null;
  onNavigate: (route: Route) => void;
}) {
  const { messages, formatCurrency } = useI18n();
  const { user } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [interval, setInterval] = useState<Interval>("month");
  const [busyPriceId, setBusyPriceId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const payload = await api<{ plans: Plan[] }>("/api/billing/plans");
    setPlans(payload.plans);
    if (!user) return;
    setBilling(await api<BillingState>("/api/billing/subscription"));
  }, [user]);

  useEffect(() => {
    load().catch(() => setMessage(messages.errors.load));
  }, [load, messages.errors.load]);

  async function subscribe(plan: Plan, priceId: string) {
    if (!user) {
      onNavigate("/signin");
      return;
    }
    setBusyPriceId(priceId);
    setMessage("");
    const checkoutWindow = config?.paymentProvider === "waffo" ? window.open("about:blank", "_blank") : null;
    if (checkoutWindow) checkoutWindow.opener = null;
    try {
      const alreadySubscribed = Boolean(billing?.subscription);
      const payload = alreadySubscribed
        ? await api<{ changed: boolean } | { checkoutUrl: string }>("/api/billing/change", jsonBody({ priceId }))
        : await api<{ checkoutUrl: string }>("/api/billing/checkout", jsonBody({ priceId }));
      if ("checkoutUrl" in payload) {
        if (config?.paymentProvider === "waffo") {
          if (checkoutWindow) checkoutWindow.location.replace(payload.checkoutUrl);
          else window.open(payload.checkoutUrl, "_blank", "noopener,noreferrer");
        } else {
          window.location.assign(payload.checkoutUrl);
        }
        return;
      }
      checkoutWindow?.close();
      await load();
      setMessage(interpolate(messages.pricing.current, { plan: plan.name }));
    } catch (error) {
      checkoutWindow?.close();
      setMessage(error instanceof ApiRequestError
        ? apiErrorMessage(error.code, messages)
        : messages.errors.create);
    } finally {
      setBusyPriceId("");
    }
  }

  const currentPlanId = billing?.entitlement.planId;

  return (
    <section className="pricing-page">
      <div className="page-heading">
        <p className="section-label">{messages.pricing.section}</p>
        <h2>{messages.pricing.title}</h2>
        <p className="lede">{messages.pricing.description}</p>
        <div className="interval-toggle" role="group">
          <button
            type="button"
            className={interval === "month" ? "active" : ""}
            onClick={() => setInterval("month")}
          >
            {messages.pricing.monthly}
          </button>
          <button
            type="button"
            className={interval === "year" ? "active" : ""}
            onClick={() => setInterval("year")}
          >
            {messages.pricing.yearly}
          </button>
        </div>
      </div>

      {plans.length === 0 && <p className="empty">{messages.pricing.empty}</p>}

      <div className="plan-grid">
        {plans.map((plan) => {
          const price = plan.prices.find((entry) => entry.interval === interval)
            || plan.prices.find((entry) => entry.interval === "month");
          const isCurrent = plan.id === currentPlanId;
          return (
            <article className={"panel plan-card" + (isCurrent ? " plan-current" : "")} key={plan.id}>
              <h3>{plan.name}</h3>
              <p className="plan-price">
                {price
                  ? formatCurrency(price.amountCents, price.currency)
                  : plan.isDefault ? messages.pricing.free : "—"}
              </p>
              <p className="plan-description">{plan.description}</p>
              {plan.trialDays > 0 && (
                <p className="plan-trial">{interpolate(messages.pricing.trial, { days: plan.trialDays })}</p>
              )}
              <ul className="plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}><Check size={14} aria-hidden="true" />{feature}</li>
                ))}
              </ul>
              {isCurrent ? (
                <button type="button" className="auth-secondary" onClick={() => onNavigate("/account")}>
                  {messages.pricing.manage}
                </button>
              ) : (
                <button
                  type="button"
                  className="auth-primary"
                  disabled={!price || !config?.subscriptionsEnabled || busyPriceId === price?.id}
                  onClick={() => { if (price) void subscribe(plan, price.id); }}
                >
                  {busyPriceId === price?.id && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
                  {interpolate(messages.pricing.choose, { plan: plan.name })}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {message && <p className="message" role="status">{message}</p>}
    </section>
  );
}
