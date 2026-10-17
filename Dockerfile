FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
# Needs SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET (see README.md)
CMD ["node", "server.js"]
