FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY scripts/ ./scripts/
COPY data/ ./data/

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV API_PREFIX=/api

EXPOSE 3000

CMD ["node", "src/main.js"]