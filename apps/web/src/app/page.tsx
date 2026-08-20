import { Building2, Download, Monitor, Send, ShieldCheck } from "lucide-react";

import { translate } from "@print-cess/i18n";
import { Wordmark } from "@print-cess/ui";

import { requestLocale } from "@/lib/request-locale";
import { isBrowserKioskEnabled } from "@/server/demo";

const kioskCta = {
  en: "Open kiosk",
  ko: "키오스크 열기",
  "zh-CN": "打开自助终端",
  id: "Buka kios",
  fil: "Buksan ang kiosk",
  vi: "Mở kiosk",
  th: "เปิดคีออสก์",
  ne: "किओस्क खोल्नुहोस्",
  km: "បើកគីអូស",
  ar: "فتح الكشك",
  ru: "Открыть киоск",
  mn: "Киоск нээх",
  uk: "Відкрити кіоск",
} as const;

const workstationCta = {
  en: "Work computer",
  ko: "업무용 PC",
  "zh-CN": "办公电脑",
  id: "Komputer kerja",
  fil: "Computer sa trabaho",
  vi: "Máy tính cơ quan",
  th: "คอมพิวเตอร์ที่ทำงาน",
  ne: "कार्य कम्प्युटर",
  km: "កុំព្យូទ័រការងារ",
  ar: "كمبيوتر العمل",
  ru: "Рабочий компьютер",
  mn: "Ажлын компьютер",
  uk: "Робочий комп’ютер",
} as const;

export default async function HomePage() {
  // The public root is the service entry point, not a dedicated kiosk URL.
  // Browser-kiosk stations open /kiosk directly; keeping / available is what
  // makes the independent phone-to-phone hand-off discoverable in Production.
  const locale = await requestLocale();
  const text = (key: string) => translate(locale, key);
  // In Production the browser-kiosk route deliberately fails closed unless it
  // is enabled. Do not advertise a shortcut to a route that will return 404.
  const kioskAvailable = process.env.NODE_ENV !== "production" || isBrowserKioskEnabled();

  return (
    <main className="status-page">
      <Wordmark />
      <section>
        <ShieldCheck aria-hidden="true" />
        <h1>{text("homeTitle")}</h1>
        <p>{text("dropIntro")}</p>
        <nav className="status-page__actions" aria-label={text("dropTitle")}>
          <a href="/send">
            <Send aria-hidden="true" /> {text("dropSendCta")}
          </a>
          <a href="/receive">
            <Download aria-hidden="true" /> {text("dropReceiveCta")}
          </a>
          <a href="/workstation">
            <Building2 aria-hidden="true" /> {workstationCta[locale]}
          </a>
          {kioskAvailable ? (
            <a href="/kiosk">
              <Monitor aria-hidden="true" /> {kioskCta[locale]}
            </a>
          ) : null}
        </nav>
        <p className="status-page__privacy">
          {text("homeScanHint")} {text("homeNoAccount")}
        </p>
      </section>
    </main>
  );
}
