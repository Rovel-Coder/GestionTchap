FROM node:20-slim

WORKDIR /app

# Outils de compilation nécessaires pour better-sqlite3 (module natif requis par NodeCryptoStorageProvider)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "src/index.js"]
