import {
  globalShortcut, Tray, nativeImage, ipcMain,
} from 'electron';
import MainWindow from '../windows/MainWindow';

let tray: Tray | null = null;
function handleBossKeyPressed(mainWindow: MainWindow | null) {
  if (!mainWindow || !mainWindow.isVisible()) return;
  const menuService = mainWindow.menuService;

  if (process.platform === 'darwin' && mainWindow.isFullScreen()) {
    mainWindow.once('leave-full-screen', () => {
      handleBossKeyPressed(mainWindow);
    });
    menuService.updateFullScreen(false);
    mainWindow.setFullScreen(false);
    return;
  }
  mainWindow.sendToWebContents('mainCommit', 'PAUSED_UPDATE', true);
  mainWindow.sendToWebContents('mainCommit', 'isHiddenByBossKey', true);
  mainWindow.hide();
  menuService.updatePaused(true);
  menuService.handleBossKey(true);
  if (process.platform === 'win32') {
    tray = new Tray(nativeImage.createFromDataURL(require('../../../build/icons/1024x1024.png')));
    tray.on('click', () => {
      mainWindow.show();
      mainWindow.sendToWebContents('mainCommit', 'isHiddenByBossKey', false);
      // Destroy tray in its callback may cause app crash
      setTimeout(() => {
        if (!tray) return;
        tray.destroy();
        tray = null;
      }, 10);
    });
  }
}

export default function handleBossKey(getMainWindow: () => MainWindow | null) {
  if (process.platform === 'win32') {
    globalShortcut.register('CmdOrCtrl+`', () => {
      ipcMain.emit('bossKey');
    });
  }
  ipcMain.on('bossKey', () => handleBossKeyPressed(getMainWindow()));
}
