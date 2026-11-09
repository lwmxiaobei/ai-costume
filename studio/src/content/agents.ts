// Plain-text content served to AI assistants and crawlers as /llms.txt and Markdown pages.
// English only, like the legal pages: rewrite it for your product before launch.
// {appName} is replaced with APP_NAME when the files are generated.

export const AGENT_FILES = [
  "/llms.txt",
  "/llms-full.txt",
  "/index.md",
  "/product.md",
  "/faq.md",
  "/pricing.md",
] as const;

export interface FaqEntry {
  question: string;
  answer: string;
}

export const PRODUCT = {
  audience: [
    "Solo founders and small teams launching a paid web product.",
    "Developers who want accounts, billing and admin tooling working before they write domain logic.",
  ],
  howItWorks: [
    "Sign up with email and password, a magic link or Google.",
    "Pick a plan on the pricing page and pay through a hosted checkout.",
    "Manage the subscription, active sessions, two-factor authentication and data export from the account page.",
  ],
  stack: "React front end, Hono API on Cloudflare Workers, Cloudflare D1 database.",
};

export const FAQ: FaqEntry[] = [
  {
    question: "What is {appName}?",
    answer: "A foundation for SaaS products on Cloudflare Workers with accounts, subscriptions, transactional email and an admin console already in place.",
  },
  {
    question: "How does billing work?",
    answer: "Plans are billed monthly or yearly through a hosted checkout. Current plans, prices and trial lengths are listed in pricing.md.",
  },
  {
    question: "Can I cancel at any time?",
    answer: "Yes. Cancel from the account page. The plan stays active until the end of the period you already paid for.",
  },
  {
    question: "Where is my data stored and can I take it with me?",
    answer: "Data lives in a Cloudflare D1 database. The account page exports everything tied to your account and can delete the account.",
  },
  {
    question: "Is two-factor authentication available?",
    answer: "Yes. Any account can turn on authenticator-app codes with one-time backup codes.",
  },
  {
    question: "Do you use tracking cookies?",
    answer: "No. Only the cookies needed for sign-in and security are set.",
  },
];

export type AssistantId = "chatgpt" | "claude" | "perplexity" | "gemini" | "grok";

export interface Assistant {
  id: AssistantId;
  name: string;
  askUrl: (prompt: string) => string;
}

// None of these query parameters are documented APIs. Gemini has no prefill parameter,
// so its button opens Google AI Mode, which answers with Gemini.
export const ASSISTANTS: Assistant[] = [
  { id: "chatgpt", name: "ChatGPT", askUrl: (prompt) => "https://chatgpt.com/?q=" + encodeURIComponent(prompt) },
  { id: "claude", name: "Claude", askUrl: (prompt) => "https://claude.ai/new?q=" + encodeURIComponent(prompt) },
  {
    id: "perplexity",
    name: "Perplexity",
    askUrl: (prompt) => "https://www.perplexity.ai/search?q=" + encodeURIComponent(prompt),
  },
  {
    id: "gemini",
    name: "Gemini",
    askUrl: (prompt) => "https://www.google.com/search?udm=50&q=" + encodeURIComponent(prompt),
  },
  { id: "grok", name: "Grok", askUrl: (prompt) => "https://grok.com/?q=" + encodeURIComponent(prompt) },
];
