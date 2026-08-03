import { notFound } from "next/navigation";

import { KioskSimulator } from "@/components/kiosk/kiosk-simulator";
import { isBrowserKioskEnabled } from "@/server/demo";

export default async function BrowserKioskPage({
  searchParams,
}: {
  searchParams: Promise<{ printing?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production" && !isBrowserKioskEnabled()) notFound();
  const printing = (await searchParams).printing;
  return <KioskSimulator automaticPrinting={printing === "auto"} />;
}
