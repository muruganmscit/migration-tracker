# One image for the whole portal: the React client is built to static files and served by the API server.

FROM node:20 AS client
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build
COPY --from=client /client/dist ./public
ENV PORT=4000 CLIENT_DIST=/app/public
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm start"]
