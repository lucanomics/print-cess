import { notFound } from "next/navigation";

import { KioskSimulator } from "@/components/kiosk/kiosk-simulator";
import { isDemoRouteEnabled } from "@/server/demo";

export default function KioskDemoPage() {
  if (process.env.NODE_ENV === "production" && !isDemoRouteEnabled()) notFound();
  return <KioskSimulator />;
}
