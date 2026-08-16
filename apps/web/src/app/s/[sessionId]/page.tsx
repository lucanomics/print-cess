import { notFound } from "next/navigation";

import { SESSION_ID_PATTERN } from "@print-cess/protocol";

import { MobileFlow } from "@/components/mobile/mobile-flow";
import { requestLocale } from "@/lib/request-locale";

export default async function MobileSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!SESSION_ID_PATTERN.test(sessionId)) notFound();
  // The first paint is already in the visitor's language, so nobody watches
  // the page load in English and then change under them.
  return <MobileFlow sessionId={sessionId} initialLocale={await requestLocale()} />;
}
