import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { isRightToLeft } from "@print-cess/i18n";

import { requestLocale } from "@/lib/request-locale";

import "@print-cess/ui/styles.css";
import "./styles.css";
import "./kiosk.css";
import "./admin.css";
import "./drop.css";
import "./workstation.css";
import "./multi-print.css";

export const metadata: Metadata = {
  title: "Print-cess by Club Paradiso",
  description: "Secure self-service document printing",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  const locale = await requestLocale();

  return (
    <html lang={locale} dir={isRightToLeft(locale) ? "rtl" : "ltr"}>
      <body>{children}</body>
    </html>
  );
}
