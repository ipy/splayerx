import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { uniq, debounce } from 'lodash';
import { getValidVideoRegex, getValidSubtitleRegex } from '../../shared/utils';
import BaseWindow from '../windows/BaseWindow';

// #region File system helpers

/**
 * Check file if file is valid
 * @param file File path
 */
function checkFile(file: string): {
  hasError: true,
} | {
  hasError: false,
  isDirectory: boolean,
  ext: string,
} {
  let ext;
  let isDirectory;
  try {
    ext = path.extname(file);
    isDirectory = fs.statSync(file).isDirectory();
    return { hasError: false, ext, isDirectory };
  } catch (ex) {
    return { hasError: true };
  }
}

function searchSubsInDir(dir: string) {
  const dirFiles = fs.readdirSync(dir);
  return dirFiles
    .filter(subtitleFilename => getValidSubtitleRegex().test(path.extname(subtitleFilename)))
    .map(subtitleFilename => (path.join(dir, subtitleFilename)));
}

function searchForLocalVideo(subSrc: string) {
  const videoDir = path.dirname(subSrc);
  const videoBasename = path.basename(subSrc, path.extname(subSrc)).toLowerCase();
  const videoFilename = path.basename(subSrc).toLowerCase();
  const dirFiles = fs.readdirSync(videoDir);
  return dirFiles
    .filter((subtitleFilename) => {
      const lowerCasedName = subtitleFilename.toLowerCase();
      return (
        getValidVideoRegex().test(lowerCasedName)
        && lowerCasedName.slice(0, lowerCasedName.lastIndexOf('.')) === videoBasename
        && lowerCasedName !== videoFilename
        && !getValidSubtitleRegex().test(path.extname(lowerCasedName))
      );
    })
    .map(subtitleFilename => path.join(videoDir, subtitleFilename));
}

function getAllValidVideo(onlySubtitle: boolean, files: string[]) {
  try {
    const subRegex = getValidSubtitleRegex();
    const videoFiles: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
      if (fs.statSync(files[i]).isDirectory()) {
        const dirPath = files[i];
        const dirFiles = fs.readdirSync(dirPath).map(file => path.join(dirPath, file));
        files.push(...dirFiles);
      }
    }
    if (!process.mas) {
      files.forEach((tempFilePath) => {
        const baseName = path.basename(tempFilePath);
        if (baseName.startsWith('.') || fs.statSync(tempFilePath).isDirectory()) return;
        if (subRegex.test(path.extname(tempFilePath))) {
          const tempVideo = searchForLocalVideo(tempFilePath);
          videoFiles.push(...tempVideo);
        } else if (!subRegex.test(path.extname(tempFilePath))
          && getValidVideoRegex().test(tempFilePath)) {
          videoFiles.push(tempFilePath);
        }
      });
    } else {
      files.forEach((tempFilePath) => {
        const baseName = path.basename(tempFilePath);
        if (baseName.startsWith('.') || fs.statSync(tempFilePath).isDirectory()) return;
        if (!subRegex.test(path.extname(tempFilePath))
          && getValidVideoRegex().test(tempFilePath)) {
          videoFiles.push(tempFilePath);
        }
      });
    }
    return uniq(videoFiles);
  } catch (ex) {
    return [];
  }
}

// #endregion

// #region Manipulate file arrays

export const finalVideoToOpen: string[] = [];
const tmpVideoToOpen: string[] = [];
const tmpSubsToOpen: string[] = [];

function clearAllFiles() {
  finalVideoToOpen.splice(0, finalVideoToOpen.length);
  tmpSubsToOpen.splice(0, tmpSubsToOpen.length);
  tmpVideoToOpen.splice(0, tmpVideoToOpen.length);
}

function checkFileAndAdd(file: string) {
  const checkResult = checkFile(file);
  if (checkResult.hasError) return;
  const { isDirectory, ext } = checkResult;
  if (isDirectory || getValidSubtitleRegex().test(ext)) {
    tmpSubsToOpen.push(file);
  } else if (getValidVideoRegex().test(file)) {
    tmpVideoToOpen.push(file);
  }
}

// #endregion

// #region Send events to renderer process

function openSubtitles(win: BaseWindow) {
  if (!win || !tmpSubsToOpen.length) return;
  const allSubFiles: string[] = [];
  tmpSubsToOpen.forEach((file) => {
    if (getValidSubtitleRegex().test(path.extname(file))) {
      allSubFiles.push(file);
    } else {
      allSubFiles.push(...searchSubsInDir(file));
    }
  });
  win.sendToWebContents('add-local-subtitles', uniq(allSubFiles));
}

function openVideos(win: BaseWindow) {
  if (!win || !finalVideoToOpen.length) return;
  win.sendToWebContents('open-file', {
    onlySubtitle: !tmpVideoToOpen.length,
    files: uniq(finalVideoToOpen),
  });
}

function openFiles(win: BaseWindow) {
  if (!win) return;
  if (!tmpVideoToOpen.length && tmpSubsToOpen.length) {
    openSubtitles(win);
  } else if (tmpVideoToOpen.length + tmpSubsToOpen.length > 0) {
    openVideos(win);
  }
  clearAllFiles();
  win.activate();
}

// #endregion

// TODO: drop-subtitle


function handleOpenFilesOnMac(
  getWindow: (hasFilesToOpen: boolean) => BaseWindow,
) {
  function openFilesToStartOnMac() {
    finalVideoToOpen.splice(
      0, tmpVideoToOpen.length,
      ...getAllValidVideo(!tmpVideoToOpen.length, tmpVideoToOpen.concat(tmpSubsToOpen)),
    );
    const win = getWindow(!!finalVideoToOpen.length);
    openFiles(win);
  }
  const openFilesToStartOnMacDebounced = debounce(openFilesToStartOnMac, 100);

  openFilesToStartOnMacDebounced();
  app.on('will-finish-launching', () => {
    app.on('open-file', (evt, file) => {
      checkFileAndAdd(file);
      openFilesToStartOnMacDebounced();
    });
  });
}

function handleOpenFilesOnWin(
  getWindow: (hasFilesToOpen: boolean) => BaseWindow,
) {
  function openFilesToStartOnWin(argv: string[]) {
    const files = argv.slice(app.isPackaged ? 3 : 2);
    files.forEach(file => checkFileAndAdd(file));
    const win = getWindow(!!finalVideoToOpen.length);
    openFiles(win);
  }

  openFilesToStartOnWin(process.argv);

  app.on('second-instance', (evt, argv) => {
    openFilesToStartOnWin(argv);
  });
}

export default process.platform === 'darwin' ? handleOpenFilesOnMac : handleOpenFilesOnWin;
