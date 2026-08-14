import type { Metadata } from "next";

import { SendFlow } from "@/components/drop/send-flow";

export const metadata: Metadata = {
  title: "Send files · Print-cess by Club Paradiso",
  description: "Hand photos and files to another phone, locked end to end.",
  robots: { index: false, follow: false },
};

export default function SendPage() {
  return <SendFlow />;
}
