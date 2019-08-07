import BaseWindow from './BaseWindow';

export default class PreferenceWindow extends BaseWindow {
  public get name() { return 'preference'; }

  public constructor(route?: string) {
    super({
      width: 540,
      height: 426,
    }, false);
    const url = this.getStartUrl(route);
    this.loadURL(url);
    this.show();
  }
}
