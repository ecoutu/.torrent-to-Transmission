# Chrome Web Store listing — 1.2.0

Copy each section into the matching field in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Images are in `store/images/` (regenerate with `npm run build && npm run store:assets`).

---

## Store listing tab

### Name
```
.torrent to Transmission
```

### Summary (132 characters max)
```
Send magnet and .torrent links to your Transmission server and manage downloads from your toolbar. Light and dark themes.
```

### Category
Tools (Productivity)

### Language
English

### Description
```
Send magnet links and .torrent files to your own Transmission server, and keep an eye on your downloads, right from Chrome.

SEND LINKS FROM ANY PAGE
• Right-click a magnet or .torrent link and choose "Send to Transmission"
• Pick a download location from the submenu (Movies, TV, Linux ISOs… you name them)
• Optionally, send magnet links with a normal click
• Works with private trackers: the extension can download the .torrent file with your browser's login

MANAGE TORRENTS FROM THE TOOLBAR
• Live download/upload speeds, progress, time left and ratio
• Filter by Downloading, Seeding or Paused, and search large lists
• Pause, resume, verify, reorder the queue, move between folders, or remove with or without files
• Paste a magnet link or .torrent URL to add it, into the folder you choose
• Toggle Transmission's alternative speed limits ("turtle mode")
• Toolbar badge with downloading/seeding counts, and notifications when downloads finish

NEW IN 1.2
• Redesigned popup and settings, with automatic light and dark themes
• Download locations: send torrents straight into the right folder
• Add torrents from the popup, and move torrents between folders
• Clear messages when a torrent is already added, can't be moved, or the server can't be reached, with one-click Retry
• Optional magnet-link clicking
• Privacy: the extension only asks for access to your Transmission server; access to other sites is requested only if you turn on a feature that needs it
• Fixes: torrents now show when the popup opens, magnet links are added reliably, and sizes and speeds are correct on Transmission 4

SETUP
1. Enable remote access (the web interface) in Transmission's preferences.
2. Open the extension's settings, enter your RPC address (usually http://<host>:9091/transmission/rpc) and your username/password if you use one.
3. Click "Save & connect" and allow access to your server.

PRIVACY
No analytics, no tracking, no developer servers. Settings stay in your browser, and the extension only talks to the Transmission server you configure. Full policy: https://github.com/ecoutu/.torrent-to-Transmission/blob/master/PRIVACY.md

OPEN SOURCE
https://github.com/ecoutu/.torrent-to-Transmission. Bug reports and contributions are welcome.

This is an independent extension. It is not made by or affiliated with the Transmission project.
```

### Graphic assets
| Field | File |
|---|---|
| Store icon (128×128) | `public/img/icon-large.png` (unchanged) |
| Screenshot 1 | `store/images/screenshot-01-popup.png` |
| Screenshot 2 | `store/images/screenshot-02-send-links.png` |
| Screenshot 3 | `store/images/screenshot-03-add-torrent.png` |
| Screenshot 4 | `store/images/screenshot-04-manage.png` |
| Screenshot 5 | `store/images/screenshot-05-setup.png` |
| Small promo tile (440×280) | `store/images/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `store/images/promo-marquee-1400x560.png` |

### Additional fields
- **Homepage URL:** https://github.com/ecoutu/.torrent-to-Transmission
- **Support URL:** https://github.com/ecoutu/.torrent-to-Transmission/issues

---

## Privacy practices tab

### Single purpose
```
Send magnet and .torrent links to the user's own Transmission BitTorrent server and view and control that server's torrents from the browser toolbar.
```

### Permission justifications
**contextMenus**
```
Adds "Send to Transmission" (with an optional download-location submenu) to the right-click menu on links, so users can send a magnet or .torrent link to their Transmission server.
```

**notifications**
```
Shows a desktop notification when a torrent is added from the right-click menu (or fails to be added) and when a download finishes. Users can turn notifications off in settings.
```

**storage**
```
Saves the user's settings (Transmission server address, credentials, download locations, preferences) and caches the torrent list so the popup opens instantly.
```

**alarms**
```
Periodically refreshes torrent status in the background to update the toolbar badge and to notify the user when a download finishes.
```

**scripting**
```
Registers a small content script only when the user turns on "Send magnet links when clicked". It listens for clicks on magnet: links and sends that link to the user's Transmission server. It reads no other page content.
```

**Host permissions (optional_host_permissions: http://*/*, https://*/*)**
```
Host access is optional and requested at runtime. The extension asks for access to the host of the user's own Transmission server, which can be any address the user configures (localhost, a LAN IP, a NAS or a remote server). Access to all sites is requested only if the user turns on "Download .torrent files in the browser" (to fetch the .torrent file from the site, with the user's login, for private trackers) or "Send magnet links when clicked" (to detect magnet link clicks).
```

### Remote code
**No, I am not using remote code.** All JavaScript is bundled in the package.

### Data usage
The extension has no developer servers and sends nothing to the developer. It sends the user's Transmission credentials only to the user's own Transmission server, which is the extension's purpose. Recommended answers:
- **Authentication information:** checked (Transmission username/password, stored locally and sent only to the user's server)
- All other categories: unchecked
- Certify all three statements: not sold to third parties, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending.

### Privacy policy URL
```
https://github.com/ecoutu/.torrent-to-Transmission/blob/master/PRIVACY.md
```
