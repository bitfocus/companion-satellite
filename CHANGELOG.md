# Changelog

All notable changes to this project will be documented in this file. See [Convential Commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) for commit guidelines.

## [2.7.0](https://github.com/bitfocus/companion-satellite/compare/v2.6.0...v2.7.0) (2026-02-03)


### Features

* add macos glass icon ([b7bb320](https://github.com/bitfocus/companion-satellite/commit/b7bb320f5cdfb5a4b629554a4c98b5767c8b975d))
* polish connection status in ui ([d47ab99](https://github.com/bitfocus/companion-satellite/commit/d47ab998ef774f4607365a986d4818cf25199f62))
* support corsair galleon k100 sd ([7c6c837](https://github.com/bitfocus/companion-satellite/commit/7c6c837686a4f5b1b6dcfcf39187935c62312227))
* update electron ([959baaa](https://github.com/bitfocus/companion-satellite/commit/959baaa3f9bbdddf0a7ee3d71ae96f7a348263d2))
* update ui theme ([95a26af](https://github.com/bitfocus/companion-satellite/commit/95a26afffb93f0863b43a7f65f3dd832b6e32ff3))


### Bug Fixes

* enable asar integrity and configure other fuses ([4f1c610](https://github.com/bitfocus/companion-satellite/commit/4f1c6109671f699a36f9276331d90ae24255892b))
* enforce singleton [#225](https://github.com/bitfocus/companion-satellite/issues/225) ([c3d7899](https://github.com/bitfocus/companion-satellite/commit/c3d7899dfa4d40784a32ea69c9b00b1c15195c40))
* flush logger before exit ([822d31c](https://github.com/bitfocus/companion-satellite/commit/822d31c20009b314d9b56072cb911c961dd05893))
* improve galleon sd serial number handling ([a2faabd](https://github.com/bitfocus/companion-satellite/commit/a2faabd3e9ff573b0d64f949b1a671dccb0b5dfc))

## [2.6.0](https://github.com/bitfocus/companion-satellite/compare/v2.5.0...v2.6.0) (2025-12-14)


### Features

* support stream deck mini (discord) ([f7e1a9a](https://github.com/bitfocus/companion-satellite/commit/f7e1a9ab7bb37d6519ed6fe3b13d14159e422e0b))

## [2.5.0](https://github.com/bitfocus/companion-satellite/compare/v2.4.1...v2.5.0) (2025-11-17)


### Features

* improve logging ([3906bc1](https://github.com/bitfocus/companion-satellite/commit/3906bc19d2e12162b34dd5b2f191e168c2e8e3ae))


### Bug Fixes

* connection loss while locked not redrawing once connected ([026281b](https://github.com/bitfocus/companion-satellite/commit/026281bde6c6d5dbe74552942d3bbe56686d33d1))
* reconnecting to companion doesnt clear supported feature flags ([7a78e68](https://github.com/bitfocus/companion-satellite/commit/7a78e687c692c3f34f1b6d208dc442d3ff3b12fb))

## [2.4.1](https://github.com/bitfocus/companion-satellite/compare/v2.4.0...v2.4.1) (2025-10-05)


### Bug Fixes

* windows build ([4ced9bd](https://github.com/bitfocus/companion-satellite/commit/4ced9bd2603c3f5f5bf8f2b64bee0c296f4a919b))

## [2.4.0](https://github.com/bitfocus/companion-satellite/compare/v2.3.0...v2.4.0) (2025-10-01)


### Features

* rebuild loupedeck plugin as single implementation ([#222](https://github.com/bitfocus/companion-satellite/issues/222)) ([7b59139](https://github.com/bitfocus/companion-satellite/commit/7b59139d4daac1de6927f09087c43d5e70b66c8f))
* satellite api complex surfaces ([#215](https://github.com/bitfocus/companion-satellite/issues/215)) ([32e328d](https://github.com/bitfocus/companion-satellite/commit/32e328d70c30064ae3a15271c609f89370f8d147))
* support resolve speed editor ([c00b128](https://github.com/bitfocus/companion-satellite/commit/c00b128379218103b0975438fed260be446b7b91))

## [2.3.0](https://github.com/bitfocus/companion-satellite/compare/v2.2.2...v2.3.0) (2025-08-31)


### Features

* add version number to webui header ([04a13c4](https://github.com/bitfocus/companion-satellite/commit/04a13c4b6d56cf199c39f1e108a3665714379a3d))
* update electron ([aa86537](https://github.com/bitfocus/companion-satellite/commit/aa8653733fa6ab6d6eceacf59ae21d2e0a435a76))
* update shadcn components ([f44521c](https://github.com/bitfocus/companion-satellite/commit/f44521c1b9c1b5cae86e8389f56d0ab332feb015))
* update tailwind ([eed99aa](https://github.com/bitfocus/companion-satellite/commit/eed99aaafcb0444392321489014a1284e9bd7bb4))


### Bug Fixes

* allow updater to run without prompting [#213](https://github.com/bitfocus/companion-satellite/issues/213) ([668a12f](https://github.com/bitfocus/companion-satellite/commit/668a12f690c03c7c81560e97461bd8e0a2b2da7e))
* css tweaks ([5c5e669](https://github.com/bitfocus/companion-satellite/commit/5c5e669ca9c5e883afe1f300a60cd18105c2b94f))
* electron css ([340791f](https://github.com/bitfocus/companion-satellite/commit/340791fa84e921425d1a249ab9db555ba802d776))
* handle some errors when failing to register surface [#205](https://github.com/bitfocus/companion-satellite/issues/205) ([a39398d](https://github.com/bitfocus/companion-satellite/commit/a39398d91c2c239b66a957d69ef4dc88cc9a9f32))
* mouse cursor css ([abcac6f](https://github.com/bitfocus/companion-satellite/commit/abcac6f42df5978e4726f46886edf7ad5a2315b8))
* react warnings ([3ef2255](https://github.com/bitfocus/companion-satellite/commit/3ef2255c981da61ed627bf7e644c4fe77cfea2b2))
* specify streamdeck jpeg options ([ccbedc8](https://github.com/bitfocus/companion-satellite/commit/ccbedc80eef7faa158d56b420bbe649cbdb0e5b0))

## [2.2.2](https://github.com/bitfocus/companion-satellite/compare/v2.2.1...v2.2.2) (2025-06-04)


### Bug Fixes

* allow testing build signing [build-signed] ([62ce51e](https://github.com/bitfocus/companion-satellite/commit/62ce51e2ad3c31a33a82633725b4a23773656866))

## [2.2.1](https://github.com/bitfocus/companion-satellite/compare/v2.2.0...v2.2.1) (2025-05-27)


### Bug Fixes

* missed update ([c3dac7e](https://github.com/bitfocus/companion-satellite/commit/c3dac7e876d9acb67b32a1bb052a21dd557caa09))

## [2.2.0](https://github.com/bitfocus/companion-satellite/compare/v2.1.0...v2.2.0) (2025-05-27)


### Features

* support new streamdeck models ([695094c](https://github.com/bitfocus/companion-satellite/commit/695094c1979a795b910d47aaa7893e7b4d6ce87e))

## [2.1.0](https://github.com/bitfocus/companion-satellite/compare/v2.0.3...v2.1.0) (2025-05-24)


### Features

* add support for contour-shuttle [#196](https://github.com/bitfocus/companion-satellite/issues/196) ([24bf859](https://github.com/bitfocus/companion-satellite/commit/24bf859b7abda16973680dbb4ce7f794bfb8c4d4))
* local surface locking ([#198](https://github.com/bitfocus/companion-satellite/issues/198)) ([0d24d00](https://github.com/bitfocus/companion-satellite/commit/0d24d00359267fd8770709901c52bc1499f66f1e))
* support blackmagic resolve replay editor ([39f9f74](https://github.com/bitfocus/companion-satellite/commit/39f9f743731257470622a622d920d9b831ea3777))


### Bug Fixes

* support http proxy in update check ([2e5b410](https://github.com/bitfocus/companion-satellite/commit/2e5b4103ec827d28b4a947cccb7856a4af40a5d3))
* suppress `MaxListenersExceededWarning` warning ([ffbb48b](https://github.com/bitfocus/companion-satellite/commit/ffbb48b4581ae8b82cc402a4905ff2b94befe399))

## [2.0.3](https://github.com/bitfocus/companion-satellite/compare/v2.0.2...v2.0.3) (2025-04-13)


### Bug Fixes

* update udev rules ([1f36d5d](https://github.com/bitfocus/companion-satellite/commit/1f36d5dc8e1529680bb21f3a04a784d476c15ceb))

## [2.0.2](https://github.com/bitfocus/companion-satellite/compare/v2.0.1...v2.0.2) (2025-04-04)


### Bug Fixes

* tabs become vertical on narrow screens ([11d8640](https://github.com/bitfocus/companion-satellite/commit/11d86405dedfc503a1a120198cd2736c4f0008b4))

## [2.0.1](https://github.com/bitfocus/companion-satellite/compare/v2.0.0...v2.0.1) (2025-02-03)


### Bug Fixes

* windows signing ([212c0ae](https://github.com/bitfocus/companion-satellite/commit/212c0aeb99f7c89b3561ed37a7d7e9c4779cf0f8))

## [2.0.0](https://github.com/bitfocus/companion-satellite/compare/v1.10.2...v2.0.0) (2025-02-02)


### ⚠ BREAKING CHANGES

* require companion 3.4 or later
* conform surface ids to match companion

### Features

* allow opting out of brightness control ([fdfacba](https://github.com/bitfocus/companion-satellite/commit/fdfacba9e6c314dbf0245decd10fce462e07e5dd))
* api endpoint to list connected/discovered surfaces ([8712618](https://github.com/bitfocus/companion-satellite/commit/87126188485dc935a145c26056e6580bdac2861a))
* atem micro panel support (requires companion 3.4) ([cd5a034](https://github.com/bitfocus/companion-satellite/commit/cd5a034aeac06e7d3a8f50b48f6e174bd74ad798))
* config to enable/disable different surface types ([2752c4c](https://github.com/bitfocus/companion-satellite/commit/2752c4c92c579bbea9a9a71c533ce2c8a724fd10))
* conform surface ids to match companion ([5be0e80](https://github.com/bitfocus/companion-satellite/commit/5be0e8086581bc86fa51b1b9a60f55c596ebcb75))
* connected surfaces table in ui ([5ddbbd1](https://github.com/bitfocus/companion-satellite/commit/5ddbbd167ba50b59cbc7702d53f5e998eb11b62a))
* one click update (windows only) ([432e043](https://github.com/bitfocus/companion-satellite/commit/432e043d75794390fd25ff8fb96eaf7028038fad))
* only include open surfaces in api ([6e0a526](https://github.com/bitfocus/companion-satellite/commit/6e0a526d7a7bcdb4a760fe38047a32b583f7543a))
* openapi type generation ([48d9e50](https://github.com/bitfocus/companion-satellite/commit/48d9e508429d179fc78d7a4aa00c86601e56bea9))
* rebuild about window ([ed2373c](https://github.com/bitfocus/companion-satellite/commit/ed2373c6e24b7665bb76acf2180ed70aa9bf3350))
* rebuild ui in shadcn ([dd7a874](https://github.com/bitfocus/companion-satellite/commit/dd7a874d76e797113ded900ba2dee66ae10a873e))
* refactor surface integrations to be a little more plugin based ([8fabf47](https://github.com/bitfocus/companion-satellite/commit/8fabf47f6c358dd2ee04188f934668a960c1394d))
* require companion 3.4 or later ([4fd0d67](https://github.com/bitfocus/companion-satellite/commit/4fd0d6760878a553fa8f62121336556326f8f38d))
* support websocket connection ([739f583](https://github.com/bitfocus/companion-satellite/commit/739f58320aeea2d4f229344d7435b6dcdb0459af))
* update electron. This drops support for macos 10.15 ([adc8c70](https://github.com/bitfocus/companion-satellite/commit/adc8c7060649bbc269b3707e51591442f9627008))


### Bug Fixes

* only show check for updates tray menu item ([09a082a](https://github.com/bitfocus/companion-satellite/commit/09a082af1eeb850c4fdda5d4ec34339795d68049))
* use builtin notarization support ([160bfc6](https://github.com/bitfocus/companion-satellite/commit/160bfc67ca1e92cd889bf901a0d273e1a8b4ccd7))

## [1.10.2](https://github.com/bitfocus/companion-satellite/compare/v1.10.1...v1.10.2) (2025-01-11)


### Features

* reimplement windows signing ([#174](https://github.com/bitfocus/companion-satellite/issues/174)) ([67db6da](https://github.com/bitfocus/companion-satellite/commit/67db6dada718ca328cc322a84bdbebe3f783d69d))


### Bug Fixes

* clear full lcd strip on streamdeck+ when drawing first 'button' to it [#176](https://github.com/bitfocus/companion-satellite/issues/176) ([dcdd585](https://github.com/bitfocus/companion-satellite/commit/dcdd5854a87faeca74a5ced707df5c406eed18b2))


### Miscellaneous Chores

* force version ([568be36](https://github.com/bitfocus/companion-satellite/commit/568be368007caa994fce5c12557a520d25043098))

## [1.10.1](https://github.com/bitfocus/companion-satellite/compare/v1.10.0...v1.10.1) (2024-11-13)


### Bug Fixes

* add missing streamdeck udev rules ([ec07cee](https://github.com/bitfocus/companion-satellite/commit/ec07cee0f5cc8a8f7c08ece6f84e07639be015f3))

## [1.10.0](https://github.com/bitfocus/companion-satellite/compare/v1.9.3...v1.10.0) (2024-11-11)


### Features

* update eslint and rebuild config ([11104e1](https://github.com/bitfocus/companion-satellite/commit/11104e16f921a0ef339a48c8a260438bfbfdeb0e))
* update streamdeck library to v7 ([17384b8](https://github.com/bitfocus/companion-satellite/commit/17384b859bb7a5abc861e87dcf4264942297868d))


### Bug Fixes

* incorrect path to template `satellite-config` file on pi ([881c62a](https://github.com/bitfocus/companion-satellite/commit/881c62a358a8645bfaca383161e63232e7a72515))
* remove reliance on vc_redist ([40aef4a](https://github.com/bitfocus/companion-satellite/commit/40aef4a0ddb1627283ce51540166117bdfdbe860))

## [1.9.3](https://github.com/bitfocus/companion-satellite/compare/v1.9.2...v1.9.3) (2024-10-26)


### Bug Fixes

* add `@julusian/segfault-raub` to try and produce better logging for segfaults ([d30b952](https://github.com/bitfocus/companion-satellite/commit/d30b952215328ad837ae4471892fb7dfce7eb18c))
* update canvas lib ([1e79ff8](https://github.com/bitfocus/companion-satellite/commit/1e79ff85428aa4668cd2493a01ab647100a9c726))

## [1.9.2](https://github.com/bitfocus/companion-satellite/compare/v1.9.1...v1.9.2) (2024-09-23)


### Bug Fixes

* gracefully handle when satellite cannot bind REST port ([#152](https://github.com/bitfocus/companion-satellite/issues/152)) ([014562a](https://github.com/bitfocus/companion-satellite/commit/014562a5ed2e6d924dac3c62b680d374709a5bdf))
* use macos 10.15 compatible canvas library ([a3428c3](https://github.com/bitfocus/companion-satellite/commit/a3428c3d9e1adbb316f57ee59323504f956ff9a1))

## [1.9.1](https://github.com/bitfocus/companion-satellite/compare/v1.9.0...v1.9.1) (2024-09-06)


### Bug Fixes

* update jpeg library ([34e5fb0](https://github.com/bitfocus/companion-satellite/commit/34e5fb07f64b75e4fd600b88df892f53ec9494c6))

## [1.9.0](https://github.com/bitfocus/companion-satellite/compare/v1.8.1...v1.9.0) (2024-08-10)


### Features

* add mdns and installname to api and webui ([6b9b4a1](https://github.com/bitfocus/companion-satellite/commit/6b9b4a10e80872680002f2b91602b18548cbf328))
* mdns announce ([f0a1cfd](https://github.com/bitfocus/companion-satellite/commit/f0a1cfd9ef4ab5e9c6a430429aac58754f2d169c))
* mdns announce ([8bf2ab8](https://github.com/bitfocus/companion-satellite/commit/8bf2ab8efb5ee9002199bf61ea84c959f97eaae2))
* replace canvas library ([7b5202a](https://github.com/bitfocus/companion-satellite/commit/7b5202a1dca2a7e224c961847c9461a8a18c1705))
* update electron to 30 and switch to esm ([57e6e55](https://github.com/bitfocus/companion-satellite/commit/57e6e5536423cd84bbaee1e439236a1886906897))
* update nodejs to 20 ([6ee2259](https://github.com/bitfocus/companion-satellite/commit/6ee225955891c7e272b3ca447d8f7d68dd06cfd1))
* use unique installation name in mdns ([3958a2f](https://github.com/bitfocus/companion-satellite/commit/3958a2fab92d274b7fd04674e0a1e81e2d779c30))


### Bug Fixes

* debounce mdns restart ([c52f8a0](https://github.com/bitfocus/companion-satellite/commit/c52f8a0480a4c7c4e5bd06084dab67b659f20402))
* electron preload script ([beed579](https://github.com/bitfocus/companion-satellite/commit/beed579d66f65dda2dc86be2b142846430384d85))
* type errors ([1837e1a](https://github.com/bitfocus/companion-satellite/commit/1837e1a4320490ca2c4c2af7e2c98d1eaa7a2459))

## [1.8.1](https://github.com/bitfocus/companion-satellite/compare/v1.8.0...v1.8.1) (2024-06-17)


### Bug Fixes

* force rebuild ([c0504b0](https://github.com/bitfocus/companion-satellite/commit/c0504b0912f41b1b5f58dc9c7228b18a176a1c7c))
* update nodejs version ([40f95a1](https://github.com/bitfocus/companion-satellite/commit/40f95a14d8c8244a0205033901ce3bc54d8565a0))

## [1.8.0](https://github.com/bitfocus/companion-satellite/compare/v1.7.5...v1.8.0) (2024-05-22)


### Features

* add support for streamdeck neo ([c60862c](https://github.com/bitfocus/companion-satellite/commit/c60862cc10c704c64dd34183980085a50c28388b))

## [1.7.5](https://github.com/bitfocus/companion-satellite/compare/v1.7.4...v1.7.5) (2024-02-23)


### Bug Fixes

* try again at pi image ([f18021a](https://github.com/bitfocus/companion-satellite/commit/f18021aa25fd3b43807b92a2297c53994e6528f1))

## [1.7.4](https://github.com/bitfocus/companion-satellite/compare/v1.7.3...v1.7.4) (2024-02-23)


### Bug Fixes

* try again at pi image ([2afb867](https://github.com/bitfocus/companion-satellite/commit/2afb867404f298abd8ba53a92da6b069ba263950))

## [1.7.3](https://github.com/bitfocus/companion-satellite/compare/v1.7.2...v1.7.3) (2024-02-23)


### Bug Fixes

* try again at fixing pi image ([20feb5d](https://github.com/bitfocus/companion-satellite/commit/20feb5d160ac16a47139d47f9288cfaf37b3c463))

## [1.7.2](https://github.com/bitfocus/companion-satellite/compare/v1.7.1...v1.7.2) (2024-02-23)


### Bug Fixes

* release pi image building ([fa437c5](https://github.com/bitfocus/companion-satellite/commit/fa437c57cc155d512db4244425227dcd9c81301d))

## [1.7.1](https://github.com/bitfocus/companion-satellite/compare/v1.7.0...v1.7.1) (2024-02-23)


### Bug Fixes

* pi image not being built for releases ([a966ea0](https://github.com/bitfocus/companion-satellite/commit/a966ea09b5c1934d2d79062404d618cb85ea8076))
* undo changes to release-please config ([257f037](https://github.com/bitfocus/companion-satellite/commit/257f03786bd3d5f1a7aed07cff2c5adb6f12f061))

## [1.7.0](https://github.com/bitfocus/companion-satellite/compare/companion-satellite-v1.6.1...companion-satellite-v1.7.0) (2024-02-23)


### Features

* expand rest api to serve minimal interface ([#103](https://github.com/bitfocus/companion-satellite/issues/103)) ([2074eac](https://github.com/bitfocus/companion-satellite/commit/2074eac5df22a86bb0ff6323d934ad2684fd8c56))
* install headless satellite by extracting electron builds ([#113](https://github.com/bitfocus/companion-satellite/issues/113)) ([2a60e94](https://github.com/bitfocus/companion-satellite/commit/2a60e94cef2b1f0c756de8df7fa81c2a205cad0f))


### Bug Fixes

* building ([4f79681](https://github.com/bitfocus/companion-satellite/commit/4f79681e2b10fb0a801a660b80191497b674b7bb))
* syntax ([4892ff1](https://github.com/bitfocus/companion-satellite/commit/4892ff16bc79043bba58cb2f72f13699cb14dc68))
* webui not being built ([49f9eb4](https://github.com/bitfocus/companion-satellite/commit/49f9eb4d87beea80424e187ea0e49fd2b34f9e5c))

## [1.6.1](https://github.com/bitfocus/companion-satellite/compare/v1.6.0...v1.6.1) (Mon Feb 05 2024)


### Fixes

* ensure config file exists at boot [c410c65](https://github.com/bitfocus/companion-satellite/commit/c410c6588494b765d8fcd23a6bb5fcff63ce4744)

## [1.6.0](https://github.com/bitfocus/companion-satellite/compare/v1.5.6...v1.6.0) (Tue Jan 09 2024)


### Fixes

* adjust timeouts [07caa86](https://github.com/bitfocus/companion-satellite/commit/07caa8600c5389cbaeb1bf3d928bd2dd75d6dd62)

### Features

* use node-hid 3.0.0 (#104) [6ce9a0f](https://github.com/bitfocus/companion-satellite/commit/6ce9a0f03e55a0f5beceece92fbcc87e17baaba7)

## [1.5.6](https://github.com/bitfocus/companion-satellite/compare/v1.5.5...v1.5.6) (Sat Nov 18 2023)


### Fixes

* align streamdeck plus lcd strip drawing [515cf4a](https://github.com/bitfocus/companion-satellite/commit/515cf4acd74e0de55bbff21f979345c9ac678afb)
* scaling is not being setup correctly, when devices are added before the connection is fully open [4a2a30a](https://github.com/bitfocus/companion-satellite/commit/4a2a30a3b468072d93bcc9792d8d90363b5bb9b6)
* streamdeck plus lcd strip not blanking [ed56920](https://github.com/bitfocus/companion-satellite/commit/ed5692077d651bcacfe3824f2e295e7526ff321d)

## [1.5.5](https://github.com/bitfocus/companion-satellite/compare/v1.5.3...v1.5.5) (Wed Oct 11 2023)


### Fixes

* build errors [1dd8969](https://github.com/bitfocus/companion-satellite/commit/1dd896921d2ea2ec5affcd3abba79a76c6eadca4)

## [1.5.4](https://github.com/bitfocus/companion-satellite/compare/v1.5.3...v1.5.4) (Wed Oct 11 2023)


## [1.5.3](https://github.com/bitfocus/companion-satellite/compare/v1.5.2...v1.5.3) (Wed Oct 11 2023)


### Fixes

* install vcruntime [4523f1f](https://github.com/bitfocus/companion-satellite/commit/4523f1fda308c944782fe9ba2c1484a544dc254c)

## [1.5.2](https://github.com/bitfocus/companion-satellite/compare/v1.5.1...v1.5.2) (Sat Oct 07 2023)


### Fixes

* update @julusian/image-rs for arm7 support [64a6903](https://github.com/bitfocus/companion-satellite/commit/64a6903d93f9e89aa648ed3f4cd3bcf1fb76c260)
* **(pi)** reload udev rules during install. ensure nano is installed [6c96faa](https://github.com/bitfocus/companion-satellite/commit/6c96faafc22a582c70d76707af0a2a3c78001b0c)

## [1.5.1](https://github.com/bitfocus/companion-satellite/compare/v1.5.0...v1.5.1) (Mon Sep 04 2023)


### Fixes

* hide version info from about dialog [20aa59c](https://github.com/bitfocus/companion-satellite/commit/20aa59ca599ec51aeb77e0d2e63a85a7cdd4b285)
* add setImmediate to connected event (#85) [0528e36](https://github.com/bitfocus/companion-satellite/commit/0528e36df83d02669da8cb43909d275b19fc82c8)

### Features

* add connected endpoint (#87) [2b40358](https://github.com/bitfocus/companion-satellite/commit/2b4035818c267f5d80dbc8fc3490ea8125739d06)

## [1.5.0](https://github.com/bitfocus/companion-satellite/compare/v1.4.1...v1.5.0) (Sat Aug 19 2023)


### Fixes

* macos offline icon [5e04a02](https://github.com/bitfocus/companion-satellite/commit/5e04a0285cf355f2714e8bdc952bc3d5e7f4e5aa)
* simplify @julusian/image-rs usage [ec0672f](https://github.com/bitfocus/companion-satellite/commit/ec0672f025df978b5ec10378ea7c3f7fdb563c07)
* upgrade @julusian/image-rs to resolve streamdeck drawing black [65bae64](https://github.com/bitfocus/companion-satellite/commit/65bae6494294386b6123d0974531f5a2caff59ff)
* skia-canvas [52ce045](https://github.com/bitfocus/companion-satellite/commit/52ce04562ab95a24f845208bc2bed8af9ee775b3)
* install libfontconfig1 required by skia-canvas #76 [997fe7f](https://github.com/bitfocus/companion-satellite/commit/997fe7f9f716a15d83b0b04e51696c1b07c843fa)
* missing line [63ef41f](https://github.com/bitfocus/companion-satellite/commit/63ef41fd7fc9b66ba1e675892766c232aadad8ef)

### Features

* show connection status in tray icon #3 [d84117e](https://github.com/bitfocus/companion-satellite/commit/d84117e0bfb468cf2932d57382aa4ad102e647ea)
* oversample status card generation to improve text rendering [6ebaf36](https://github.com/bitfocus/companion-satellite/commit/6ebaf3679672be978bfa46701884b637f626c5c2)
* add rest endpoint to rescan for surfaces [06eb299](https://github.com/bitfocus/companion-satellite/commit/06eb2994c64823e264e7bfea264d4c06ed9c51be)
* enable/disable api from tray menu [59a6103](https://github.com/bitfocus/companion-satellite/commit/59a6103086bb5dcc825ded708407e59197c676d4)
* REST api (#78) [5e924b8](https://github.com/bitfocus/companion-satellite/commit/5e924b84316714d8163f6351e78984aa9dfbb81a)
* update icons [4a76fc4](https://github.com/bitfocus/companion-satellite/commit/4a76fc48fa4a51cae91bce9ce071018fef170e90)
* replace sharp with skia-canvas for placeholder drawing [3c01b55](https://github.com/bitfocus/companion-satellite/commit/3c01b55fc86325cd9be9d2ca8aa477e623cd8d61)
* replace sharp with @julusian/image-rs for image scaling [103344d](https://github.com/bitfocus/companion-satellite/commit/103344d0c3e75e54389fc8e1c8ab3fff6a482b90)
* update electron [f863304](https://github.com/bitfocus/companion-satellite/commit/f863304f7e1c508034e5f577cb9a51e7c1d2c829)
* support companion provided bitmap scaling [b335e2e](https://github.com/bitfocus/companion-satellite/commit/b335e2edba7d8617430e05b71a636907b03bf0c8)
* isolated install script [4b060a1](https://github.com/bitfocus/companion-satellite/commit/4b060a1610936442947406c52ba4a5902640fa9b)
* update electron and node-hid [d96acfe](https://github.com/bitfocus/companion-satellite/commit/d96acfe5e3c5c1ed15895ffbe615fef268a1f4cf)

## [1.4.1](https://github.com/bitfocus/companion-satellite/compare/v1.4.0...v1.4.1) (Thu Apr 20 2023)


### Fixes

* downgrade electron due to memory cage bug [75a395e](https://github.com/bitfocus/companion-satellite/commit/75a395ea93dd1f385f4a9f47e0c4aadbeff208ed)

## [1.4.0](https://github.com/bitfocus/companion-satellite/compare/v1.3.1...v1.4.0) (Tue Apr 18 2023)


### Features

* support razer stream controller x [71cb009](https://github.com/bitfocus/companion-satellite/commit/71cb009dcc9bb3e7caecbdac1af89715850b4f50)
* update loupedeck library [99de79e](https://github.com/bitfocus/companion-satellite/commit/99de79e1a687e282e2709c93d045f6f37f1aa778)

### [1.3.1](https://github.com/bitfocus/companion-satellite/compare/v1.3.0...v1.3.1) (2022-12-19)


### Bug Fixes

* pin sharp to 0.31.1 to fix older macos support ([fe81b57](https://github.com/bitfocus/companion-satellite/commit/fe81b571a9caa9ae27dd54773e35587522cfa6b9))

## [1.3.0](https://github.com/bitfocus/companion-satellite/compare/v1.2.0...v1.3.0) (Fri Dec 02 2022)


### Features

* support streamdeck plus [5e9a19b](https://github.com/bitfocus/companion-satellite/commit/5e9a19b185cce94bb0af22c336f4a425bfabad47)
* support loupedeck live s [f021503](https://github.com/bitfocus/companion-satellite/commit/f0215035e955c902e6bb90aee84bfc4c3d26e65c)
* use new KEY-ROTATE message (#60) [fb8806a](https://github.com/bitfocus/companion-satellite/commit/fb8806a1bc2f1d75a9a0f575c7ab0bae6cb8da27)

## [1.2.0](https://github.com/bitfocus/companion-satellite/compare/v1.1.0...v1.2.0) (2022-10-21)


### Features

* prototype razer stream controller support ([15b62ac](https://github.com/bitfocus/companion-satellite/commit/15b62accb7c93384be239b51944d7feb12125cf1))


### Bug Fixes

* headless port broken ([2ecf115](https://github.com/bitfocus/companion-satellite/commit/2ecf1157639f805476be66f2eb16b413845141e2))
* linux build ([79172e7](https://github.com/bitfocus/companion-satellite/commit/79172e73c07a4c4093d3e7711ca7ac7ebf7a2909))
* loupedeck bleed between buttons ([939b5b4](https://github.com/bitfocus/companion-satellite/commit/939b5b48b09ed2c0020c7a9c1f97f71334a4b229))
* loupedeck disconnection and errors ([87a817c](https://github.com/bitfocus/companion-satellite/commit/87a817ccfccdfd39b41034e81231f40f736b83fe))
* loupedeck drawing ([1225dbe](https://github.com/bitfocus/companion-satellite/commit/1225dbeb2b50cd5afb23ae58fd1aed13a3024d55))
* mac-arm64 build ([705f954](https://github.com/bitfocus/companion-satellite/commit/705f9540916a9f89248f1de184245dda0b2b7dc5))
* optimise parseLineParameters ([d3166e1](https://github.com/bitfocus/companion-satellite/commit/d3166e1745688032605c17b8971b4e5d81fcfd1e))
* optimise parseLineParameters ([3af36ae](https://github.com/bitfocus/companion-satellite/commit/3af36aea4ba9a45e9c0d8872902292c811f17239))
* streamdeck draw performance ([72485ba](https://github.com/bitfocus/companion-satellite/commit/72485ba335dc5e97e74ac7f4b2187f47c775939d))
* update loupedeck lib ([f822386](https://github.com/bitfocus/companion-satellite/commit/f822386d671cd29987e0a0f7a9a89a0ddd224aab))
* use different loupedeck library ([c589404](https://github.com/bitfocus/companion-satellite/commit/c5894042d58709c05e2989121b29d24503c11156))

## [1.1.0](https://github.com/bitfocus/companion-satellite/compare/v1.0.1...v1.1.0) (2022-09-19)


### Features

* loupedeck live support ([#50](https://github.com/bitfocus/companion-satellite/issues/50)) ([a9a4ae8](https://github.com/bitfocus/companion-satellite/commit/a9a4ae8401e2d8a15f4da775557ce612238698bc))

### [1.0.1](https://github.com/bitfocus/companion-satellite/compare/v1.0.0...v1.0.1) (2022-07-31)


### Bug Fixes

* support new revisions of the streamdeck mini ([45548e0](https://github.com/bitfocus/companion-satellite/commit/45548e07e6a27eb6778bc2f995a73cd1d00098e4))
* update usb to get native windows hotplug detection ([074c47f](https://github.com/bitfocus/companion-satellite/commit/074c47f3e85ea59f7bd3888af24e434caf9986ba))

## [1.0.0](https://github.com/bitfocus/companion-satellite/compare/v0.4.0...v1.0.0) (2022-07-17)


### Features

* allow user to specify server port number ([1cacd1e](https://github.com/bitfocus/companion-satellite/commit/1cacd1eeb93b9e1522cf4f37e00d0a5caaacd7a0))
* build for arm mac ([0215dde](https://github.com/bitfocus/companion-satellite/commit/0215ddecdb86651b9ca76389924c0311d014d265))
* build pi image ([893fffa](https://github.com/bitfocus/companion-satellite/commit/893fffaf907b2b1eeb130a4963a7d9604004eafc))
* docker image build ([f9f5282](https://github.com/bitfocus/companion-satellite/commit/f9f52829f964679efc38573248ada7868751be0b))
* esm ([0b4d7e3](https://github.com/bitfocus/companion-satellite/commit/0b4d7e3f80f66d5d5e353e349c038a975902b385))
* esm (electron) ([ca8f935](https://github.com/bitfocus/companion-satellite/commit/ca8f9351c3a68d2017e09ba4cba47ad5435dc169))
* infinitton support ([23fd935](https://github.com/bitfocus/companion-satellite/commit/23fd935b56f3e39f2f00e08993d6e04f39f5d0a9))
* macos signing ([c1b61da](https://github.com/bitfocus/companion-satellite/commit/c1b61da90cc174e960f15daf66fc17e6ca649731))
* notify api server of build (hopefully) ([9bb676e](https://github.com/bitfocus/companion-satellite/commit/9bb676ee1110cd73ba3ebe2430426a9a042597a9))
* publish builds ([a9572bb](https://github.com/bitfocus/companion-satellite/commit/a9572bb83612e4fe9f361d592329beb06c7fe336))
* replace usb-detection with usb ([83e5ef0](https://github.com/bitfocus/companion-satellite/commit/83e5ef0bb7ffe9faf39c1652c53b83ff88689346))
* satellite api v2 ([fcf0654](https://github.com/bitfocus/companion-satellite/commit/fcf06542ecfa7bb52db9fb8a7685a0fce25ea8c7))
* support for pedal (untested) ([2d4ba39](https://github.com/bitfocus/companion-satellite/commit/2d4ba39bee3f2943cae786a92ab177e416590f4c))


### Bug Fixes

* 'handle' BEGIN command ([c6ce5b0](https://github.com/bitfocus/companion-satellite/commit/c6ce5b0976167702c039d79196f677fff2333f37))
* 'handle' KEY-PRESS ack ([3003f48](https://github.com/bitfocus/companion-satellite/commit/3003f4877d866132adbbb3696616db2dad0a2a4e))
* add elgato pedal to pi udev rules ([698434b](https://github.com/bitfocus/companion-satellite/commit/698434b6b98d939ddab4e794dc5f5cbf10e98f4a))
* add mac entitlements ([95f60de](https://github.com/bitfocus/companion-satellite/commit/95f60de3af264631d555f8d0c850e8c5ca8fb3be))
* api long-version and upload destination ([aef04e9](https://github.com/bitfocus/companion-satellite/commit/aef04e9810961bf448caabc170f46653c887b6a5))
* attempt ([1f2a344](https://github.com/bitfocus/companion-satellite/commit/1f2a3445a0aa1e1fb78be860f1abbef2fe8ddab9))
* attempt to combine the workflow ([8d4e0ae](https://github.com/bitfocus/companion-satellite/commit/8d4e0ae80e4b80afbd1a17a435152c90f5232c7f))
* build pi image ([be7ccdc](https://github.com/bitfocus/companion-satellite/commit/be7ccdc68a46fa7c66f5148e418ca55a3f197b55))
* docker build ([da17351](https://github.com/bitfocus/companion-satellite/commit/da1735168b298d01bda269f527ca6f68053173f3))
* docker image push ([d48638e](https://github.com/bitfocus/companion-satellite/commit/d48638e2bd9fe5ab8e0fab3d77c5c687108e2f4b))
* docker usb devices ([edab33e](https://github.com/bitfocus/companion-satellite/commit/edab33e6ec63c39572c68d1e523e476bd6c985c2))
* force into hidraw mode ([d41695e](https://github.com/bitfocus/companion-satellite/commit/d41695e14409a2b177f03c411f43b51493be7751))
* handle slow networks better ([683c91d](https://github.com/bitfocus/companion-satellite/commit/683c91d6a078897452a6f6139d27a5cd94bdec1a))
* ignore more files from the electron asar ([4dd6132](https://github.com/bitfocus/companion-satellite/commit/4dd61324b089c619bb8c7ce8618d6c4af7ea8222))
* incorrect productName in built binaries ([746db4e](https://github.com/bitfocus/companion-satellite/commit/746db4e11abfc0e7e2249bbc5c06707dfb3dae78))
* input names ([0110a97](https://github.com/bitfocus/companion-satellite/commit/0110a978909f0469ccd0dc1d9c7f2ad5daf7c75d))
* Move electron packages from devDependencies to dependencies ([#40](https://github.com/bitfocus/companion-satellite/issues/40)) ([52e3ba6](https://github.com/bitfocus/companion-satellite/commit/52e3ba68f6433b1bf70ad8cf760c183ec680403f))
* optimise docker build ([71f47cb](https://github.com/bitfocus/companion-satellite/commit/71f47cb64fc1c9e4e29589d6c91187f0314b7fd9))
* pi build number ([76470b8](https://github.com/bitfocus/companion-satellite/commit/76470b8404b8fcf3b1781ec140b555c637902665))
* pi image archive name ([ef83f24](https://github.com/bitfocus/companion-satellite/commit/ef83f244124a5cd39581516e3ddb20e52cfaddda))
* product name ([033f692](https://github.com/bitfocus/companion-satellite/commit/033f692fb5157b54707821824ce063584934c46f))
* retry adding devices if the add fails (note: needs newer companion version to work) ([447e3e6](https://github.com/bitfocus/companion-satellite/commit/447e3e61030c834d2dca1c58669fd41e151704d5))
* rewrite binary upload to use mc instead of curl ([334f54a](https://github.com/bitfocus/companion-satellite/commit/334f54a51be12aa7f1f3ccba8f2307f099409d8d))
* try versions again ([e3de952](https://github.com/bitfocus/companion-satellite/commit/e3de952afa852df2763e39c2a7443ce6c470b1e9))
* typo ([c4fa350](https://github.com/bitfocus/companion-satellite/commit/c4fa3509b452a9f2748ad08a9a60d3995cb49991))
* typo ([e44f356](https://github.com/bitfocus/companion-satellite/commit/e44f3566ce03965ce28e3114d3a398a3fe8fb346))
* typo ([cbbac3d](https://github.com/bitfocus/companion-satellite/commit/cbbac3d5c9f3b48d690c16c1ab313b13d36977ce))
* typo (again) ([a1bdfd3](https://github.com/bitfocus/companion-satellite/commit/a1bdfd3a2d501a38914ea2a2991dca5115562b54))
* use shared composite action ([5528b9b](https://github.com/bitfocus/companion-satellite/commit/5528b9b350a1c247b8150418f33c94272d9edaa6))
* wrong version ([ce88c17](https://github.com/bitfocus/companion-satellite/commit/ce88c171fc8913734de552a42649b8a9669d8bf2))

## [0.4.0](https://github.com/bitfocus/companion-satellite/compare/v0.3.0...v0.4.0) (2021-08-12)


### Features

* update streamdeck lib and other dependencies ([5552ce0](https://github.com/bitfocus/companion-satellite/commit/5552ce062ab87eaf4aecf9eba86cea6d36d5a4d9))

## [0.3.0](https://github.com/bitfocus/companion-satellite/compare/v0.2.2...v0.3.0) (2021-07-03)


### ⚠ BREAKING CHANGES

* rename to Companion Satellite and move to bitfocus org

### Features

* rename to Companion Satellite and move to bitfocus org ([31b723a](https://github.com/bitfocus/companion-satellite/commit/31b723aa26befd783b462261f5c4af0a311d4c22))


### Bug Fixes

* image resizing for streamdeck mini ([71a5165](https://github.com/bitfocus/companion-satellite/commit/71a5165a00e2ce6cf476b48e6231013dcf4653d9))

### [0.2.2](https://github.com/bitfocus/companion-satellite/compare/v0.2.1...v0.2.2) (2021-02-01)


### Bug Fixes

* allow a few unacked pings before restarting connection ([7c880a2](https://github.com/bitfocus/companion-satellite/commit/7c880a288c08245e42b2844068e233e8e5d3a4d6))
* handle reconnect better ([be5ad79](https://github.com/bitfocus/companion-satellite/commit/be5ad798a57a1f58e4f8462fc7faddeec90151f7))
* headless process not exiting ([3821983](https://github.com/bitfocus/companion-satellite/commit/3821983765fdb9292c6cdcd4ea84bd93debc40e5))
* on device detect scan now and after a short delay. often on mac the delay is needed to find the device when scanning ([375d5d4](https://github.com/bitfocus/companion-satellite/commit/375d5d4038b56c998004ee20cb540a3e7c746c4f))
* opening connection to localhost before target at starutp ([118d149](https://github.com/bitfocus/companion-satellite/commit/118d149f2e29330d350dabffdfd8b6794ec56125))
* replace packet parsing recursion with a loop to avoid max call stack issues ([bb46f5a](https://github.com/bitfocus/companion-satellite/commit/bb46f5a211cc7e76f1479b98f85e7b07e708a297))

### [0.2.1](https://github.com/bitfocus/companion-satellite/compare/v0.2.0...v0.2.1) (2021-01-21)


### Bug Fixes

* replace canvas with sharp for  card generation. ensure queue is discarded when device is registered and ready for images ([7639666](https://github.com/bitfocus/companion-satellite/commit/76396664101ac80462f4884f999ccd3d97c41707))

## [0.2.0](https://github.com/bitfocus/companion-satellite/compare/v0.1.0...v0.2.0) (2021-01-20)


### Features

* add scan option to tray menu ([cbbd6dd](https://github.com/bitfocus/companion-satellite/commit/cbbd6dd36f60dc1cf76e67bb7eb7d666d86106cf))
* basic status card on streamdecks ([2ae218c](https://github.com/bitfocus/companion-satellite/commit/2ae218cf4244084df695cfa10490434d26ec2929))
* electron 10 ([95d126e](https://github.com/bitfocus/companion-satellite/commit/95d126ed83bc8033f5c94474d9a1dead1978c6ad))
* naive ping tracking, to quickly detect timeouts ([98c11f9](https://github.com/bitfocus/companion-satellite/commit/98c11f98b078a6e63d0fa6856f13b526117fa91c))


### Bug Fixes

* allow changing connection while connceted ([01039b4](https://github.com/bitfocus/companion-satellite/commit/01039b4a7f688db03b0f5fbdd1d0f16f3c470f89))
* allow html in description ([6b78224](https://github.com/bitfocus/companion-satellite/commit/6b7822483ee25d924cf5dc88cf7e787a251ee60b))
* changing ip doesnt error so much ([31fb0a7](https://github.com/bitfocus/companion-satellite/commit/31fb0a76f775eedb73a7b51283f2714f80b1fbfa))
* electron freezing after closing dialog, or exiting after the ip prompt ([7b0bad2](https://github.com/bitfocus/companion-satellite/commit/7b0bad243a1cf5d9b6a030e20608b586ef47c200))
* ensure connection is cleaned up on exit ([53edebf](https://github.com/bitfocus/companion-satellite/commit/53edebfd734ffa07c4dcca822fb5cbb5ec567629))
* load icon image manually, as canvas can't read from asar ([f047da4](https://github.com/bitfocus/companion-satellite/commit/f047da4a8cac3ee9d38d37a6a61217e34f02a708))
* not quitting ([cc6e061](https://github.com/bitfocus/companion-satellite/commit/cc6e0619284504e0446c69ced766a36a7f85186f))
* scan for devices at startup while no companion connection. show key status on devices before they are fully initialised ([cee053f](https://github.com/bitfocus/companion-satellite/commit/cee053f89ea2d23dc447e57d37f7fd9917daa917))
