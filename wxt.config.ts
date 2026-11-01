import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: {
    name: '.torrent to Transmission',
    description: 'Automagically add, access and control torrents with Chrome.',
    minimum_chrome_version: '120',
    permissions: ['contextMenus', 'notifications', 'storage', 'alarms'],
    // The Transmission server address is user-configured and "send .torrent
    // file" downloads from arbitrary sites, so broad host access is required.
    host_permissions: ['http://*/*', 'https://*/*'],
    icons: {
      16: 'img/icon-bitty.png',
      48: 'img/icon-small.png',
      128: 'img/icon-large.png',
    },
    action: {
      default_icon: 'img/icon-bitty.png',
      default_title: '.torrent to Transmission',
    },
  },
});
