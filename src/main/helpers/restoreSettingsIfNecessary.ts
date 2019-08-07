import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';

export default function restoreSettingsIfNeeded() {
  /**
   * Check for restore mark and delete all user data
   */
  const userDataPath = app.getPath('userData');
  if (fs.existsSync(path.join(userDataPath, 'NEED_TO_RESTORE_MARK'))) {
    try {
      const tbdPath = `${userDataPath}-TBD`;
      if (fs.existsSync(tbdPath)) rimraf.sync(tbdPath);
      fs.renameSync(userDataPath, tbdPath);
      rimraf(tbdPath, (err) => {
        if (err) console.error(err);
      });
    } catch (ex) {
      console.error(ex);
      try {
        rimraf.sync(`${userDataPath}/**/!(lockfile)`);
        console.log('Successfully removed all user data.');
      } catch (ex) {
        console.error(ex);
      }
    }
  }
}
