FROM node:24-slim

RUN apt-get update && apt-get install -y \
    ffmpeg fontconfig sed wget curl ca-certificates python3 unzip \
    libnss3 libnspr4 \
    libatk-bridge2.0-0 libgtk-3-0 libxss1 \
    libasound2 libgbm-dev libatk1.0-0 libpangocairo-1.0-0 \
    libatspi2.0-0 libdrm2 libxdamage1 libxrandr2 x11-utils \
    libxcomposite1 libxfixes3 libxkbcommon0 libx11-xcb1 \
    libxext6 libxrender1 libcups2 libdbus-1-3 \
    libpango-1.0-0 libcairo2 libexpat1 \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN wget -qO- https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

RUN wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

COPY src/package.json ./
RUN npm install

COPY src/ /app/

EXPOSE 3000

CMD ["node", "index.js"]