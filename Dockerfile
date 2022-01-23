FROM node:14

WORKDIR /app
COPY . /app/

RUN yarn
RUN yarn build
RUN yarn --prod

FROM node:14-slim

WORKDIR /app
COPY --from=0 /app/	/app/

RUN apt-get update && apt-get install -y \
	libusb-1.0 \
	&& rm -rf /var/lib/apt/lists/*

USER node
ENTRYPOINT ["node", "/app/dist/main.js"]
