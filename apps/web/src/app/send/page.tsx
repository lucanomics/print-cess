import type { Metadata } from "next";

import { SendFlow } from "@/components/drop/send-flow";
import { requestLocale } from "@/lib/request-locale";

export const metadata: Metadata = {
  title: "Send files · Print-cess by Club Paradiso",
  description:
    "Hand photos and files to another phone. Locked on the phone, erased when the transfer expires.",
  robots: { index: false, follow: false },
};

export default async function SendPage() {
  return <SendFlow initialLocale={await requestLocale()} />;
}
