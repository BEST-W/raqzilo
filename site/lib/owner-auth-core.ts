import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export const ownerCookie = "raqzilo-owner-session";
export const sessionSeconds = 7 * 86400;
export const randomToken = () => randomBytes(32).toString("hex");
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function equalSecret(a: string, b: string) { return timingSafeEqual(Buffer.from(tokenHash(a)), Buffer.from(tokenHash(b))); }
export function passwordAllowed(password: unknown): password is string { return typeof password === "string" && password.length >= 14 && password.length <= 128; }
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await scrypt(password, salt, 64) as Buffer).toString("hex")}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const parts = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
  if (!parts || !passwordAllowed(password)) return false;
  return timingSafeEqual(await scrypt(password, parts[1], 64) as Buffer, Buffer.from(parts[2], "hex"));
}
export function setupAllowed(token: unknown, secret: string | undefined, expires: string | undefined, now = Date.now()) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) && !!secret && /^[a-f0-9]{64}$/.test(secret) && Number(expires) > now && equalSecret(token, secret);
}
export function cookiePolicy(url: string) {
  return "Path=/; HttpOnly; SameSite=Strict" + (process.env.VERCEL || new URL(url).protocol === "https:" ? "; Secure" : "");
}
