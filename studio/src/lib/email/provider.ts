import type { EmailProvider, ServiceEnv } from "../../env";

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class EmailDeliveryError extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(code: string, retryable: boolean) {
    super(code);
    this.name = "EmailDeliveryError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isEmailAddress(value: string): boolean {
  return /^[^\s@<>",;]+@[^\s@<>",;.]+(\.[^\s@<>",;.]+)+$/.test(value) && value.length <= 254;
}

export function isEmailProviderConfigured(env: ServiceEnv, provider: EmailProvider): boolean {
  if (!env.EMAIL_FROM || !isEmailAddress(env.EMAIL_FROM)) return false;
  if (provider === "resend") return Boolean(env.RESEND_API_KEY);
  if (provider === "postmark") return Boolean(env.POSTMARK_SERVER_TOKEN);
  return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
}

export function activeEmailProvider(env: ServiceEnv): EmailProvider | null {
  const preferred = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (preferred === "resend" || preferred === "postmark" || preferred === "mailgun") {
    return isEmailProviderConfigured(env, preferred) ? preferred : null;
  }
  if (isEmailProviderConfigured(env, "resend")) return "resend";
  if (isEmailProviderConfigured(env, "postmark")) return "postmark";
  if (isEmailProviderConfigured(env, "mailgun")) return "mailgun";
  return null;
}

export function isEmailEnabled(env: ServiceEnv): boolean {
  return activeEmailProvider(env) !== null;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function providerMessageId(response: Response): Promise<string | null> {
  const body = await response
    .json<Record<string, unknown>>()
    .catch((): Record<string, unknown> => ({}));
  const candidate = body.id ?? body.MessageID ?? body.message ?? null;
  return typeof candidate === "string" && candidate.length > 0 ? candidate.slice(0, 200) : null;
}

export async function deliverEmail(
  env: ServiceEnv,
  provider: EmailProvider,
  message: OutboundEmail,
): Promise<string | null> {
  if (!isEmailAddress(message.to)) throw new EmailDeliveryError("invalid_recipient", false);
  const from = env.EMAIL_FROM!;
  let response: Response;

  if (provider === "resend") {
    response = await fetch((env.RESEND_API_BASE || "https://api.resend.com") + "/emails", {
      method: "POST",
      headers: {
        authorization: "Bearer " + env.RESEND_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
      }),
    });
  } else if (provider === "postmark") {
    response = await fetch((env.POSTMARK_API_BASE || "https://api.postmarkapp.com") + "/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-postmark-server-token": env.POSTMARK_SERVER_TOKEN!,
      },
      body: JSON.stringify({
        From: from,
        To: message.to,
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
        MessageStream: env.POSTMARK_MESSAGE_STREAM || "outbound",
        ...(env.EMAIL_REPLY_TO ? { ReplyTo: env.EMAIL_REPLY_TO } : {}),
      }),
    });
  } else {
    const form = new URLSearchParams({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (env.EMAIL_REPLY_TO) form.set("h:Reply-To", env.EMAIL_REPLY_TO);
    response = await fetch(
      (env.MAILGUN_API_BASE || "https://api.mailgun.net")
      + "/v3/" + encodeURIComponent(env.MAILGUN_DOMAIN!) + "/messages",
      {
        method: "POST",
        headers: {
          authorization: "Basic " + btoa("api:" + env.MAILGUN_API_KEY),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
  }

  if (!response.ok) {
    throw new EmailDeliveryError(
      provider + "_" + response.status,
      retryableStatus(response.status),
    );
  }
  return providerMessageId(response);
}
