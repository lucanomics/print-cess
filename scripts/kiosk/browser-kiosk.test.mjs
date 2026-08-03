import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptsDir = new URL("./", import.meta.url).pathname;
const launcher = path.join(scriptsDir, "start-browser-kiosk-macos.sh");
const installer = path.join(scriptsDir, "install-browser-kiosk-macos.sh");

test("the macOS launcher preflight includes kiosk and silent-print flags", async () => {
  const syntheticHome = await mkdtemp(path.join(tmpdir(), "print-cess-kiosk-test-"));
  const { stdout } = await execFileAsync("/bin/bash", [launcher, "--check"], {
    env: {
      ...process.env,
      HOME: syntheticHome,
      PRINT_CESS_CHROME_BINARY: "/bin/echo",
      PRINT_CESS_DEFAULT_PRINTER: "Synthetic_A4",
      PRINT_CESS_SKIP_NETWORK_CHECK: "1",
    },
  });

  assert.match(stdout, /--kiosk(?:\s|$)/u);
  assert.match(stdout, /--kiosk-printing/u);
  assert.match(stdout, /--user-data-dir=/u);
  assert.match(stdout, /Default printer: Synthetic_A4/u);
  assert.match(stdout, /\/kiosk\\\?printing=auto/u);
  assert.match(stdout, /Preflight passed/u);
});

test("the launcher refuses to start without an explicit default printer", async () => {
  await assert.rejects(
    execFileAsync("/bin/bash", [launcher, "--check"], {
      env: {
        ...process.env,
        PRINT_CESS_CHROME_BINARY: "/bin/echo",
        PRINT_CESS_LPSTAT_BINARY: "/usr/bin/false",
        PRINT_CESS_SKIP_NETWORK_CHECK: "1",
      },
    }),
    (error) => {
      assert.equal(error.code, 78);
      assert.match(error.stderr, /No explicit default printer/u);
      return true;
    },
  );
});

test("the launcher refuses an unapproved kiosk origin", async () => {
  await assert.rejects(
    execFileAsync("/bin/bash", [launcher, "--check"], {
      env: {
        ...process.env,
        PRINT_CESS_CHROME_BINARY: "/bin/echo",
        PRINT_CESS_DEFAULT_PRINTER: "Synthetic_A4",
        PRINT_CESS_KIOSK_URL: "https://example.invalid",
        PRINT_CESS_SKIP_NETWORK_CHECK: "1",
      },
    }),
    (error) => {
      assert.equal(error.code, 78);
      assert.match(error.stderr, /Refusing non-Production kiosk URL/u);
      return true;
    },
  );
});

test("the installer is syntactically valid and configures a restartable Aqua LaunchAgent", async () => {
  await execFileAsync("/bin/bash", ["-n", installer]);
  const source = await readFile(installer, "utf8");
  assert.match(source, /KeepAlive -bool true/u);
  assert.match(source, /LimitLoadToSessionType -string Aqua/u);
  assert.match(source, /PRINT_CESS_KIOSK_URL/u);
});
