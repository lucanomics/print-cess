import type { Metadata } from "next";

import { ReceiveFlow } from "@/components/drop/receive-flow";

export const metadata: Metadata = {
  title: "Receive files · Print-cess by Club Paradiso",
  description: "Open a transfer with the code from the sending phone.",
  robots: { index: false, follow: false },
};

export default function ReceivePage() {
  return <ReceiveFlow />;
}
