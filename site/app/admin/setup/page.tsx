import { redirect } from "next/navigation";
import { needsOwnerSetup } from "@/lib/owner-auth";
import OwnerLogin from "@/components/owner-login";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function SetupPage() {
  if (!await needsOwnerSetup()) redirect("/admin");
  return <OwnerLogin setup />;
}
