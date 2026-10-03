/**
 * One email check for the site and the server. Deliberately practical rather
 * than full RFC 5322: a local part, an @, then dot-separated domain labels
 * ending in a letters-only top-level domain of 2+ characters.
 */
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  if (email.length > 254) return false;
  const local = email.split("@")[0];
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  return EMAIL_RE.test(email);
}
