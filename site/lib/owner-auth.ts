import "server-only";
import { cookies } from "next/headers";
import { database } from "./database";
import { ownerCookie, tokenHash, setupAllowed } from "./owner-auth-core";
export async function getOwnerUser() {
  const token = (await cookies()).get(ownerCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await database.prepare(`SELECT s.token_hash FROM owner_sessions s
    JOIN owner_login o ON o.id = 'main' AND s.version = o.session_version
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(tokenHash(token), Date.now()).first();
  return session ? { userId: "owner:BEST-W", displayName: "BEST-W", email: "", fullName: null } : null;
}
export async function needsOwnerSetup() { return !await database.prepare("SELECT id FROM owner_login WHERE id = 'main'").first(); }
export function validSetupToken(token: unknown) { return setupAllowed(token, process.env.OWNER_SETUP_TOKEN, process.env.OWNER_SETUP_EXPIRES); }
