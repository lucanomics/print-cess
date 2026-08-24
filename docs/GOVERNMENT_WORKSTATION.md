# Government and public-sector workstation use

Print-cess can be used from a managed government or public-sector Windows workstation through the normal web application. The workstation flow is intentionally browser-only: it does not require a desktop installation, browser extension, local administrator rights, USB access, ActiveX, or a dedicated kiosk runtime.

The public entry point is `/workstation`.

## Supported operating model

Two directions are supported:

1. Phone to work computer: create a transfer on `/send` from the phone, then enter its transfer code on `/receive` from the managed computer.
2. Work computer to phone: create a transfer on `/send` from the managed computer, then open it on the phone by QR code or transfer code.

The workstation page performs a small local readiness check before the user starts. The required capabilities are:

- HTTPS secure context;
- standards-compliant Web Crypto;
- the browser File, Blob, and FileReader APIs.

Normal browser download support is also checked. If richer save APIs are unavailable, the receive flow can fall back to an ordinary browser download where the browser and agency policy permit it.

## Browser baseline

Use a current Microsoft Edge or Chromium-based browser managed by the organization. Internet Explorer and Edge Internet Explorer mode are not supported. JavaScript must be enabled.

Print-cess does not attempt to work around browser policy, endpoint security, DLP, proxy inspection, download controls, network separation, or domain allowlists. A blocked capability is a deployment or agency-policy decision, not a condition the application should bypass.

## Network expectations

The user's browser should reach only the approved HTTPS Print-cess origin used by the deployment. Provider credentials and storage integrations remain server-side. If the organization uses an outbound allowlist, approve the exact deployed Print-cess origin rather than broad wildcard domains whenever possible.

A production deployment must continue to satisfy the requirements in `VERCEL_DEPLOYMENT.md` and the repository security documentation. Do not weaken the existing origin checks or production fail-closed behavior to make a managed workstation appear compatible.

## Information-handling boundary

End-to-end encryption protects transfer payloads from being readable by the service, but encryption does not override the organization's information-handling rules.

Before using Print-cess with an official document, verify that the document classification and the organization's rules permit transfer through an external web service. Development, Preview, fixtures, CI, and acceptance tests must never use real personal or official sensitive documents.

After receiving a file on a managed workstation:

- verify the actual save location;
- move the file only to an organization-approved location;
- remove the transfer promptly when appropriate;
- follow the organization's retention, DLP, malware-scanning, and document-handling rules.

## Deployment acceptance for an agency workstation

A green application CI build is not proof that a specific managed image is usable. Before enabling the workflow for real work, test on a representative agency-managed workstation with the same browser policies, endpoint security, proxy, and download rules as production users.

Minimum acceptance evidence should include:

- `/workstation` loads over HTTPS;
- the readiness panel reports HTTPS, Web Crypto, and File API support;
- a synthetic non-sensitive file can be sent from phone to workstation;
- a synthetic non-sensitive file can be sent from workstation to phone;
- the received bytes match the source bytes;
- the workstation's security software does not silently redirect or discard the download;
- no step requires local administrator rights or software installation;
- blocking a download or upload through policy produces a visible failure instead of a bypass attempt.

Keep this acceptance evidence separate from production documents.
