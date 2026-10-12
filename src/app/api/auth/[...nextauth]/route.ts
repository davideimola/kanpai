import { handlers } from "@/lib/auth";

// Auth.js's own endpoints: the redirect to Google, the callback, the session and the
// CSRF token. Outside both route groups and excluded from the proxy's matcher — a
// gated sign-in endpoint is a gate that can never be opened.
export const { GET, POST } = handlers;
