# IMP — important local files

Keep credentials, SSH keys, and ops notes here. This folder is outside git. Do not copy it into any repository.

OpenSSH still uses `~/.ssh` for live connections. Files here are the durable backup.

## Inventory

### IE Orbit / InterServer VPS

| File | Purpose |
| --- | --- |
| `ie_platform_interserver` | Private SSH key (mode 600). Same key as `~/.ssh/ie_platform_interserver`. |
| `ie_platform_interserver.pub` | Public SSH key. |
| `hostinger-mail.txt` | Hostinger SMTP mailbox used by production Django. |
| `vps-platform-admin.txt` | Production Platform Admin login (`indiansempiregroup@gmail.com`). |

Add new important files to this folder and list them in this table.

## Connect

Host alias in `~/.ssh/config`: `ie-orbit-vps`

```bash
ssh ie-orbit-vps
```
