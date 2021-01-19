## Companion Remote

[![License](https://img.shields.io/github/license/julusian/companion-remote)](https://github.com/Julusian/companion-remote/blob/master/LICENSE.md)
![Version](https://img.shields.io/github/v/release/julusian/companion-remote)

A small application to allow for connecting a streamdeck to [Bitfocus Companion](https://github.com/bitfocus/companion) over a network.

Once running, it will sit in the system tray. Right click it to set the ip address of the companion instance to connect to.
There is no need to scan for new devices, the application will detect any devices being connected and automatically use them.

Each device will appear in companion as its own 'satellite' device, and so can be configured as if they are local.

Note: This connects over the satellite device api which uses port TCP 37133.

Companion 2.1.2 and newer are supported
