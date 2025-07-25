## Companion Satellite

[![License](https://img.shields.io/github/license/bitfocus/companion-satellite)](https://github.com/bitfocus/companion-satellite/blob/main/LICENSE)
[![Version](https://img.shields.io/github/v/release/bitfocus/companion-satellite)](https://github.com/bitfocus/companion-satellite/releases)

A small application to allow for connecting a streamdeck to [Bitfocus Companion](https://github.com/bitfocus/companion) over a network.

Companion 3.4.0 and newer are supported

Each surface will appear in companion as its own 'satellite' surface, and can be configured as if they are local.

Note: This connects over the satellite surface api which uses port TCP 16622.

[![Satellite Getting Started](http://img.youtube.com/vi/eNnUxRl4yP4/0.jpg)](http://www.youtube.com/watch?v=eNnUxRl4yP4 'Remote Stream Deck control with Companion Satellite')

## Getting started

You can find installers on the [Bitfocus website](https://user.bitfocus.io/download)

### Raspberry Pi

A prebuilt image is available on the [Bitfocus website](https://user.bitfocus.io/download).

After writing the image to an sd card, edit the satellite-config file in the boot partition to point to your companion instance. Configuration can also be done through the web interface, running on port 9999.  
If mdns works on your network, Companion will discover your Satellite, and will offer to configure it for you.

### Desktop

This application can be built with electron to provide a minimal ui and to allow for minimising to the system tray.
You can right click the tray icon to:

- Set the ip address of the companion instance to connect to
- Force a manual scan for surfaces. This is done automatically when a new surface is detected, but it can sometimes miss some

To manually build the latest version for your machine:

- `yarn install`
- `yarn dist`
- Locate the output under `electron-output/`

### Manual Headless / Raspberry pi

If using a Raspberry Pi, we recommend using the 64bit 'Raspberry Pi OS Lite' images, the non-64bit version should work too but it less tested.  
If using a different brand SBC, we recommend running [Armbian](https://www.armbian.com/) specifically the minimal debian images, as this provides a minimal and consistent debian environment and are typically more up to date then the manufacturer images.

It can be built and run as a systemd service on a pi or other linux machine

No images are provided for this, but the process has been written to be a single script.

Switch to the root user, if required:

```
sudo -i
```

As root, run the following:

```
curl https://raw.githubusercontent.com/bitfocus/companion-satellite/main/pi-image/install.sh | bash
```

After this, you can use `sudo satellite-update` to change the version it has installed. Note: this is currently not fully implemented.

Note: This script will create a new user called `satellite`, which Satellite will be run as and will own the configuration.

## Configuration

Once installation is complete, configure your Companion Satellite installation using the web UI at `http://Satellite-IP:9999`

For details of configuration options, see `https://user.bitfocus.io/docs/companion-satellite`

## Development

NodeJS 20 is required

### Headless

1. Install the dependencies `yarn install`
1. Run it `yarn dev` substituting in your companion instance ip address
1. In another terminal run `yarn dev:webui` to serve the web interface
1. Access the web interface at http://127.0.0.1:5173

### Electron

1. Install the dependencies `yarn install`
1. In one terminal run `yarn dev:webui` to serve the web interface
1. Run it `yarn dev-electron`

You can package for electron with `yarn dist`.  
Building for another platform has not been tested.

### REST API

The default rest port is 9999
a GET request to `http://Satellite-IP:9999/api/host` will return the current target ip in plain text
a GET request to `http://Satellite-IP:9999/api/port` will return the current target port in plain text
a GET request to `http://Satellite-IP:9999/api/config` will return the current target port and ip as json

a POST request to `http://Satellite-IP:9999/api/host` with json body `{"host": "newhostip"}` or plain text `newhostip` will connect the satellite to that ip or hostname
a POST request to `http://Satellite-IP:9999/api/port` with `{"port": 16622}` or plain text `16622` will connect the satellite to that port
a POST request to `http://Satellite-IP:9999/api/config` with `{"host": "newhostip", "port": 16622}` will connect the satellite to that ip/hostname and port
