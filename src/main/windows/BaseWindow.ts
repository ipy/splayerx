import { BrowserWindow } from 'electron';

export default class BaseWindow extends BrowserWindow {
  public static readonly defaultOptions: Electron.BrowserWindowConstructorOptions = {
    show: false,
    acceptFirstMouse: false,
    useContentSize: true,
    frame: false,
    // titleBarStyle: 'hidden',
    backgroundColor: '#6a6a6a',
    transparent: true,
    webPreferences: {
      webSecurity: false,
      nodeIntegration: true,
      experimentalFeatures: true,
      webviewTag: true,
    },
  }

  private isReady: boolean;

  public get name() { return ''; }

  public constructor(options: Electron.BrowserWindowConstructorOptions = {}, load = true) {
    options = Object.assign({}, BaseWindow.defaultOptions, options);
    super(options);
    this.once('ready-to-show', () => {
      this.isReady = true;
    });
    this.once('closed', () => {
      if (this.isDestroyed()) return;
      // @ts-ignore
      const views = this.getBrowserViews() as Electron.BrowserView[];
      if (views && views.length) {
        views.forEach(view => view.destroy());
      }
    });

    if (load) this.loadURL(this.getStartUrl());
  }

  public getStartUrl(route?: string) {
    let url = process.env.NODE_ENV === 'development'
      ? `http://localhost:9080/${this.name}.html`
      : `file://${__dirname}/${this.name}.html`;
    if (route) url += `#${route}`;
    return url;
  }

  /**
   * Show when ready
   */
  public show() {
    if (this.isReady) super.show();
    else this.once('ready-to-show', () => super.show());
  }

  /**
   * Show and focus
   */
  public activate() {
    if (!this.isVisible()) this.show();
    if (this.isMinimized()) this.restore();
    this.focus();
  }

  /**
   * Check webContents and send message
   */
  public sendToWebContents(channel: string, ...args: unknown[]) {
    if (!this.webContents || this.webContents.isDestroyed()) return;
    if (this.isReady) this.webContents.send(channel, ...args);
    else this.once('ready-to-show', () => this.webContents.send(channel, ...args));
  }

  /**
   * setAlwaysOnTop and trigger always-on-top-changed on platforms other than macOS
   */
  public setAlwaysOnTop(
    flag: boolean,
    level?: 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' | 'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver',
    relativeLevel?: number,
  ) {
    super.setAlwaysOnTop(flag, level, relativeLevel);
    if (process.env.NODE_ENV !== 'darwin') this.emit('always-on-top-changed', flag);
  }

  /**
   * Set always-on-top same as parent window
   * @param parent Parent window
   */
  public setAlwaysOnTopDepends(parent: BrowserWindow) {
    if (!parent || parent.isDestroyed()) return;
    if (parent.isAlwaysOnTop()) parent.setAlwaysOnTop(true);
    parent.on('always-on-top-changed', (evt, isAlwaysOnTop) => {
      parent.setAlwaysOnTop(isAlwaysOnTop);
    });
  }

  /**
   * Shortcut for 'closed' event
   * @param listener Callback function
   */
  public onClosed(listener: Function) {
    this.on('closed', listener);
  }
}
