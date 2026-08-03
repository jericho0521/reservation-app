import { SeatMaintenanceManager } from "@/components/admin/SeatMaintenanceManager";
import { requireAdminEmail } from "../content-pages";

export const dynamic = "force-dynamic";

export default async function SeatMaintenancePage() {
  const userEmail = await requireAdminEmail();

  return <SeatMaintenanceManager userEmail={userEmail} />;
}
