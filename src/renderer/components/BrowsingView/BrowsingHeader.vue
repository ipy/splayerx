<template>
  <div
    @dblclick="handleDbClick"
    class="header"
  >
    <browsing-control
      :handle-url-reload="handleUrlReload"
      :handle-url-back="handleUrlBack"
      :handle-url-forward="handleUrlForward"
      :back-type="backType"
      :forward-type="forwardType"
      :web-info="webInfo"
      :style="{
        order: isDarwin ? 1 : 2,
      }"
    />
    <browsing-favicons
      :record-url="recordUrl"
      :update-initial-url="updateInitialUrl"
      :style="{
        order: isDarwin ? 2 : 3,
      }"
    />
    <browsing-input
      v-show="showOpenUrl"
      :close-url-input="closeUrlInput"
      :play-file-with-playing-view="playFileWithPlayingView"
    />
    <div
      :style="{
        width: isDarwin ? '40px' : '50px',
        display: 'flex',
        zIndex: '6',
        order: isDarwin ? 3 : 1,
        webkitAppRegion: 'no-drag',
        cursor: webInfo.hasVideo ? 'pointer' : '',
      }"
    >
      <Icon
        :type="picInPicType"
        :style="{
          margin: isDarwin ? 'auto 10px auto auto' : 'auto auto auto 15px',
        }"
        @mouseup.native="handleEnterPip"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { mapActions, mapGetters } from 'vuex';
import { Browsing as browsingActions } from '@/store/actionTypes';
import BrowsingFavicons from '@/components/BrowsingView/BrowsingFavicons.vue';
import BrowsingInput from '@/components/BrowsingView/BrowsingInput.vue';
import BrowsingControl from '@/components/BrowsingView/BrowsingControl.vue';
import Icon from '@/components/BaseIconContainer.vue';

export default {
  name: 'BrowsingHeader',
  components: {
    'browsing-favicons': BrowsingFavicons,
    'browsing-input': BrowsingInput,
    'browsing-control': BrowsingControl,
    Icon,
  },
  props: {
    handleEnterPip: {
      type: Function,
      required: true,
    },
    handleUrlReload: {
      type: Function,
      required: true,
    },
    handleUrlBack: {
      type: Function,
      required: true,
    },
    handleUrlForward: {
      type: Function,
      required: true,
    },
  },
  data() {
    return {
      showOpenUrl: false,
      webInfo: {},
      backType: 'backDisabled',
      forwardType: 'forwardDisabled',
    };
  },
  computed: {
    ...mapGetters(['recordUrl', 'isMaximized']),
    picInPicType() {
      return this.webInfo.hasVideo ? 'pip' : 'pipDisabled';
    },
    isDarwin() {
      return process.platform === 'darwin';
    },
  },
  methods: {
    ...mapActions({
      updateInitialUrl: browsingActions.UPDATE_INITIAL_URL,
    }),
    handleDbClick() {
      if (!this.isMaximized) {
        this.$electron.ipcRenderer.send('callMainWindowMethod', 'maximize');
      } else {
        this.$electron.ipcRenderer.send('callMainWindowMethod', 'unmaximize');
      }
    },
    closeUrlInput() {
      this.$bus.$emit('open-url-show', false);
    },
    playFileWithPlayingView(inputUrl: string) {
      if (this.openFileByPlayingView(inputUrl)) {
        this.openUrlFile(inputUrl);
      } else {
        this.updateInitialUrl(inputUrl);
      }
    },
    updateWebInfo(info: {
      hasVideo: boolean, url: string, canGoBack: boolean, canGoForward: boolean
    }) {
      this.webInfo = info;
      this.backType = info.canGoBack ? 'back' : 'backDisabled';
      this.forwardType = info.canGoForward ? 'forward' : 'forwardDisabled';
    },
  },
};
</script>

<style scoped lang="scss">
.header {
  width: 100%;
  height: 36px;
  display: flex;
  background: rgba(65, 65, 65, 1);
}
</style>
