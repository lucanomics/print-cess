import { notFound } from "next/navigation";

import { KioskSimulator } from "@/components/kiosk/kiosk-simulator";

export default function KioskDemoPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_ROUTES !== "true")
    notFound();
  return <KioskSimulator />;
}
