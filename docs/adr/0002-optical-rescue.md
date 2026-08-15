# ADR 0002 — Optical Rescue: do not build

- **Status:** Accepted — research complete, recommendation is not to build
- **Date:** 2026-08-15

## Context

"Optical Rescue" is the idea of moving a document from a phone to the kiosk with
no network at all: the phone displays a stream of animated QR codes and the
kiosk's camera reads them back. It is attractive because it removes the service
from the middle of the transfer entirely, and because it would keep the kiosk
useful during a network outage — the one failure mode a visitor standing in
front of it cannot work around.

It was worth costing properly rather than dismissing, so this is the costing.

## The arithmetic

A QR code at version 40 with the lowest error correction holds about 2,953
bytes. Binary data has to survive being displayed and photographed, so in
practice a frame carries less: after framing, sequence numbers, and the error
correction a moving camera actually needs, roughly 1.2–1.8 KB per frame is
realistic.

A camera reading a phone screen across a counter, with the phone held by a
person rather than a clamp, decodes reliably at perhaps 5–10 frames per second.
Fifteen is achievable in a lab and not across a counter under a shop's lighting.

That is **6–18 KB per second**, before any retransmission.

| Document               | Size   | Best case | Realistic |
| ---------------------- | ------ | --------- | --------- |
| One-page text PDF      | 40 KB  | ~3 s      | ~7 s      |
| Typical form, PDF      | 300 KB | ~17 s     | ~50 s     |
| One phone photograph   | 3 MB   | ~3 min    | ~8 min    |
| Scanned multi-page PDF | 8 MB   | ~8 min    | ~22 min   |

The useful ceiling is a few hundred kilobytes. Above that a person is holding a
phone steady in front of a camera for minutes, and any wobble costs a
retransmission round.

The documents this service exists for — Hancom forms, scanned certificates,
phone photographs of paperwork — are almost all above that ceiling.

## What it would also cost

**Hardware.** The Windows kiosk has no camera requirement today, and the browser
kiosk runs on displays that frequently have none. Optical Rescue makes a camera
a deployment prerequisite for a feature that helps in a minority of situations.

**A camera pointed at the room.** A kiosk with a live camera in a public space
is a different privacy proposition from a kiosk with a screen, regardless of
what the software does with the frames. It needs its own notice, its own
retention answer, and its own conversation with whoever runs the venue.
`PRIVACY.md` currently promises a service with no camera on the kiosk side, and
that promise is worth more than this feature.

**Shoulder surfing.** The document is on a phone screen, held up, in a public
place, for however long the transfer takes. Even as QR frames it is a visible
signal that can be recorded by anyone else's phone and decoded later. The
current design puts ciphertext on a server and nothing on a screen; this would
invert that, and it would need its own encryption layer to be no worse — which
means a key exchange, which means the QR stream is no longer self-contained.

**A second transport to keep correct.** Chunking, sequencing, retransmission,
integrity, and a completely separate set of failure modes, all of which would
need the same care the current transport has had. It would roughly double the
transfer surface area of the product.

**Lighting and CPU.** Glare, auto-brightness, screen protectors, and a phone at
an angle all degrade decoding. Encoding several hundred frames per second of
video on a mid-range phone drains battery and heats the device, which is exactly
when its screen dims.

## Decision

**Do not build it.**

The realistic throughput does not cover the documents this service exists for.
The cost is a camera requirement, a new privacy posture, a new attack surface,
and a second transport — in exchange for a fallback that works for small text
PDFs during a network outage.

The honest answer for a visitor during an outage is a sentence on the kiosk
saying the service is temporarily unavailable and to ask a staff member. That
sentence already exists.

## When to revisit

Reopen this if all of the following become true:

1. kiosks in the fleet have cameras for another reason, so the hardware and the
   privacy conversation are already paid for;
2. network outages turn out to be frequent enough to measure, rather than
   hypothetical;
3. the documents people actually bring are small enough to matter — which would
   be visible as a size distribution, not assumed.

Until then this is a demo, not a feature. If one is ever built for a Club
Paradiso showcase it belongs behind an experimental flag, with synthetic
documents only, with the camera opt-in and off by default, and with no path from
it into the Production print flow.

## Related

The same reasoning applies to the gesture-recognition demo: interesting to show,
requires a camera, and has no place in a flow where a stranger's document is on
screen. Both stay demos or stay unbuilt.
