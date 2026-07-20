import { notFound } from "next/navigation";

import { AdminSimulator } from "@/components/admin/admin-simulator";

export default function AdminDemoPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_ROUTES !== "true")
    notFound();
  return <AdminSimulator />;
}
