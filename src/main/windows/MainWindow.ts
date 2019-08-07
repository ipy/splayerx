import { throttle } from 'lodash';
import MenuService, { menuService } from '../menu/MenuService';
import { jsonStorage } from '../../renderer/libs/JsonStorage'; // TODO: move to shared
import { mouse } from '../helpers/mouse';
import BaseWindow from './BaseWindow';
import LaborWindow from './LaborWindow';
import { finalVideoToOpen } from '../helpers/handleOpenFiles';

type obj = { [key: string]: Function; }

export default class MainWindow extends BaseWindow {
  private static instance: MainWindow | null;

  public static getInstance(): MainWindow {
    if (!MainWindow.instance) {
      MainWindow.instance = new MainWindow(!!finalVideoToOpen.length, menuService);
      MainWindow.instance.once('closed', () => {
        MainWindow.instance = null;
      });
    }
    return MainWindow.instance;
  }

  public static hasInstance() {
    return !!MainWindow.instance;
  }

  public get name() { return 'index'; }

  public readonly menuService: MenuService;

  private labor: LaborWindow;

  // @ts-ignore
  public constructor(
    hasFilesToOpen: boolean, menuService: MenuService,
  ) {
    super({
      width: 720,
      height: 405,
      minWidth: 720,
      minHeight: 405,
      transparent: false, // set to false to solve the backdrop-filter bug
    }, false);

    this.menuService = menuService;
    this.labor = new LaborWindow();

    this.registerMouseEvents();
    this.registerWindowEvents();

    this.once('closed', () => {
      if (this.labor && !this.labor.isDestroyed()) this.labor.close();
      delete this.labor;
    });

    (new Promise<string>((resolve) => {
      if (hasFilesToOpen) {
        resolve('play');
      } else {
        jsonStorage.get('preferences').then((data: any) => { // eslint-disable-line
          if (!data.welcomeProcessDone) resolve('welcome');
          else resolve('');
        }).catch(() => {
          resolve('');
        });
      }
    })).then((route) => {
      this.loadURL(this.getStartUrl(route));
      this.show();
    });
  }


  private registerWindowEvents() {
    this.on('move', throttle(() => {
      this.sendToWebContents('mainCommit', 'windowPosition', this.getPosition());
    }, 100));
    this.on('enter-full-screen', () => {
      this.menuService.updateFullScreen(true);
      this.sendToWebContents('mainCommit', 'isFullScreen', true);
      this.sendToWebContents('mainCommit', 'isMaximized', this.isMaximized());
    });
    this.on('leave-full-screen', () => {
      this.menuService.updateFullScreen(false);
      this.sendToWebContents('mainCommit', 'isFullScreen', false);
      this.sendToWebContents('mainCommit', 'isMaximized', this.isMaximized());
    });
    this.on('maximize', () => {
      this.sendToWebContents('mainCommit', 'isMaximized', true);
    });
    this.on('unmaximize', () => {
      this.sendToWebContents('mainCommit', 'isMaximized', false);
    });
    this.on('minimize', () => {
      this.menuService.minimize(true);
      this.sendToWebContents('mainCommit', 'isMinimized', true);
    });
    this.on('restore', () => {
      this.menuService.minimize(false);
      this.sendToWebContents('mainCommit', 'isMinimized', false);
    });
    this.on('show', () => {
      this.menuService.handleBossKey(false);
      this.sendToWebContents('mainCommit', 'isMinimized', false);
    });
    this.on('focus', () => {
      this.menuService.handleBossKey(false);
      this.sendToWebContents('mainCommit', 'isFocused', true);
      this.sendToWebContents('mainCommit', 'isHiddenByBossKey', false);
    });
    this.on('blur', () => {
      this.sendToWebContents('mainCommit', 'isFocused', false);
    });
    this.on('scroll-touch-begin', () => {
      this.sendToWebContents('scroll-touch-begin');
    });
    this.on('scroll-touch-end', () => {
      this.sendToWebContents('scroll-touch-end');
    });
  }

  /**
   * Bind events of win-mouse, redirect them to renderer process
   */
  private registerMouseEvents() {
    const mouseEvents: { [key: string]: (x: number, y: number) => void } = ['left-drag', 'left-up'].reduce((obj, channel) => Object.assign(obj, {
      [channel]: (x: number, y: number) => {
        this.webContents.send(`mouse-${channel}`, x, y);
      },
    }, {})) as any; // eslint-disable-line

    Object.keys(mouseEvents).forEach((channel) => {
      mouse.on(channel, mouseEvents[channel]);
    });

    this.once('closed', () => {
      Object.keys(mouseEvents).forEach((channel) => {
        mouse.off(channel, mouseEvents[channel]);
      });
    });
  }
}
