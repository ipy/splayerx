<template>
  <div
    :style="{ pointerEvents: isFocused ? 'auto' : 'none' }"
    class="browsing"
  >
    <browsing-header
      ref="browsingHeader"
      :handle-enter-pip="handleEnterPip"
      :handle-url-reload="handleUrlReload"
      :handle-url-back="handleUrlBack"
      :handle-url-forward="handleUrlForward"
      v-show="!isPip && headerToShow"
    />
    <div
      :style="{
        position: 'absolute',
        width: '100%',
        height: '100%',
        background: 'rgba(255, 255, 255, 0.18)',
        zIndex: '999'
      }"
      v-show="maskToShow"
    />
    <div
      v-show="loadingState && !isPip && headerToShow"
      class="loading-state loading-animation"
    />
    <div
      v-show="isPip && timeout"
      class="pip-buttons"
    >
      <Icon
        :style="{
          marginBottom: '12px',
          cursor: pipType === 'youtube' ? 'default' : 'pointer',
          opacity: danmuIconState,
        }"
        @mouseup.native="handleDanmuDisplay"
        @mouseenter.native="handleMouseenter"
        @mouseleave.native="handleMouseleave"
        :type="danmuType"
      />
      <Icon
        :style="{ cursor: 'pointer' }"
        @mouseup.native="handleExitPip"
        @mouseenter.native="handleMouseenter"
        @mouseleave.native="handleMouseleave"
        type="pipBack"
      />
    </div>
    <webview
      ref="webView"
      :src="availableUrl"
      :style="{ webkitAppRegion: isPip && isDarwin ? 'drag' : 'no-drag' }"
      :preload="preload"
      autosize
      class="web-view"
      allowpopups
      webpreferences="nativeWindowOpen=yes"
    />
    <NotificationBubble />
  </div>
</template>

<script lang="ts">
import { mapGetters, mapActions } from 'vuex';
import fs from 'fs';
// @ts-ignore
import urlParseLax from 'url-parse-lax';
// @ts-ignore
import getVideoId from 'get-video-id';
import { windowRectService } from '@/services/window/WindowRectService';
import { Browsing as browsingActions } from '@/store/actionTypes';
import BrowsingHeader from '@/components/BrowsingView/BrowsingHeader.vue';
import Icon from '@/components/BaseIconContainer.vue';
import asyncStorage from '@/helpers/asyncStorage';
import NotificationBubble from '@/components/NotificationBubble.vue';
import { bilibili, bilibiliFindType, bilibiliBarrageAdapt } from '../../shared/pip/bilibili';
import youtube from '../../shared/pip/youtube';
import iqiyi, { iqiyiBarrageAdapt } from '../../shared/pip/iqiyi';
import globalPip from '../../shared/pip/others';
import { getValidVideoRegex, getValidSubtitleRegex } from '../../shared/utils';
import MenuService from '@/services/menu/MenuService';

