import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { ownerStatus, readSettings } from "@/lib/settings-server";
import AdminPanel from "@/components/admin-panel";
import AdminAccess from "@/components/admin-access";
export const dynamic = "force-dynamic";
export const metadata = {robots:{index:false,follow:false}};
export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user) return <AdminAccess reason="signin" signInHref={chatGPTSignInPath("/admin")} />;
  const { allowed } = await ownerStatus();
  if (!allowed) return <AdminAccess reason="denied" signOutHref={chatGPTSignOutPath("/admin")} />;
  const data = await readSettings();
  return <AdminPanel initial={data.settings} initialRevision={data.revision} ownerName={user.displayName} />;
}
