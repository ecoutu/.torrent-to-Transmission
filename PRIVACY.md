# Privacy Policy for .torrent to Transmission Chrome Extension

**Effective Date:** August 7, 2025
**Last Updated:** August 7, 2025

## Overview

This privacy policy describes how the .torrent to Transmission Chrome Extension ("the Extension", "we", "us") collects, uses, and protects your information. We are committed to protecting your privacy and being transparent about our data practices.

## Information We Collect

### Locally Stored Data
The Extension stores the following information locally on your device using Chrome's storage API:

- **Transmission Server Configuration:**
  - RPC URL (server endpoint)
  - Web UI URL
  - Username and password (if authentication is enabled)

- **User Preferences:**
  - Notification settings (enabled/disabled, duration)
  - Refresh rate for torrent status updates
  - Selected torrent filter view (all, downloading, seeding, paused)
  - Additional download path configurations
  - File transfer preferences (send torrent file vs. magnet link)

- **Temporary Session Data:**
  - Transmission RPC session ID
  - Current torrent list and status information
  - Last server response status

### Data We Do NOT Collect
- **No Personal Information:** We do not collect any personally identifiable information
- **No Browsing History:** We do not track or store your browsing history
- **No Usage Analytics:** We do not collect analytics or usage statistics
- **No Third-Party Tracking:** We do not use any third-party tracking services
- **No Remote Storage:** All data is stored locally on your device only

## How We Use Information

The information stored by the Extension is used solely for:

1. **Connecting to Your Transmission Server:** Server credentials and URLs are used to establish communication with your BitTorrent client
2. **Maintaining User Preferences:** Settings are stored to provide a consistent user experience
3. **Displaying Torrent Information:** Torrent data is temporarily cached to display current status and manage downloads
4. **Providing Notifications:** Notification preferences are stored to deliver completion alerts according to your settings

## Data Storage and Security

### Local Storage Only
- All data is stored locally on your device using Chrome's secure storage API
- No information is transmitted to external servers (except your configured Transmission server)
- Data is only accessible to the Extension itself

### Your Transmission Server
- The Extension communicates directly with your Transmission server using the credentials you provide
- This communication is between your browser and your server only
- We do not have access to or store any information about these communications

### Security Measures
- Credentials are stored using Chrome's secure storage mechanisms
- All communication with Transmission servers uses the authentication methods you configure
- The Extension requests only the minimum permissions necessary for functionality

## Data Sharing and Disclosure

We do not share, sell, rent, or disclose any information to third parties because:
- We do not collect personal information
- All data remains on your local device
- We have no servers or databases that store user information

## Your Privacy Rights

You have complete control over your data:

### Access and Control
- All stored data can be viewed and modified through the Extension's options page
- You can clear all stored data by removing the Extension
- Settings can be changed or reset at any time

### Data Deletion
- Uninstalling the Extension removes all locally stored data
- You can manually clear specific settings through the options interface
- No data persists after Extension removal

## Permissions Explanation

The Extension requests the following permissions:

- **contextMenus:** To add right-click menu options for torrent links
- **notifications:** To show desktop notifications when torrents complete
- **storage:** To save your preferences and temporary session data locally
- **alarms:** To periodically update torrent status information
- **host_permissions:** To communicate with your Transmission server

These permissions are used solely for the Extension's functionality and not for data collection.

## Third-Party Services

### Chrome Extension Platform
- This Extension operates within Google Chrome's extension platform
- Google's privacy policy applies to Chrome's handling of extensions
- We do not have access to any data that Chrome may collect

### Your Transmission Server
- The Extension connects to Transmission servers that you configure
- Your Transmission server's privacy and security practices are independent of this Extension
- We recommend securing your Transmission server according to your privacy requirements

## Children's Privacy

This Extension does not knowingly collect information from users under 13 years of age. The Extension's functionality (BitTorrent client management) is typically used by adults. Parents should supervise children's use of any BitTorrent-related software.

## Changes to This Privacy Policy

We may update this privacy policy to reflect:
- Changes in Extension functionality
- Updates to Chrome extension requirements
- Clarifications or improvements to our privacy practices

When we make changes:
- The "Last Updated" date will be revised
- Significant changes will be noted in Extension update descriptions
- Continued use of the Extension constitutes acceptance of the updated policy

## International Users

This Extension can be used worldwide. Please note:
- All data processing occurs locally on your device
- No data is transferred internationally by the Extension
- Your local privacy laws apply to your use of the Extension

## Technical Implementation

### Chrome Storage API
- Uses Chrome's `chrome.storage.local` API for secure local storage
- Data is encrypted and sandboxed by Chrome's security model
- Storage is isolated from other extensions and websites

### Network Communications
- Only communicates with Transmission servers you explicitly configure
- Uses standard HTTP/HTTPS protocols as supported by Transmission
- No external network requests are made by the Extension

## Contact Information

For privacy-related questions or concerns:

1. **Technical Issues:** Check the Extension's GitHub repository for technical support
2. **Privacy Questions:** This Extension operates with minimal data collection by design
3. **General Inquiries:** Refer to the Extension's documentation and support resources

## Compliance

This Extension is designed to comply with:
- Chrome Web Store privacy requirements
- General data protection principles
- Minimal data collection best practices

## Data Retention

- **User Settings:** Retained until you change them or uninstall the Extension
- **Session Data:** Cleared when Chrome is closed or Extension is restarted
- **Temporary Cache:** Automatically expires and refreshes based on your refresh rate settings

## Open Source Transparency

This Extension's source code is available for review, allowing you to:
- Verify our privacy practices
- Understand exactly what data is used and how
- Contribute to improvements and security

---

**Summary:** The .torrent to Transmission Chrome Extension prioritizes your privacy by storing all data locally, collecting no personal information, and communicating only with your configured Transmission server. We do not track, analyze, or share any user data.
