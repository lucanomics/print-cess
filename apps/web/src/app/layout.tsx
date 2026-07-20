import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import "@print-cess/ui/styles.css";
import "./styles.css";
import "./kiosk.css";
import "./admin.css";

export const metadata: Metadata = {
  title: "Print-cess by Paradiso",
  description: "Secure self-service document printing",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // A request must exist so Next.js can apply the request-scoped CSP nonce to framework assets.
  await connection();

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
