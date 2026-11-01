import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifestVersion: 3,
  hooks: {
    // WXT adds runtime-registered content script matches to host_permissions;
    // keep host access optional (see optional_host_permissions).
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.host_permissions;
    },
  },
  manifest: ({ browser }) => ({
    name: '.torrent to Transmission',
    description: 'Automagically add, access and control torrents with Chrome.',
    permissions: ['contextMenus', 'notifications', 'storage', 'alarms', 'scripting'],
    // Host access is requested at runtime: the Transmission server's host when
    // settings are saved, and every site only if "send .torrent file" or
    // "send magnet links when clicked" is enabled.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    icons: {
      16: 'img/icon-bitty.png',
      48: 'img/icon-small.png',
      128: 'img/icon-large.png',
    },
    action: {
      default_icon: 'img/icon-bitty.png',
      default_title: '.torrent to Transmission',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'torrent-to-transmission@coutu.io',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : { minimum_chrome_version: '120' }),
  }),
});
