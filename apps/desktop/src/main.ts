import { once } from 'node:events';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, shell, utilityProcess, type UtilityProcess } from 'electron';
import { autoUpdater } from 'electron-updater';
import { loadConfig } from './config.ts';
import { alreadyRunningDialog, stoppedDialog, type Dialog } from './dialogs.ts';
import { otherHub, waitForHub } from './hub.ts';
import { navigationAction, newWindowAction } from './links.ts';
import { openLogFile } from './log-file.ts';
import { mergePaths, readLoginPath } from './login-path.ts';
import { createMacUpdater, type MacUpdater } from './mac-update.ts';
import { watchUpdates } from './updates.ts';

const config = loadConfig();
// Electron's own data (page storage, caches) sits beside the hub's, so a test's temporary home keeps
// everything apart; the single-instance lock is kept per home with it.
app.setPath('userData', join(config.home, 'desktop'));

let hub: UtilityProcess | null = null;
let hubOrigin: string | null = null;
let quitting = false;

async function show(box: Dialog): Promise<number> {
  return (await dialog.showMessageBox(box)).response;
}

function openWindow(origin: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    title: 'Orynx',
    // Shown once the page has drawn, so nothing flashes white in dark mode (AC-3).
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (newWindowAction(url) === 'external') void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const action = navigationAction(url, origin);
    if (action === 'allow') return;
    event.preventDefault();
    if (action === 'external') void shell.openExternal(url);
  });
  void window.loadURL(`${origin}/`);
  return window;
}

async function stopped(): Promise<void> {
  if (quitting) return;
  quitting = true;
  hub?.kill();
  const box = stoppedDialog(config.home, process.platform);
  if (box.buttons[await show(box)] === 'Open again') app.relaunch();
  app.exit(0);
}

/**
 * Restart to update: stop the hub as Quit does (AC-19), then install the downloaded update and open it. A Mac
 * swaps Orynx.app only once the hub has stopped, because the hub runs from inside it (AC-20).
 */
function restartToUpdate(running: UtilityProcess, mac: MacUpdater | null, log: (line: string) => void): void {
  quitting = true;
  running.once('exit', () => {
    if (mac === null) {
      autoUpdater.quitAndInstall(true, true);
      return;
    }
    void mac
      .swap()
      .catch((error: unknown) => {
        log(`Orynx couldn't install the update (${error instanceof Error ? error.message : String(error)}).`);
      })
      .finally(() => {
        app.relaunch();
        app.exit(0);
      });
  });
  running.kill();
}

async function start(): Promise<void> {
  await app.whenReady();
  const log = await openLogFile(config.home);
  const note = (msg: string): void => {
    log.write(`${JSON.stringify({ time: Date.now(), from: 'desktop', msg })}\n`);
  };

  // Two hubs on one home would overwrite each other's runtime.json, settings and sessions (AC-8).
  if ((await otherHub(config.home)) !== null) {
    note('Another Orynx hub is running on this home, so the app starts none.');
    await show(alreadyRunningDialog(config.home));
    app.exit(0);
    return;
  }

  const loginPath = await readLoginPath({ shell: userInfo().shell });
  if (loginPath === null) note("Orynx couldn't read the login shell's PATH; the hub gets the PATH the app got.");

  // In the packed app the hub sits in the resources folder; built but not packed, beside this package.
  const entry = app.isPackaged
    ? join(process.resourcesPath, 'server', 'dist', 'main.mjs')
    : join(app.getAppPath(), '..', 'server', 'dist', 'main.mjs');
  const child = utilityProcess.fork(entry, ['--serve-web'], {
    serviceName: 'Orynx hub',
    stdio: 'pipe',
    // A free port every launch (Q2), the hub's JSON log, and the login shell's PATH (AC-10).
    env: { ...config.env, PATH: mergePaths(config.path, loginPath), DEVHUB_PORT: '0', NODE_ENV: 'production' },
  });
  hub = child;
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  const exited = new AbortController();
  child.once('exit', (code) => {
    note(`The Orynx hub exited with code ${String(code)}.`);
    hub = null;
    exited.abort();
    void stopped();
  });
  await once(child, 'spawn');

  let port: number;
  try {
    port = await waitForHub({ home: config.home, pid: child.pid ?? 0, signal: exited.signal });
  } catch (error) {
    note(error instanceof Error ? error.message : String(error));
    await stopped();
    return;
  }
  hubOrigin = `http://127.0.0.1:${String(port)}`;
  note(`The window opens ${hubOrigin}.`);
  openWindow(hubOrigin);

  if (app.isPackaged) {
    autoUpdater.logger = null;
    // The updater tells the hub, and Settings › About shows it: no dialog of its own (spec 045, Q5).
    const mac =
      process.platform === 'darwin'
        ? // …/Orynx.app/Contents/MacOS/Orynx
          createMacUpdater({ app: join(app.getPath('exe'), '..', '..', '..'), feedUrl: config.updatesUrl })
        : null;
    const updates = watchUpdates({
      updater: autoUpdater,
      platform: process.platform,
      feedUrl: config.updatesUrl,
      mac,
      tell: (state) => {
        child.postMessage(state);
      },
      restart: () => {
        restartToUpdate(child, mac, note);
      },
      log: note,
    });
    child.on('message', (message: unknown) => {
      updates.command(message);
    });
  }
}

if (!app.requestSingleInstanceLock()) {
  // Another Orynx window is open on this home: it comes to the front instead (AC-5).
  app.exit(0);
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window === undefined) {
      if (hubOrigin !== null) openWindow(hubOrigin);
      return;
    }
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  // macOS keeps Orynx in the Dock with the hub running; Linux quits with its last window (AC-17).
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && hubOrigin !== null) openWindow(hubOrigin);
  });
  // Stop the hub the way Ctrl-C stops pnpm start, so it removes runtime.json (AC-18), then quit for real,
  // which is also when Linux's downloaded update installs.
  app.on('will-quit', (event) => {
    const running = hub;
    if (running === null) return;
    event.preventDefault();
    quitting = true;
    running.once('exit', () => {
      app.quit();
    });
    running.kill();
  });
  void start().catch((error: unknown) => {
    dialog.showErrorBox('Orynx stopped', error instanceof Error ? error.message : String(error));
    app.exit(1);
  });
}
