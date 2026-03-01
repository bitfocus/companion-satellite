# Companion Satellite Provisioning

`satellite.yml` is an Ansible playbook that deploys [Companion Satellite](https://bitfocus.io/companion-satellite) to a Debian-based host (or 100 of them, if you want). It is an alternative to the curl-pipe-bash `install.sh` and subsequent `update.sh` path found in the [pi-image/ directory](../pi-image). This modern solution is fully declarative, idempotent, and suitable for managing fleets of satellites from a single control node.

Supports arm64 (e.g. Raspberry Pi) and x86_64.

## Quick start

1. Edit the ansible inventory with your satellite host(s)
```
cp inventory.example inventory
vim inventory
```

2. Provision
```
cd satellite-provisioning
ansible-playbook satellite.yml
```

## Variables

Change these values before running the playbook if you'd like.

| Variable | Default | Description |
|----------|---------|-------------|
| `companion_ip` | `127.0.0.1` | IP address of the Companion instance to connect to |
| `branch` | `stable` | Release branch (or `beta`) (used to query the Bitfocus API) |
| `node_version` | `24.13.0` | Node.js version to install |
| `satellite_version` | *(latest from API)* | Pin a specific satellite version (also requires `satellite_url`) |
| `satellite_url` | *(latest from API)* | Download URL for a pinned satellite version |

Alternatively, you can override these vars at run time with `-e`:

```bash
ansible-playbook satellite.yml -e companion_ip=10.0.0.10
ansible-playbook satellite.yml -e branch=beta
```

## What it deploys

- **System dependencies**: libusb, libudev, cmake, libfontconfig1, curl, wget, unzip
- **Node.js**: Pinned version installed to `/opt/node` from official tarball (arch-detected)
- **Companion Satellite**: Build from the [Bitfocus API](https://api.bitfocus.io), extracted to `/opt/companion-satellite`
- **udev rules**: Stream Deck / surface USB device permissions (`50-satellite.rules`)
- **systemd service**: `satellite.service` running as the `satellite` user (in the `dialout` group)
- **Boot config**: `/boot/satellite-config` with `COMPANION_IP` (handles newer RPi OS `/boot/firmware` path)

## Updating

Simply re-run the playbook to pick up the latest build for the configured branch. The playbook queries the Bitfocus API and skips the download if the installed version already matches.

Otherwise, to pin a specific version:

```bash
ansible-playbook satellite.yml \
  -e satellite_version=v2.6.0 \
  -e satellite_url=https://s4.bitfocus.io/builds/companion-satellite/companion-satellite-arm64-559-eb78b78.tar.gz
```

## Differences from install.sh / update.sh

This playbook is a standalone, declarative provisioning path. It installs Node.js directly from the official tarball (no fnm) and does not clone the companion-satellite git repo. This means:

- **No helper scripts**: `satellite-update`, `satellite-help`, `satellite-license`, and `satellite-edit-config` are not available. Updates are done by re-running the playbook.
- **No motd**: The SSH login banner is not modified.
- **No fnm**: Node.js is managed directly; version changes are made by editing the `node_version` variable.

These trade-offs keep the installation lightweight and fully managed by Ansible.
