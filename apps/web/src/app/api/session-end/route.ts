import { NextResponse } from "next/server";

import { assertAllowedOrigin, errorResponse } from "@/server/http";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";

// `executionContexts` is deliberately absent. It would reload the phone's
// browsing context, which lands the visitor back on a finished session and
// replaces the confirmation that printing is done with an error.
const CLEAR_SITE_DATA = '"cache", "cookies", "storage"';

/**
 * Asks the caller's own browser to drop everything it holds for this origin.
 *
 * The request carries no body, no identifier and no credential, and the
 * response carries no data: the only effect is on the browser that called it.
 * It is therefore safe to serve without a session token, which matters because
 * the phone calls it after the session has already been cleaned up.
 */
export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request, getRuntime().config);
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Clear-Site-Data": CLEAR_SITE_DATA,
        "Cache-Control": "no-store, max-age=0",
        Vary: "Origin",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
