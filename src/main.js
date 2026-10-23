// LiteLoaderQQNT - KDE Theme Sync Plugin
// Real-time synchronization between KDE Plasma / XDG Desktop Portal theme and QQNT
const { nativeTheme, app } = require("electron");
const { execFile, spawn } = require("child_process");

const GDBUS = "gdbus";
const PORTAL_DEST = "org.freedesktop.portal.Desktop";
const PORTAL_PATH = "/org/freedesktop/portal/desktop";

let monitorProcess = null;
let isQuitting = false;

function syncTheme() {
  execFile(
    GDBUS,
    [
      "call",
      "--session",
      "--dest",
      PORTAL_DEST,
      "--object-path",
      PORTAL_PATH,
      "--method",
      "org.freedesktop.portal.Settings.Read",
      "org.freedesktop.appearance",
      "color-scheme",
    ],
    { timeout: 3000 },
    (err, stdout) => {
      if (err) {
        console.warn("[KDE Theme Sync] Failed to read desktop portal:", err.message);
        return;
      }
      const match = stdout.match(/uint32\s+([012])/);
      if (!match) return;

      const colorScheme = Number(match[1]);
      // 0: default/no-preference, 1: prefer-dark, 2: prefer-light
      const targetTheme = colorScheme === 1 ? "dark" : "light";

      if (nativeTheme.themeSource !== targetTheme) {
        console.log(
          `[KDE Theme Sync] Syncing themeSource: ${nativeTheme.themeSource} -> ${targetTheme} (portal color-scheme=${colorScheme})`
        );
        nativeTheme.themeSource = targetTheme;
      }
    }
  );
}

function startPortalMonitor() {
  if (isQuitting) return;

  // Immediate sync on start
  syncTheme();

  try {
    monitorProcess = spawn(GDBUS, [
      "monitor",
      "--session",
      "--dest",
      PORTAL_DEST,
      "--object-path",
      PORTAL_PATH,
    ]);

    monitorProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (
        text.includes("org.freedesktop.portal.Settings.SettingChanged") &&
        text.includes("org.freedesktop.appearance") &&
        text.includes("color-scheme")
      ) {
        syncTheme();
      }
    });

    monitorProcess.on("error", (err) => {
      console.warn("[KDE Theme Sync] Portal monitor warning:", err.message);
    });

    monitorProcess.on("exit", () => {
      monitorProcess = null;
      if (!isQuitting) {
        setTimeout(startPortalMonitor, 5000);
      }
    });
  } catch (err) {
    console.error("[KDE Theme Sync] Failed to spawn monitor process:", err);
  }
}

function cleanup() {
  isQuitting = true;
  if (monitorProcess && !monitorProcess.killed) {
    try {
      monitorProcess.kill();
    } catch (_) {}
    monitorProcess = null;
  }
}

if (app) {
  app.on("before-quit", cleanup);
}
process.on("exit", cleanup);

// Start monitoring as soon as main process initializes
startPortalMonitor();

module.exports = {
  onLoad() {
    syncTheme();
  },
};