export default {
  name: 'BrowsingView',
  components: {
    'browsing-header': BrowsingHeader,
    Icon,
    NotificationBubble,
  },
  data() {
    return {
      quit: false,
      loadingState: false,
      startTime: 0,
      pipType: '',
      bilibiliType: 'video',
      supportedRecordHost: ['www.youtube.com', 'www.bilibili.com', 'www.iqiyi.com'],
      preload: `file:${require('path').resolve(__static, 'pip/preload.js')}`,
      maskToShow: false,
      dropFiles: [],
      hasVideo: false,
      currentUrl: '',
      timeout: false,
      timer: 0,
      calculateVideoNum: 'var iframe = document.querySelector("iframe");if (iframe && iframe.contentDocument) {document.getElementsByTagName("video").length + iframe.contentDocument.getElementsByTagName("video").length} else {document.getElementsByTagName("video").length}',
      getVideoStyle: 'getComputedStyle(document.querySelector("video") || document.querySelector("iframe").contentDocument.querySelector("video"))',
      pipBtnsKeepShow: false,
      asyncTasksDone: false,
      headerToShow: true,
      menuService: null,
      pipRestore: false,
      acceleratorAvailable: true,
      oldDisplayId: 0,
      backToLandingView: false,
    };
  },
  computed: {
    ...mapGetters(['winPos', 'isFullScreen', 'initialUrl', 'winWidth', 'winSize', 'browsingSize', 'pipSize', 'pipPos', 'barrageOpen', 'browsingPos', 'isFullScreen', 'isFocused', 'isPip']),
    isDarwin() {
      return process.platform === 'darwin';
    },
    iqiyiPip() {
      return iqiyi(this.barrageOpen, this.winSize);
    },
    iqiyiBarrage() {
      return iqiyiBarrageAdapt(this.barrageOpen);
    },
    bilibiliPip() {
      return bilibili(this.bilibiliType, this.barrageOpen, this.winSize);
    },
    bilibiliBarrage() {
      return bilibiliBarrageAdapt(this.bilibiliType, this.barrageOpen);
    },
    othersPip() {
      return globalPip(this.winSize);
    },
    availableUrl() {
      const parsedUrl = urlParseLax(this.initialUrl);
      return parsedUrl.protocol ? parsedUrl.href : `http://${this.initialUrl}`;
    },
    danmuType() {
      return this.barrageOpen ? 'danmu' : 'noDanmu';
    },
    danmuIconState() {
      return ['youtube', 'others'].includes(this.pipType) || (this.pipType === 'bilibili' && this.bilibiliType === 'others') ? 0.2 : 1;
    },
  },
  watch: {
    isFullScreen(val: string) {
      if (!val) {
        this.headerToShow = true;
        this.$refs.webView.executeJavaScript('document.webkitCancelFullScreen();');
      }
    },
    dropFiles(val: string[]) {
      this.backToLandingView = false;
      const onlyFolders = val.every((file: fs.PathLike) => fs.statSync(file).isDirectory());
      if (onlyFolders || val.every((file: fs.PathLike) => getValidVideoRegex()
        .test(file) && !getValidSubtitleRegex().test(file))) {
        val.forEach((file: fs.PathLike) => this.$electron.remote.app.addRecentDocument(file));
        if (onlyFolders) {
          this.openFolder(...val);
        } else {
          this.openFile(...val);
        }
      } else {
        this.$electron.ipcRenderer.send('drop-subtitle', val);
      }
    },
    isPip(val: boolean) {
      this.menuService.updateMenuItemLabel(
        'browsing.window.pip',
        this.isPip ? 'msg.window.exitPip' : 'msg.window.enterPip',
      );
      this.menuService.updateMenuItemEnabled('browsing.window.pip', true);
      this.menuService.updateMenuItemEnabled('history.back', !val && this.$refs.webView.canGoBack());
      this.menuService.updateMenuItemEnabled('history.forward', !val && this.$refs.webView.canGoForward());
      if (!val) {
        this.$store.dispatch('updatePipSize', this.winSize);
        this.$store.dispatch('updatePipPos', this.winPos);
        this.menuService.updateMenuItemEnabled('browsing.window.keepPipFront', false);
        this.handleWindowChangeExitPip();
        if (this.pipType === 'youtube') {
          this.youtubeRecover();
        } else if (this.pipType === 'bilibili') {
          this.bilibiliRecover();
        } else if (this.pipType === 'iqiyi') {
          this.iqiyiRecover();
        } else {
          this.othersRecover();
        }
      } else {
        this.$store.dispatch('updateBrowsingSize', this.winSize);
        this.$store.dispatch('updateBrowsingPos', this.winPos);
        this.menuService.updateMenuItemEnabled('browsing.window.keepPipFront', true);
        this.timeout = true;
        if (this.timer) {
          clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
          this.timeout = false;
        }, 3000);
        this.pipAdapter();
      }
    },
    winWidth() {
      if (this.isPip && this.pipType !== 'youtube') {
        if (this.pipType === 'iqiyi') {
          this.iqiyiWatcher();
        } else if (this.pipType === 'bilibili') {
          this.bilibiliWatcher();
        } else {
          this.othersWatcher();
        }
      }
    },
    loadingState(val: boolean) {
      const loadUrl = this.$refs.webView.getURL();
      const recordIndex = this.supportedRecordHost.indexOf(urlParseLax(loadUrl).hostname);
      this.menuService.updateMenuItemEnabled('history.back', this.$refs.webView.canGoBack());
      this.menuService.updateMenuItemEnabled('history.forward', this.$refs.webView.canGoForward());
      if (val) {
        this.hasVideo = false;
        this.menuService.updateMenuItemEnabled('browsing.window.pip', false);
        this.$refs.browsingHeader.updateWebInfo({
          hasVideo: this.hasVideo,
          url: loadUrl,
          canGoBack: this.$refs.webView.canGoBack(),
          canGoForward: this.$refs.webView.canGoForward(),
        });
      } else {
        if (this.pipRestore) {
          this.pipAdapter();
          this.pipRestore = false;
        }
        this.$refs.webView.executeJavaScript(this.calculateVideoNum, (r: number) => {
          this.hasVideo = recordIndex === 0 && !getVideoId(loadUrl).id ? false : !!r;
          this.menuService.updateMenuItemEnabled('browsing.window.pip', this.hasVideo);
          this.$refs.browsingHeader.updateWebInfo({
            hasVideo: this.hasVideo,
            url: loadUrl,
            canGoBack: this.$refs.webView.canGoBack(),
            canGoForward: this.$refs.webView.canGoForward(),
          });
        });
      }
    },
  },
  created() {
    this.$electron.ipcRenderer.send('callMainWindowMethod', 'setMinimumSize', [570, 375]);
    windowRectService.calculateWindowRect(
      this.browsingSize,
      true,
      this.winPos.concat(this.winSize),
    );
    this.$store.dispatch('updateBrowsingPos', this.winPos);
    this.$electron.ipcRenderer.send('callMainWindowMethod', 'setAspectRatio', [0]);
  },
  mounted() {
    this.menuService = new MenuService();
    this.$bus.$on('toggle-reload', this.handleUrlReload);
    this.$bus.$on('toggle-back', this.handleUrlBack);
    this.$bus.$on('toggle-forward', this.handleUrlForward);
    this.$bus.$on('toggle-pip', () => {
      setTimeout(() => {
        if (this.hasVideo && this.acceleratorAvailable) {
          this.updateIsPip(!this.isPip);
        }
        if (!this.acceleratorAvailable) {
          this.acceleratorAvailable = true;
        }
      }, 0);
    });
    window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
      if (!this.asyncTasksDone) {
        e.returnValue = false;
        this.$store.dispatch(this.isPip ? 'updatePipSize' : 'updateBrowsingSize', this.winSize);
        this.$store.dispatch(this.isPip ? 'updatePipPos' : 'updateBrowsingPos', this.winPos);
        asyncStorage.set('browsing', {
          pipSize: this.pipSize,
          pipPos: this.pipPos,
          browsingSize: this.browsingSize,
          browsingPos: this.browsingPos,
          barrageOpen: this.barrageOpen,
        }).finally(() => {
          this.asyncTasksDone = true;
          window.close();
        });
      } else if (this.quit) {
        this.$electron.remote.app.quit();
      }
    });
    (document.querySelector('#app') as HTMLElement).addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (this.isPip) {
          this.timeout = false;
          if (this.timer) {
            clearTimeout(this.timer);
          }
        }
      }, 50);
    });
    window.addEventListener('mousemove', () => {
      if (this.isPip && !this.pipBtnsKeepShow && this.isFocused) {
        this.timeout = true;
        if (this.timer) {
          clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
          this.timeout = false;
        }, 3000);
      }
    });
    this.$bus.$on('back-to-landingview', () => {
      this.backToLandingView = true;
      this.$router.push({
        name: 'landing-view',
      });
    });
    this.$refs.webView.addEventListener('load-commit', () => {
      const loadUrl = this.$refs.webView.getURL();
      this.currentUrl = loadUrl;
      const recordIndex = this.supportedRecordHost.indexOf(urlParseLax(loadUrl).hostname);
      if (recordIndex !== -1) {
        switch (recordIndex) {
          case 0:
            this.updateRecordUrl({ youtube: loadUrl });
            break;
          case 1:
            this.updateRecordUrl({ bilibili: loadUrl });
            break;
          case 2:
            this.updateRecordUrl({ iqiyi: loadUrl });
            break;
          default:
            break;
        }
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.$refs.webView.addEventListener('ipc-message', (evt: any) => { // https://github.com/electron/typescript-definitions/issues/27 fixed in 6.0.0
      const { channel, args }: { channel: string, args:
      { dragover?: boolean,
        files?: string[],
        isFullScreen?: boolean,
        windowSize?: number[] | null,
        x?: number,
        y?: number,
        url?: string,
        targetName?: string,
      }[] } = evt;
      switch (channel) {
        case 'open-url':
          this.handleOpenUrl(args[0]);
          break;
        case 'dragover':
        case 'dragleave':
          this.maskToShow = args[0].dragover;
          break;
        case 'drop':
          this.maskToShow = false;
          if ((args[0].files as string[]).length) {
            this.dropFiles = args[0].files;
          }
          break;
        case 'mousemove':
          if (this.isPip) {
            this.timeout = true;
            if (this.timer) {
              clearTimeout(this.timer);
            }
            this.timer = setTimeout(() => {
              this.timeout = false;
            }, 3000);
          }
          break;
        case 'left-drag':
          if (this.isPip) {
            if (args[0].windowSize) {
              this.$electron.ipcRenderer.send('callMainWindowMethod', 'setBounds', [{
                x: args[0].x,
                y: args[0].y,
                width: args[0].windowSize[0],
                height: args[0].windowSize[1],
              }]);
            } else {
              this.$electron.ipcRenderer.send('callMainWindowMethod', 'setPosition', [args[0].x, args[0].y]);
            }
          }
          break;
        case 'fullscreenchange':
          this.headerToShow = !args[0].isFullScreen;
          break;
        case 'keydown':
          if (['INPUT', 'TEXTAREA'].includes(args[0].targetName as string)) {
            this.acceleratorAvailable = false;
          }
          break;
        default:
          console.warn(`Unhandled ipc-message: ${channel}`, args);
          break;
      }
    });
    this.$electron.ipcRenderer.on('quit', () => {
      this.quit = true;
    });
    this.$refs.webView.addEventListener('dom-ready', () => { // for webview test
      window.focus();
      this.$refs.webView.focus();
      if (process.env.NODE_ENV === 'development') this.$refs.webView.openDevTools();
    });
    // https://github.com/electron/typescript-definitions/issues/27 fixed in 6.0.0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.$refs.webView.addEventListener('new-window', (e: any) => {
      if (e.disposition !== 'new-window') {
        this.handleOpenUrl(e);
      }
    });
    this.$refs.webView.addEventListener('did-start-loading', () => {
      this.startTime = new Date().getTime();
      this.loadingState = true;
    });
    this.$refs.webView.addEventListener('did-stop-loading', () => {
      const loadingTime: number = new Date().getTime() - this.startTime;
      if (loadingTime % 3000 === 0) {
        this.loadingState = false;
      } else {
        setTimeout(() => {
          this.loadingState = false;
        }, 3000 - (loadingTime % 3000));
      }
    });
  },
  beforeDestroy() {
    if (this.isPip) this.menuService.updateMenuItemEnabled('browsing.window.keepPipFront', false);
    asyncStorage.set('browsing', {
      pipSize: this.pipSize,
      pipPos: this.pipPos,
      browsingSize: this.browsingSize,
      browsingPos: this.browsingPos,
      barrageOpen: this.barrageOpen,
    }).then(() => {
      this.$store.dispatch(this.isPip ? 'updatePipSize' : 'updateBrowsingSize', this.winSize);
      this.$store.dispatch(this.isPip ? 'updatePipPos' : 'updateBrowsingPos', this.winPos);
      this.updateIsPip(false);
    }).finally(() => {
      if (this.backToLandingView) {
        windowRectService.uploadWindowBy(false, 'landing-view');
      }
    });
  },
  methods: {
    ...mapActions({
      updateInitialUrl: browsingActions.UPDATE_INITIAL_URL,
      updateRecordUrl: browsingActions.UPDATE_RECORD_URL,
      updateBarrageOpen: browsingActions.UPDATE_BARRAGE_OPEN,
      updateIsPip: browsingActions.UPDATE_IS_PIP,
    }),
    handleOpenUrl({ url }: { url: string }) {
      if (!url || url === 'about:blank') return;
      if (this.isPip) {
        this.updateIsPip(false);
      }
      this.updateInitialUrl(url);
    },
    pipAdapter() {
      const parseUrl = urlParseLax(this.currentUrl);
      if (parseUrl.host.includes('youtube')) {
        this.pipType = 'youtube';
        this.youtubeAdapter();
      } else if (parseUrl.host.includes('bilibili')) {
        this.pipType = 'bilibili';
        this.bilibiliAdapter();
      } else if (parseUrl.host.includes('iqiyi')) {
        this.pipType = 'iqiyi';
        this.iqiyiAdapter();
      } else {
        this.pipType = 'others';
        this.othersAdapter();
      }
    },
    handleMouseenter() {
      this.pipBtnsKeepShow = true;
      this.timeout = true;
      if (this.timer) {
        clearTimeout(this.timer);
      }
    },
    handleMouseleave() {
      this.pipBtnsKeepShow = false;
    },
    handleWindowChangeEnterPip() {
      const newDisplayId = this.$electron.screen
        .getDisplayNearestPoint({ x: this.winPos[0], y: this.winPos[1] }).id;
      const useDefaultPosition = !this.pipPos.length || this.oldDisplayId !== newDisplayId;
      this.oldDisplayId = newDisplayId;
      this.$refs.webView.executeJavaScript(this.getVideoStyle, (result: CSSStyleDeclaration) => {
        const videoAspectRatio = parseFloat(result.width as string)
          / parseFloat(result.height as string);
        this.$electron.ipcRenderer.send('callMainWindowMethod', 'setAspectRatio', [videoAspectRatio]);
        this.$electron.ipcRenderer.send('callMainWindowMethod', 'setMinimumSize', [420, Math.round(420 / videoAspectRatio)]);
        if (useDefaultPosition) {
          this.$store.dispatch('updatePipPos', [window.screen.availLeft + 70,
            window.screen.availTop + window.screen.availHeight - 236 - 70])
            .then(() => {
              this.$electron.ipcRenderer.send('callMainWindowMethod', 'setPosition', [window.screen.availLeft + 70,
                window.screen.availTop + window.screen.availHeight - 236 - 70]);
            });
        } else {
          this.$electron.ipcRenderer.send('callMainWindowMethod', 'setPosition', this.pipPos);
        }
        const calculateSize = this.pipSize[0] / this.pipSize[1] >= videoAspectRatio
          ? [this.pipSize[0], Math.round(this.pipSize[0] / videoAspectRatio)]
          : [Math.round(this.pipSize[1] * videoAspectRatio), this.pipSize[1]];
        this.$electron.ipcRenderer.send('callMainWindowMethod', 'setSize', calculateSize);
      });
    },
    handleWindowChangeExitPip() {
      const newDisplayId = this.$electron.screen
        .getDisplayNearestPoint({ x: this.winPos[0], y: this.winPos[1] }).id;
      if (this.oldDisplayId !== newDisplayId) {
        windowRectService.calculateWindowRect(
          this.browsingSize,
          true,
          this.winPos.concat(this.winSize),
        );
      } else {
        this.$electron.ipcRenderer.send('callMainWindowMethod', 'setSize', this.browsingSize);
        this.$electron.ipcRenderer.send('callMainWindowMethod', 'setPosition', this.browsingPos);
      }
      this.oldDisplayId = newDisplayId;
      this.$electron.ipcRenderer.send('callMainWindowMethod', 'setAspectRatio', [0]);
      this.$electron.ipcRenderer.send('callMainWindowMethod', 'setMinimumSize', [570, 375]);
    },
    handleDanmuDisplay() {
      if (this.pipType === 'iqiyi') {
        this.updateBarrageOpen(!this.barrageOpen);
        this.$refs.webView.executeJavaScript(this.iqiyiBarrage);
      } else if (this.pipType === 'bilibili') {
        this.updateBarrageOpen(!this.barrageOpen);
        this.$refs.webView.executeJavaScript(this.bilibiliBarrage);
      }
    },
    handleUrlForward() {
      if (this.$refs.webView.canGoForward()) {
        this.$refs.webView.goForward();
      }
    },
    handleUrlBack() {
      if (this.$refs.webView.canGoBack()) {
        this.$refs.webView.goBack();
      }
    },
    handleUrlReload() {
      this.$refs.webView.reload();
      if (this.isPip) {
        this.pipRestore = true;
      }
    },
    handleEnterPip() {
      if (this.hasVideo) {
        this.updateIsPip(true);
      }
    },
    handleExitPip() {
      if (this.isPip) {
        this.updateIsPip(false);
      }
    },
    othersAdapter() {
      this.handleWindowChangeEnterPip();
      this.$refs.webView.executeJavaScript(this.othersPip.adapter);
    },
    othersWatcher() {
      this.$refs.webView.executeJavaScript(this.othersPip.watcher);
    },
    othersRecover() {
      this.$refs.webView.executeJavaScript(this.othersPip.recover);
    },
    iqiyiAdapter() {
      this.handleWindowChangeEnterPip();
      this.$refs.webView.executeJavaScript(this.iqiyiPip.adapter);
    },
    iqiyiWatcher() {
      this.$refs.webView.executeJavaScript(this.iqiyiPip.watcher);
    },
    iqiyiRecover() {
      this.$refs.webView.executeJavaScript(this.iqiyiPip.recover);
    },
    youtubeAdapter() {
      this.handleWindowChangeEnterPip();
      this.$refs.webView.executeJavaScript(youtube.adapter);
    },
    youtubeRecover() {
      this.$refs.webView.executeJavaScript(youtube.recover);
    },
    bilibiliAdapter() {
      this.$refs.webView.executeJavaScript(bilibiliFindType, (r: (HTMLElement | null)[]) => {
        this.bilibiliType = ['bangumi', 'videoStreaming', 'iframeStreaming', 'video'][r.findIndex(i => i)] || 'others';
      }).then(() => {
        this.handleWindowChangeEnterPip();
        this.$refs.webView.executeJavaScript(this.bilibiliPip.adapter);
      });
    },
    bilibiliWatcher() {
      this.$refs.webView.executeJavaScript(this.bilibiliPip.watcher);
    },
    bilibiliRecover() {
      this.$refs.webView.executeJavaScript(this.bilibiliPip.recover);
    },
  },
};
</script>

