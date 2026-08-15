import { notFound } from "next/navigation";

import { KioskSimulator } from "@/components/kiosk/kiosk-simulator";
import { isBrowserKioskEnabled } from "@/server/demo";

export default async function BrowserKioskPage({
  searchParams,
}: {
  searchParams: Promise<{ printing?: string | string[]; sound?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production" && !isBrowserKioskEnabled()) notFound();
  const { printing, sound } = await searchParams;
  // `?sound=off` for a counter where a completion tone would carry further than
  // it helps. The screen says the same thing either way.
  return <KioskSimulator automaticPrinting={printing === "auto"} sound={sound !== "off"} />;
}
