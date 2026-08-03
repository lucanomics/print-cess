import { notFound } from "next/navigation";

import { KioskSimulator } from "@/components/kiosk/kiosk-simulator";
import { isBrowserKioskEnabled } from "@/server/demo";

export default function BrowserKioskPage() {
  if (process.env.NODE_ENV === "production" && !isBrowserKioskEnabled()) notFound();
  return <KioskSimulator />;
}
