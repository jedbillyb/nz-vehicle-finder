/**
 * Where each kind of email goes. Cloudflare Email Routing forwards all four
 * to hello@jedbillyb.com; replies are sent through Resend's SMTP.
 */
export const CONTACT_EMAIL = {
  support: "support@vehiclefinder.co.nz",
  quotes: "quotes@vehiclefinder.co.nz",
  api: "api@vehiclefinder.co.nz",
  security: "security@vehiclefinder.co.nz",
} as const;
