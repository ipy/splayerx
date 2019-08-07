import BaseWindow from './BaseWindow';

export default class AboutWindow extends BaseWindow {
  public get name() { return 'about'; }

  public constructor() {
    super({
      width: 190,
      height: 280,
    });
  }
}
