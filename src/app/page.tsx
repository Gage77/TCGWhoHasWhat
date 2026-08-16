import { Dashboard } from "@/components/Dashboard";
import { listOwners } from "@/lib/db";

// Collections change on upload, so this page is always rendered fresh.
export const dynamic = "force-dynamic";

export default async function Home() {
  const owners = await listOwners();
  return <Dashboard owners={owners} />;
}
