import { Dashboard } from "@/components/Dashboard";
import { groupPassword } from "@/lib/auth";
import { listOwners, wantCounts } from "@/lib/db";

// Collections and want lists change on upload, so this page is always fresh.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [owners, counts] = await Promise.all([listOwners(), wantCounts()]);
  return (
    <Dashboard
      owners={owners}
      wantCounts={Object.fromEntries(counts)}
      // No sign-out button when there was nothing to sign in to.
      gated={groupPassword() !== null}
    />
  );
}
