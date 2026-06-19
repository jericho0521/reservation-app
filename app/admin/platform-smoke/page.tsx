import { notFound } from "next/navigation";
import AdminDashboard from "../AdminDashboard";

export const dynamic = "force-dynamic";

export default function AdminPlatformSmokePage() {
  if (process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_SMOKE !== "1") {
    notFound();
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <AdminDashboard
      bookings={[]}
      todayCount={0}
      userEmail="platform-smoke-admin@example.test"
      today={today}
      loadError={null}
    />
  );
}
