import { Download, Send, ShieldCheck } from "lucide-react";
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
        <h1>Secure print and transfer service</h1>
        <p>Start by scanning the QR code shown on a Print-cess Kiosk.</p>
        {/* The hand-off half of the service needs no kiosk, so it is reachable
            from here as well as from a scanned code. */}
        <nav className="status-page__actions">
          <a href="/send">
            <Send aria-hidden="true" /> Send files
          </a>
          <a href="/receive">
            <Download aria-hidden="true" /> Receive files
          </a>
        </nav>
        <p className="status-page__privacy">No account or public-computer login is required.</p>
      </section>
    </main>
  );
}
