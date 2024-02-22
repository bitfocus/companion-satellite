FROM node:16-bullseye

WORKDIR /app
COPY . /app/

RUN apt-get update && apt-get install -y \
	libusb-1.0-0-dev \
	libudev-dev \
	unzip \
	&& rm -rf /var/lib/apt/lists/*

RUN yarn config set network-timeout 100000 -g
RUN yarn --frozen-lockfile
RUN yarn build
RUN yarn --prod --frozen-lockfile

# rebuild node-usb to not use udev, as udev doesn't work in docker
RUN sed -i "s/'use_udev%': 1/'use_udev%': 0/" node_modules/usb/libusb.gypi
RUN cd node_modules/usb && rm -R prebuilds && yarn node-gyp-build

# patch node-hid to use the same version of libusb as node-usb, otherwise freshly plugged devices never appear
# 'stealing' some help from node-usb, as they have a decent build system for libusb
ADD https://github.com/libusb/libusb/archive/e782eeb2514266f6738e242cdcb18e3ae1ed06fa.zip node_modules/node-hid/libusb.zip
ADD https://raw.githubusercontent.com/node-usb/node-usb/52b879c91df3fc594832d37081c9c3bf4b02d064/libusb.gypi node_modules/node-hid/libusb.gypi
RUN cd node_modules/node-hid && unzip libusb.zip && mv libusb-e782eeb2514266f6738e242cdcb18e3ae1ed06fa libusb
RUN sed -i "s/'use_udev%': 1/'use_udev%': 0/" node_modules/node-hid/libusb.gypi
RUN mkdir node_modules/node-hid/libusb_config && touch node_modules/node-hid/libusb_config/config.h
# TODO: this is very brittle working by line number, this needs a better matcher
RUN sed -i "36s/.*/'dependencies': [ 'libusb.gypi\:libusb', ]/g" node_modules/node-hid/binding.gyp
RUN cd node_modules/node-hid && rm -R build && yarn gypconfigure && yarn gypbuild

FROM node:16-bullseye-slim

WORKDIR /app
COPY --from=0 /app/	/app/

USER node
ENTRYPOINT ["node", "/app/satellite/dist/main.js"]
