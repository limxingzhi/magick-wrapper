FROM node:20-alpine

RUN apk add --no-cache \
    imagemagick \
    jpeg \
    libpng \
    libwebp \
    fontconfig \
    ttf-dejavu

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY index.js .

EXPOSE 3000

CMD ["node", "index.js"]
