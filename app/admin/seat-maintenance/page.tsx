import type { Metadata } from "next";
import { SeatMaintenanceManager } from "@/components/admin/SeatMaintenanceManager";
import { requireAdminEmail } from "../content-pages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seat maintenance · Admin" };

export default async function SeatMaintenancePage() {
  const userEmail = await requireAdminEmail();

  return <SeatMaintenanceManager userEmail={userEmail} />;
}
