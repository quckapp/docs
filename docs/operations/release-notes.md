---
sidebar_position: 3
---

# Release Notes

## Release Notes Format

Each release includes:
- **Version**: Semantic versioning (MAJOR.MINOR.PATCH)
- **Date**: Release date
- **New Features**: Added functionality
- **Improvements**: Enhanced functionality
- **Bug Fixes**: Resolved issues
- **Breaking Changes**: Changes requiring migration
- **Known Issues**: Outstanding issues

---

## v2.4.0 (2024-01-15)

### New Features
- **End-to-End Encryption**: Optional E2E encryption for messages and files
- **Huddles**: Audio-only rooms in channels for quick discussions
- **Message Scheduling**: Schedule messages for later delivery
- **Custom Emojis**: Upload and use workspace-specific emojis

### Improvements
- Search performance improved by 40%
- Message rendering 2x faster
- Reduced mobile app size by 25%
- Improved accessibility (WCAG 2.1 AA compliant)

### Bug Fixes
- Fixed message ordering in high-traffic channels
- Fixed SSO logout not clearing all sessions
- Fixed file preview not loading for PDFs
- Fixed notification badge count incorrect

### Breaking Changes
- API v1 deprecated (use v2)
- Minimum iOS version: 14.0 (was 13.0)
- WebSocket protocol updated to v2

### Known Issues
- Screen sharing may have latency on Firefox
- Large file uploads (>1GB) may timeout on slow connections

---

## v2.3.0 (2023-12-01)

### New Features
- **Thread Notifications**: Follow threads and get notified of replies
- **Message Reactions**: React to messages with any emoji
- **User Status**: Set custom status with expiry
- **Keyboard Shortcuts**: Full keyboard navigation support

### Improvements
- Mobile push notification reliability improved
- Channel loading 3x faster
- Search now includes file contents
- Admin dashboard redesigned

### Bug Fixes
- Fixed duplicate messages on reconnect
- Fixed @mention not highlighting correctly
- Fixed channel archive not hiding from sidebar
- Fixed timezone display in message timestamps

### Breaking Changes
- Removed legacy webhook format
- Changed user status API response format

---

## v2.2.0 (2023-10-15)

### New Features
- **1:1 Video Calls**: WebRTC-based video calling
- **Screen Sharing**: Share screen during calls
- **File Comments**: Comment on shared files
- **Channel Sections**: Organize channels in custom sections

### Improvements
- Initial load time reduced by 50%
- Memory usage reduced by 30%
- Better offline message queuing
- Improved error messages

### Bug Fixes
- Fixed message search pagination
- Fixed user avatar not updating
- Fixed notification sound not playing
- Fixed dark mode color issues

---

## v2.1.0 (2023-08-01)

### New Features
- **Threads**: Reply to messages in threads
- **Pin Messages**: Pin important messages in channels
- **Bookmarks**: Save messages for later
- **DM Groups**: Group direct messages with multiple users

### Improvements
- Message editing UX improved
- Better handling of large channels
- Improved mobile keyboard handling

### Bug Fixes
- Fixed mention autocomplete lag
- Fixed image upload orientation
- Fixed search not finding special characters

---

## v2.0.0 (2023-06-01)

### New Features
- **Complete UI Redesign**: Modern, responsive interface
- **Dark Mode**: System-wide dark theme support
- **Mobile Apps**: Native iOS and Android apps
- **SSO**: SAML 2.0 and OIDC support
- **Admin Console**: Full admin management interface

### Breaking Changes
- New API v2 (v1 deprecated)
- New WebSocket protocol
- Database schema migration required
- New authentication flow

### Migration Guide
See the deployment guide for migration steps.

---

## v1.x Releases

### v1.5.0 (2023-04-01)
- Added file sharing
- Added user presence
- Performance improvements

### v1.0.0 (2023-01-15)
- Initial release
- Basic messaging
- Channels and DMs
- User management

---

## Versioning Policy

QuikApp follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (X.Y.0): New features, backwards compatible
- **PATCH** (X.Y.Z): Bug fixes, backwards compatible

## Release Schedule

| Type | Frequency | Examples |
|------|-----------|----------|
| Major | Yearly | v2.0, v3.0 |
| Minor | Monthly | v2.1, v2.2 |
| Patch | As needed | v2.1.1, v2.1.2 |
| Hotfix | Emergency | v2.1.1-hotfix |

## Support Policy

| Version | Status | Support Until |
|---------|--------|---------------|
| v2.4.x | Current | Active |
| v2.3.x | LTS | Dec 2024 |
| v2.2.x | Maintenance | Jun 2024 |
| v2.1.x | End of Life | - |
| v1.x | End of Life | - |
