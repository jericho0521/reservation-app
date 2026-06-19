import { notFound } from "next/navigation";
import { SeatMaintenanceManager } from "@/components/admin/SeatMaintenanceManager";

export const dynamic = "force-dynamic";

export default function AdminMaintenancePlatformSmokePage() {
  if (process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_SMOKE !== "1") {
    notFound();
  }

  return <SeatMaintenanceManager userEmail="platform-smoke-admin@example.test" />;
}
