import { ownerStatus, readSettings } from "@/lib/settings-server";
import AdminPanel from "@/components/admin-panel";
import OwnerLogin, { OwnerLogout } from "@/components/owner-login";
export const dynamic = "force-dynamic";
export const metadata = {robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function AdminPage() {
  const { user, allowed } = await ownerStatus();
  if (!allowed || !user) return <OwnerLogin />;
  const data = await readSettings();
  return <><OwnerLogout /><AdminPanel initial={data.settings} initialRevision={data.revision} ownerName={user.displayName} /></>;
}
