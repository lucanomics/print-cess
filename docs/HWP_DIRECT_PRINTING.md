# HWP direct printing

Legacy `.hwp` files are accepted only by a native Windows kiosk that has the approved Hancom Office automation component and file-path security module configured. The public browser kiosk does not render or print HWP.

## Processing path

1. The mobile browser checks the legacy HWP compound-file signature and basic HWP 5.x identity.
2. The original HWP is encrypted inside the existing Print-cess envelope.
3. The Windows kiosk decrypts the file in memory and validates the HWP structure again.
4. Hancom Office opens the application-owned temporary `.hwp` file and renders a temporary PDF.
5. The generated PDF passes the existing page-count and safe-size checks before the fixed A4, one-copy, simplex, grayscale print path.
6. The original HWP bytes, temporary HWP, and temporary PDF are cleared or deleted on completion or failure.

No external document-conversion service receives the plaintext HWP.

## Rejected documents

The kiosk fails closed for:

- malformed OLE Compound File or missing HWP document identity;
- password-encrypted or certificate-encrypted HWP;
- distribution documents;
- DRM-protected documents;
- script-enabled HWP or suspicious script/macro stream names;
- files larger than 10 MiB;
- Hancom rendering failures or generated PDFs outside the existing print limits.

## Deployment requirements

- Institution-approved Hancom Office installation registering `HWPFrame.HwpObject`.
- Hancom file-path security module installed and registered under `HKCU\Software\HNC\HwpAutomation\Modules` for the kiosk account, with the registered value pointing to an existing DLL.
- When `PRINT_CESS_HANCOM_SECURITY_MODULE` is unset, the kiosk automatically uses the registered `FilePathCheckerModuleExample` module. Set the variable to another exact registered value name to override the default.
- To deliberately disable HWP/HWPX capability advertisement without uninstalling Hancom, set `PRINT_CESS_HANCOM_SECURITY_MODULE` to a reserved unregistered value such as `disabled`; an explicitly configured but unregistered module fails closed and suppresses the capability.
- Confirmed institutional automation and licensing terms.
- Target-PC acceptance tests using synthetic HWP 5.x files with tables, images, shapes, headers, footers, page breaks, and required fonts.
- Comparison against interactive Hancom Office output on the same machine and printer.

GitHub Actions verifies protocol handling, structural validation, Windows compilation, tests, and packaging. It cannot prove actual Hancom rendering or physical paper output because hosted runners do not contain the institution's licensed Hancom installation, fonts, driver, or printer.
