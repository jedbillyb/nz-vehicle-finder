/**
 * Where each kind of email goes. They all reach hello@jedbillyb.com for now.
 * Once Cloudflare Email Routing forwards support@, quotes@, api@ and security@
 * on vehiclefinder.co.nz, point these at those addresses.
 */
export const CONTACT_EMAIL = {
  support: "hello@jedbillyb.com",
  quotes: "hello@jedbillyb.com",
  api: "hello@jedbillyb.com",
  security: "hello@jedbillyb.com",
} as const;
