import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

async function profileWithHistory() {
  const home = await mkdtemp(path.join(tmpdir(), "print-cess-kiosk-profile-"));
  const profile = path.join(
    home,
    "Library",
    "Application Support",
    "Paradiso Print-cess Kiosk",
    "Chrome",
  );
  await mkdir(profile, { recursive: true });
  const history = path.join(profile, "History");
  await writeFile(history, "synthetic browsing history from a previous shift");
  return { home, profile, history };
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test("resetting the profile removes the previous shift's browsing history", async () => {
  const { home, history } = await profileWithHistory();
  assert.equal(await exists(history), true);

  const { stdout } = await execFileAsync("/bin/bash", [launcher, "--reset-profile"], {
    env: { ...process.env, HOME: home },
  });

  assert.match(stdout, /Chrome profile reset/u);
  assert.equal(await exists(history), false);
});

test("the preflight reports the reset without performing it", async () => {
  const { home, history } = await profileWithHistory();

  const { stdout } = await execFileAsync("/bin/bash", [launcher, "--check"], {
    env: {
      ...process.env,
      HOME: home,
      PRINT_CESS_CHROME_BINARY: "/bin/echo",
      PRINT_CESS_DEFAULT_PRINTER: "Synthetic_A4",
      PRINT_CESS_SKIP_NETWORK_CHECK: "1",
    },
  });

  assert.match(stdout, /no visitor history carries over/u);
  assert.match(stdout, /no profile was reset/u);
  assert.equal(await exists(history), true);
});

test("an operator can keep the profile explicitly", async () => {
  const { home, history } = await profileWithHistory();

  const { stdout } = await execFileAsync("/bin/bash", [launcher, "--check"], {
    env: {
      ...process.env,
      HOME: home,
      PRINT_CESS_CHROME_BINARY: "/bin/echo",
      PRINT_CESS_DEFAULT_PRINTER: "Synthetic_A4",
      PRINT_CESS_SKIP_NETWORK_CHECK: "1",
      PRINT_CESS_KEEP_CHROME_PROFILE: "1",
    },
  });

  assert.match(stdout, /preserved because PRINT_CESS_KEEP_CHROME_PROFILE=1/u);
  assert.equal(await exists(history), true);
});

test("a profile path that could reach a home directory is refused", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "print-cess-kiosk-guard-"));
  const cases = [
    ["the home directory itself", home, /Refusing to reset the home directory/u],
    ["a shallow absolute path", "/tmp/x", /path this shallow/u],
    ["a relative path", "relative/path", /is not absolute/u],
    ["the filesystem root", "/", /is not absolute/u],
  ];

  for (const [description, profileDir, expected] of cases) {
    await assert.rejects(
      execFileAsync("/bin/bash", [launcher, "--reset-profile"], {
        env: { ...process.env, HOME: home, PRINT_CESS_CHROME_PROFILE_DIR: profileDir },
      }),
      (error) => {
        assert.equal(error.code, 78, description);
        assert.match(error.stderr, expected, description);
        return true;
      },
      description,
    );
  }
});

test("the installer offers a force-stop, a clean restart, and a wiping uninstall", async () => {
  const source = await readFile(installer, "utf8");
  assert.match(source, /--reset\)/u);
  assert.match(source, /--reset-profile/u);
  assert.match(source, /Restarted \$\{label\} with an empty browser profile/u);
  assert.match(source, /The browser was terminated with it/u);
  // Uninstalling must not leave a visitor's browsing history on the station.
  assert.match(source, /Removed the LaunchAgent, the launcher and the dedicated Chrome profile/u);
});
