import { SeatMaintenanceManager } from "@/components/admin/SeatMaintenanceManager";
import { requireAdminEmail } from "../content-pages";

export default async function SeatMaintenancePage() {
  const userEmail = await requireAdminEmail();

  return <SeatMaintenanceManager userEmail={userEmail} />;
}
