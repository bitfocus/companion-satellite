FROM node:12-slim
COPY . /build
WORKDIR /build
CMD ["node", "dist/index.js"]
