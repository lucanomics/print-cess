import { notFound } from "next/navigation";

import { KioskSimulator } from "@/components/kiosk/kiosk-simulator";
import { isHostedDemoEnabled } from "@/server/demo-runtime";

export default function KioskDemoPage() {
  if (process.env.NODE_ENV === "production" && !isHostedDemoEnabled()) notFound();
  return <KioskSimulator />;
}