<style scoped lang="scss">
.browsing {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  .web-view {
    flex: 1;
    background: rgba(255, 255, 255, 1);
  }
  .loading-state {
    width: 100%;
    height: 36px;
    position: absolute;
    background-image: linear-gradient(-90deg, #414141 18%, #555555 34%,
      #626262 51%, #626262 56%, #555555 69%, #414141 86%);
  }
  .pip-buttons {
    width: 20px;
    height: auto;
    display: flex;
    padding: 22px 15px 22px 15px;
    border-radius: 40px;
    flex-direction: column;
    justify-content: space-between;
    position: absolute;
    right: 15px;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.4);
    z-index: 100;
  }
}
.loading-animation {
  animation: loading 3s linear 1 normal forwards;
  animation-iteration-count: infinite;
}
.control-show-animation {
  animation: control-show 100ms linear 1 normal forwards;
}
.control-hide-animation {
  animation: control-hide 100ms linear 1 normal forwards;
}
@keyframes loading {
  0% { transform: translateX(-100%) }
  25% { transform: translateX(-50%) }
  50% { transform: translateX(0%) }
  75% { transform: translateX(50%) }
  100% { transform: translateX(100%) }
}
@keyframes control-show {
  0% { transform: translate(-50%, 110px) }
  50% { transform: translate(-50%, 55px) }
  100% { transform: translate(-50%, 0px) }
}
@keyframes control-hide {
  0% { transform: translate(-50%, 0px) }
  50% { transform: translate(-50%, 55px) }
  100% { transform: translate(-50%, 110px) }
}
</style>
