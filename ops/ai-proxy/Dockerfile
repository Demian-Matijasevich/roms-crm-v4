FROM node:22-alpine

WORKDIR /app

# Instalar Claude Code (headless) — usa las credenciales del volumen mounted.
RUN npm i -g @anthropic-ai/claude-code@latest

# Express + server
COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PORT=3007
ENV CLAUDE_BIN=claude
EXPOSE 3007

CMD ["node", "server.js"]
