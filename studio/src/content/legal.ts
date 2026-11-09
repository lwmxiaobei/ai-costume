import type { LegalRoute } from "../routes";

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_UPDATED = "2026-01-01";

export const LEGAL_DOCUMENTS: Record<LegalRoute, LegalDocument> = {
  "/terms": {
    title: "Terms of Service",
    updated: LEGAL_UPDATED,
    intro: "These terms govern your use of the service. Replace this document with terms drafted for your company, your product and the jurisdictions you sell into.",
    sections: [
      {
        heading: "1. Who we are",
        body: [
          "State your legal entity name, registered address and contact address for legal notices.",
          "Name the jurisdiction whose law governs this agreement and where disputes are heard.",
        ],
      },
      {
        heading: "2. Accounts",
        body: [
          "Describe eligibility, the minimum age, and that account holders are responsible for keeping credentials safe.",
          "Describe when you may suspend or close an account, and what notice you give before doing so.",
        ],
      },
      {
        heading: "3. Acceptable use",
        body: [
          "List the behaviour you prohibit: unlawful content, infringement, abuse of other users, attempts to break the service, scraping and resale.",
          "Describe how you enforce this and what happens to content you remove.",
        ],
      },
      {
        heading: "4. Plans, payment and taxes",
        body: [
          "State which plans exist, how billing periods work, when charges are taken, and which taxes are added.",
          "State what happens on non-payment and how prices may change.",
        ],
      },
      {
        heading: "5. Cancellation",
        body: [
          "State how a customer cancels, when access ends, and what happens to their data afterwards.",
          "Cross-reference your refund policy rather than restating it here.",
        ],
      },
      {
        heading: "6. Availability and support",
        body: [
          "State the availability you commit to, if any, and the support channels and response targets you offer.",
          "If you offer no uptime guarantee, say so plainly.",
        ],
      },
      {
        heading: "7. Intellectual property",
        body: [
          "State that you retain rights in the service and that customers retain rights in their own content.",
          "Describe the licence customers grant you to host and process their content.",
        ],
      },
      {
        heading: "8. Liability",
        body: [
          "State the warranty position and the limits of liability, keeping within what your jurisdiction allows.",
          "Consumer protection law may override parts of this section. Have a lawyer check it.",
        ],
      },
      {
        heading: "9. Changes to these terms",
        body: [
          "State how you notify customers of changes and when changes take effect.",
        ],
      },
    ],
  },
  "/privacy": {
    title: "Privacy Policy",
    updated: LEGAL_UPDATED,
    intro: "This policy explains what personal data the service processes. Replace it with a policy that matches what your deployment actually collects.",
    sections: [
      {
        heading: "1. Controller and contact",
        body: [
          "Name the data controller, its address, and a contact address for privacy requests.",
          "If you are required to have a data protection officer or an EU or UK representative, name them.",
        ],
      },
      {
        heading: "2. What the template collects by default",
        body: [
          "Account data: name, email address, whether the email is verified, chosen interface language, and role.",
          "Session data: session identifiers, IP address and user agent, used to list and revoke signed-in devices.",
          "Billing data: the payment provider's customer and subscription identifiers, plan, status and billing period. Card details never reach this service.",
          "Operational data: audit log entries for sensitive actions, delivery records for transactional email, rate limiting counters and webhook payloads kept for replay.",
        ],
      },
      {
        heading: "3. Why we process it",
        body: [
          "Provide the service and keep accounts secure. State your lawful basis for each purpose if you are subject to the GDPR.",
          "Bill customers and meet accounting obligations.",
          "Prevent abuse, investigate incidents and keep an audit trail.",
        ],
      },
      {
        heading: "4. Processors we use",
        body: [
          "List your infrastructure provider, payment provider and email provider by name, with the regions where they process data.",
          "Link to each processor's own privacy documentation.",
        ],
      },
      {
        heading: "5. Retention",
        body: [
          "State how long you keep each category. The template deletes expired sessions and verification tokens on a daily schedule.",
          "State what deleting an account removes and what you must keep for legal or accounting reasons.",
        ],
      },
      {
        heading: "6. Your rights",
        body: [
          "Describe the rights available in your jurisdiction and how to exercise them.",
          "The account area already offers self-service data export and account deletion.",
        ],
      },
      {
        heading: "7. International transfers and security",
        body: [
          "State where data is processed and the safeguards used for transfers.",
          "Describe your security measures at a level you can actually stand behind.",
        ],
      },
    ],
  },
  "/refund": {
    title: "Refund Policy",
    updated: LEGAL_UPDATED,
    intro: "This policy explains when a payment can be refunded. Replace it with terms that match your product and your statutory obligations.",
    sections: [
      {
        heading: "1. Scope",
        body: [
          "State which purchases the policy covers: subscriptions, one-off payments, or both.",
          "State the currency and who bears any transfer fees.",
        ],
      },
      {
        heading: "2. Statutory withdrawal rights",
        body: [
          "Consumers in some jurisdictions have a statutory cooling-off period that you cannot contract out of. Describe how it applies and how it interacts with immediate access to digital services.",
        ],
      },
      {
        heading: "3. Subscriptions",
        body: [
          "State whether cancellation takes effect at the end of the billing period or immediately, and whether you pro-rate.",
          "State how trials convert and what a customer is charged when a trial ends.",
        ],
      },
      {
        heading: "4. How to request a refund",
        body: [
          "Give the contact address, the information you need, and the time you take to respond.",
          "State how the refund is returned and how long it takes to appear.",
        ],
      },
      {
        heading: "5. Chargebacks",
        body: [
          "Ask customers to contact you before opening a dispute, and describe what happens to the account during a dispute.",
        ],
      },
    ],
  },
  "/cookies": {
    title: "Cookie Notice",
    updated: LEGAL_UPDATED,
    intro: "This notice explains the cookies the service sets. Update it whenever you add analytics, advertising or any other non-essential storage.",
    sections: [
      {
        heading: "1. Cookies this template sets",
        body: [
          "Session cookies issued by the authentication layer. They keep you signed in and are required for the service to work.",
          "A short-lived cookie during two-factor sign-in, used only to complete the verification step.",
          "If Turnstile is enabled, the challenge sets its own cookies to tell people from bots.",
        ],
      },
      {
        heading: "2. Local storage",
        body: [
          "The chosen interface language and colour theme are stored in your browser. They never leave your device and are not used to identify you.",
        ],
      },
      {
        heading: "3. Consent",
        body: [
          "The template ships with no analytics, advertising or tracking cookies, so it does not display a consent banner. Strictly necessary cookies do not require consent in most jurisdictions.",
          "If you add analytics or any other non-essential storage, you must add a consent mechanism and update this notice before enabling it.",
        ],
      },
      {
        heading: "4. Controlling cookies",
        body: [
          "Explain that browser settings can block cookies, and that blocking the session cookie will prevent signing in.",
        ],
      },
    ],
  },
};
