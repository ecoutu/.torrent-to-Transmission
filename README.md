# .torrent to Transmission Chrome Extension

A Chrome extension that allows you to automatically add torrent files and magnet links to your Transmission BitTorrent client directly from your browser.

## Features

- **Right-click Integration**: Right-click on any torrent link or magnet link to add it directly to Transmission
- **Popup Interface**: View and manage your torrents from a convenient popup window
- **Real-time Updates**: Monitor download/upload speeds and torrent status
- **Notification Support**: Get desktop notifications when torrents complete
- **Turtle Mode**: Toggle Transmission's alternative speed limits
- **Custom Paths**: Configure additional download paths
- **WebUI Access**: Quick access to Transmission's web interface

## Installation

### From Source
1. Clone or download this repository
2. Install dependencies and build: `npm install && npm run build`
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the `.output/chrome-mv3` directory
6. The extension will appear in your browser toolbar

### Configuration
1. Click the extension icon in your toolbar
2. Click the "Options" link to configure:
   - **RPC URL**: Your Transmission RPC endpoint (default: `http://localhost:9091/transmission/rpc`)
   - **Web URL**: Your Transmission web interface URL (default: `http://localhost:9091`)
   - **Username/Password**: If your Transmission requires authentication
   - **Notification Settings**: Enable/disable notifications and set duration
   - **Refresh Rate**: How often to update torrent status (in seconds)
   - **Additional Paths**: Configure custom download directories

## Usage

### Adding Torrents
- **Method 1**: Right-click on any torrent link and select ".torrent To Transmission"
- **Method 2**: Right-click on magnet links and select ".torrent To Transmission"

### Managing Torrents
- Click the extension icon to view the popup interface
- Use the navigation tabs to filter torrents (All, Downloading, Seeding, Paused)
- Control individual torrents with pause/resume/remove buttons
- Use "Pause All" or "Resume All" for bulk operations
- Click the turtle icon to toggle alternative speed limits

### Monitoring
- View real-time download/upload speeds in the popup
- Get desktop notifications when torrents complete (if enabled)
- Monitor torrent progress with visual progress bars

## Requirements

- Chrome 120 or newer
- Transmission BitTorrent client with RPC enabled
- Network access to your Transmission instance

### Transmission Setup
Make sure your Transmission daemon is configured to accept RPC connections:

1. **Enable RPC** in Transmission settings
2. **Set RPC port** (default: 9091)
3. **Configure authentication** if desired
4. **Allow RPC from your IP** (whitelist or disable whitelist for local access)

Example Transmission settings:
```json
{
    "rpc-enabled": true,
    "rpc-port": 9091,
    "rpc-whitelist-enabled": false,
    "rpc-authentication-required": false
}
```

## Permissions

This extension requires the following permissions:
- **contextMenus**: To add right-click menu options
- **notifications**: To show desktop notifications
- **storage**: To save your settings and torrent data
- **alarms**: To periodically update torrent status
- **host_permissions**: To communicate with your Transmission server

### Why Host Permissions Are Required

The extension requests access to `http://*/*` and `https://*/*` for these specific reasons:

1. **Transmission Server Communication**: The extension needs to connect to your Transmission RPC endpoint, which could be running on any domain or IP address (localhost, local network IP, remote server, etc.)

2. **Flexible Server Configuration**: Users may run Transmission on:
   - Local servers (`http://localhost:9091`, `http://192.168.1.100:9091`)
   - Remote servers (`https://myserver.com:9091`)
   - Custom domains or ports

3. **Torrent File Downloads**: When you choose to send actual torrent files (instead of magnet links), the extension needs to download the .torrent file from the website you're browsing

**Important Security Notes:**
- The extension ONLY communicates with URLs you explicitly configure in the options
- No data is sent to any third-party servers
- All communication is limited to your Transmission server and torrent file downloads
- You can review the source code to verify these claims

If you're security-conscious, you can:
- Run Transmission on localhost only
- Use HTTPS for your Transmission server
- Review the network requests in Chrome DevTools

## Technical Details

- **Manifest Version**: 3 (modern Chrome extension format)
- **Background**: Service worker for efficient resource usage
- **Storage**: Uses Chrome's storage API instead of localStorage
- **Network**: Modern fetch API for HTTP requests
- **Language**: TypeScript, built with [WXT](https://wxt.dev)
- **UI**: Plain DOM APIs (no UI framework)
- **Refresh**: Background refresh via `chrome.alarms` (minimum 30 seconds); the popup refreshes at the configured rate while open

## File Structure

```
├── wxt.config.ts                # WXT config (generates manifest.json)
├── public/img/                  # Extension icons and images
├── src/
│   ├── entrypoints/
│   │   ├── background.ts        # Service worker (context menu, badge, notifications)
│   │   ├── popup/               # Popup interface (index.html, main.ts, style.css)
│   │   └── options/             # Settings page (index.html, main.ts, style.css)
│   └── utils/
│       ├── transmission.ts      # Transmission RPC communication and shared types
│       └── format.ts            # Size/speed/ETA formatting
└── tests/                       # Vitest unit tests
```

## Development

| Command | Description |
|---|---|
| `npm run dev` | Launch Chrome with the extension loaded and hot reload |
| `npm run build` | Production build in `.output/chrome-mv3` |
| `npm run zip` | Build a zip for the Chrome Web Store |
| `npm run compile` | Type-check with `tsc` |
| `npm test` | Run unit tests |

CI (`.github/workflows/ci.yml`) runs type-check, tests and build on every pull request. On merge to `master` it also builds the Chrome Web Store zip and attaches it to the workflow run as an artifact.

### Testing
1. Run `npm test` and `npm run compile`
2. Load `.output/chrome-mv3` in developer mode and point it at your Transmission instance
3. Test right-click functionality on torrent and magnet links
4. Verify popup interface and settings work correctly

### Debugging
- Use Chrome DevTools to debug popup and options pages
- Check the service worker in `chrome://extensions/` for background script debugging
- Monitor network requests in DevTools to troubleshoot RPC communication

## Troubleshooting

### Common Issues

**Extension can't connect to Transmission**
- Verify Transmission is running and RPC is enabled
- Check the RPC URL in extension options
- Ensure no firewall is blocking the connection
- "forbidden" errors mean Transmission rejected the client: add your machine to `rpc-whitelist` (or disable `rpc-whitelist-enabled`), and if you use a hostname, add it to `rpc-host-whitelist`

**Torrents not appearing in popup**
- Check that Transmission RPC is responding correctly
- Verify authentication credentials if required
- Look for errors in browser console

**Notifications not working**
- Check that notifications are enabled in extension options
- Verify Chrome has permission to show notifications
- Check your system's notification settings

**Right-click menu not appearing**
- Reload the extension
- Check that you're right-clicking on actual torrent/magnet links
- Verify the extension has contextMenus permission

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Privacy Policy

We take your privacy seriously. This extension stores all data locally on your device and does not collect any personal information. For complete details, please see our [Privacy Policy](PRIVACY.md).

## License

This project is open source. Please check the repository for license details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Chrome extension developer documentation
3. Check Transmission RPC documentation
4. Open an issue in the project repository
