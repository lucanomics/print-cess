import { notFound } from "next/navigation";

import { SESSION_ID_PATTERN } from "@print-cess/protocol";

import { MobileFlow } from "@/components/mobile/mobile-flow";

export default async function MobileSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!SESSION_ID_PATTERN.test(sessionId)) notFound();
  return <MobileFlow sessionId={sessionId} />;
}
