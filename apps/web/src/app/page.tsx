import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { Wordmark } from "@print-cess/ui";

import { isBrowserKioskEnabled } from "@/server/demo";

export default function HomePage() {
  if (isBrowserKioskEnabled()) redirect("/kiosk");

  return (
    <main className="status-page">
      <Wordmark />
      <section>
        <ShieldCheck aria-hidden="true" />
        <h1>Secure print transfer service</h1>
        <p>Start by scanning the QR code shown on a Print-cess Kiosk.</p>
        <p className="status-page__privacy">No account or public-computer login is required.</p>
      </section>
    </main>
  );
}
