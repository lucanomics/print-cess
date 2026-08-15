import { Download, Send, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { translate } from "@print-cess/i18n";
import { Wordmark } from "@print-cess/ui";

import { requestLocale } from "@/lib/request-locale";
import { isBrowserKioskEnabled } from "@/server/demo";

export default async function HomePage() {
  if (isBrowserKioskEnabled()) redirect("/kiosk");

  // Every other screen a phone can reach is translated. This one is the way in
  // to the hand-off, so leaving it in English asked the visitor least able to
  // read it to make the first decision.
  const locale = await requestLocale();
  const text = (key: string) => translate(locale, key);

  return (
    <main className="status-page">
      <Wordmark />
      <section>
        <ShieldCheck aria-hidden="true" />
        <h1>{text("homeTitle")}</h1>
        <p>{text("homeScanHint")}</p>
        {/* The hand-off half of the service needs no kiosk, so it is reachable
            from here as well as from a scanned code. */}
        <nav className="status-page__actions">
          <a href="/send">
            <Send aria-hidden="true" /> {text("dropSendCta")}
          </a>
          <a href="/receive">
            <Download aria-hidden="true" /> {text("dropReceiveCta")}
          </a>
        </nav>
        <p className="status-page__privacy">{text("homeNoAccount")}</p>
      </section>
    </main>
  );
}
