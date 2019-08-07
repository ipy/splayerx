// Be sure to call Sentry function as early as possible in the main process
import '../shared/sentry';

import {
  app, ipcMain, globalShortcut, systemPreferences,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { OAUTH_REGEX } from '../shared/contants';
import MenuService, { menuService } from './menu/MenuService';
import BaseWindow from './windows/BaseWindow';
import MainWindow from './windows/MainWindow';
import AboutWindow from './windows/AboutWindow';
import PreferenceWindow from './windows/PreferenceWindow';
import { mouse } from './helpers/mouse';
import restoreSettingsIfNecessary from './helpers/restoreSettingsIfNecessary';
import handleOpenFiles from './helpers/handleOpenFiles';
import registerMediaTasks from './helpers/mediaTasksPlugin';
import handleBossKey from './helpers/handleBossKey';

// #region global setup

// requestSingleInstanceLock is not going to work for mas
// https://github.com/electron-userland/electron-packager/issues/923
if (!process.mas && !app.requestSingleInstanceLock()) {
  app.quit();
}

/**
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
if (process.env.NODE_ENV !== 'development') {
  // @ts-ignore
  global.__static = path.join(__dirname, '/static').replace(/\\/g, '\\\\'); // eslint-disable-line
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

restoreSettingsIfNecessary();

// TODO: app.broadcast
// TODO: app.sendMenuEvent

// #endregion

let needToRestore = false;
const subWindows: { [key: string]: BaseWindow | null } = {
  preference: null,
  about: null,
};

// #region system event handlers

app.on('activate', () => {
  MainWindow.getInstance().activate();
});

app.on('ready', () => {
  if (process.platform === 'darwin') {
    // @ts-ignore
    systemPreferences.setUserDefault('NSDisabledDictationMenuItem', 'boolean', true);
    // @ts-ignore
    systemPreferences.setUserDefault('NSDisabledCharacterPaletteMenuItem', 'boolean', true);
  }
  app.setName('SPlayer');
  handleOpenFiles(() => MainWindow.getInstance());

  globalShortcut.register('CmdOrCtrl+Shift+I+O+P', () => {
    if (MainWindow.hasInstance()) MainWindow.getInstance().webContents.openDevTools({ mode: 'detach' });
  });

  globalShortcut.register('Shift+Esc', () => {
    // TODO: process manager
  });
});

app.on('web-contents-created', (webContentsCreatedEvent, contents) => {
  // prevent browsingview from opening new window, except oauth pages
  if (contents.getType() === 'webview') {
    contents.on('new-window', (newWindowEvent, url) => {
      if (!OAUTH_REGEX.some(re => re.test(url))) {
        newWindowEvent.preventDefault();
      }
    });
  }
});

app.on('window-all-closed', () => {
  // TODO
  app.quit();
});

app.on('before-quit', () => {
  if (!MainWindow.hasInstance()) return;
  if (needToRestore) {
    MainWindow.getInstance().sendToWebContents('quit', needToRestore);
  } else {
    MainWindow.getInstance().sendToWebContents('quit');
  }
});

app.on('quit', () => {
  mouse.dispose();
});

// #endregion

// #region custom event handlers

registerMediaTasks();

handleBossKey(() => MainWindow.getInstance());

function createOrShowSubWindow(
  key: string,
  WindowClass: typeof AboutWindow | typeof PreferenceWindow,
) {
  let win = subWindows[key];
  if (!win) {
    win = new WindowClass();
    win.onClosed(() => {
      delete subWindows[key];
    });
    subWindows[key] = win;
  }
  win.show();
  if (MainWindow.hasInstance()) win.setAlwaysOnTopDepends(MainWindow.getInstance());
}

ipcMain.on('add-windows-about', () => {
  createOrShowSubWindow('about', AboutWindow);
});

ipcMain.on('add-preference', () => {
  createOrShowSubWindow('preference', PreferenceWindow);
});
// TODO: event broadcast
ipcMain.on('preference-to-main', (e: Electron.Event, args: unknown) => {
  if (!MainWindow.hasInstance()) return;
  MainWindow.getInstance().sendToWebContents('mainDispatch', 'setPreference', args);
});
ipcMain.on('main-to-preference', (e: Electron.Event, args: unknown) => {
  const preferenceWindow = subWindows.preference as PreferenceWindow;
  if (!preferenceWindow) return;
  preferenceWindow.sendToWebContents('preferenceDispatch', 'setPreference', args);
});

ipcMain.on('need-to-restore', () => {
  needToRestore = true;
  fs.closeSync(fs.openSync(path.join(app.getPath('userData'), 'NEED_TO_RESTORE_MARK'), 'w'));
});

// #endregion
