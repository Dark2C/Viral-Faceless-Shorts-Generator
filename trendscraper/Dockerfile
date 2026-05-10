FROM node:24-slim

RUN apt-get update && apt-get install -y \
    ffmpeg fontconfig sed wget ca-certificates python3 \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

COPY src/package.json ./
RUN npm install

COPY src/ /app/

EXPOSE 3000

CMD ["node", "index.js"]
