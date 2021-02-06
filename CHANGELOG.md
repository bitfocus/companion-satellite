# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.2.2](https://github.com/julusian/companion-remote/compare/v0.2.1...v0.2.2) (2021-02-01)


### Bug Fixes

* allow a few unacked pings before restarting connection ([7c880a2](https://github.com/julusian/companion-remote/commit/7c880a288c08245e42b2844068e233e8e5d3a4d6))
* handle reconnect better ([be5ad79](https://github.com/julusian/companion-remote/commit/be5ad798a57a1f58e4f8462fc7faddeec90151f7))
* headless process not exiting ([3821983](https://github.com/julusian/companion-remote/commit/3821983765fdb9292c6cdcd4ea84bd93debc40e5))
* on device detect scan now and after a short delay. often on mac the delay is needed to find the device when scanning ([375d5d4](https://github.com/julusian/companion-remote/commit/375d5d4038b56c998004ee20cb540a3e7c746c4f))
* opening connection to localhost before target at starutp ([118d149](https://github.com/julusian/companion-remote/commit/118d149f2e29330d350dabffdfd8b6794ec56125))
* replace packet parsing recursion with a loop to avoid max call stack issues ([bb46f5a](https://github.com/julusian/companion-remote/commit/bb46f5a211cc7e76f1479b98f85e7b07e708a297))

### [0.2.1](https://github.com/julusian/companion-remote/compare/v0.2.0...v0.2.1) (2021-01-21)


### Bug Fixes

* replace canvas with sharp for  card generation. ensure queue is discarded when device is registered and ready for images ([7639666](https://github.com/julusian/companion-remote/commit/76396664101ac80462f4884f999ccd3d97c41707))

## [0.2.0](https://github.com/julusian/companion-remote/compare/v0.1.0...v0.2.0) (2021-01-20)


### Features

* add scan option to tray menu ([cbbd6dd](https://github.com/julusian/companion-remote/commit/cbbd6dd36f60dc1cf76e67bb7eb7d666d86106cf))
* basic status card on streamdecks ([2ae218c](https://github.com/julusian/companion-remote/commit/2ae218cf4244084df695cfa10490434d26ec2929))
* electron 10 ([95d126e](https://github.com/julusian/companion-remote/commit/95d126ed83bc8033f5c94474d9a1dead1978c6ad))
* naive ping tracking, to quickly detect timeouts ([98c11f9](https://github.com/julusian/companion-remote/commit/98c11f98b078a6e63d0fa6856f13b526117fa91c))


### Bug Fixes

* allow changing connection while connceted ([01039b4](https://github.com/julusian/companion-remote/commit/01039b4a7f688db03b0f5fbdd1d0f16f3c470f89))
* allow html in description ([6b78224](https://github.com/julusian/companion-remote/commit/6b7822483ee25d924cf5dc88cf7e787a251ee60b))
* changing ip doesnt error so much ([31fb0a7](https://github.com/julusian/companion-remote/commit/31fb0a76f775eedb73a7b51283f2714f80b1fbfa))
* electron freezing after closing dialog, or exiting after the ip prompt ([7b0bad2](https://github.com/julusian/companion-remote/commit/7b0bad243a1cf5d9b6a030e20608b586ef47c200))
* ensure connection is cleaned up on exit ([53edebf](https://github.com/julusian/companion-remote/commit/53edebfd734ffa07c4dcca822fb5cbb5ec567629))
* load icon image manually, as canvas can't read from asar ([f047da4](https://github.com/julusian/companion-remote/commit/f047da4a8cac3ee9d38d37a6a61217e34f02a708))
* not quitting ([cc6e061](https://github.com/julusian/companion-remote/commit/cc6e0619284504e0446c69ced766a36a7f85186f))
* scan for devices at startup while no companion connection. show key status on devices before they are fully initialised ([cee053f](https://github.com/julusian/companion-remote/commit/cee053f89ea2d23dc447e57d37f7fd9917daa917))
