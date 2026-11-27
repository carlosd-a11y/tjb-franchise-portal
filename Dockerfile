# The built site and the API ship together, so there is one thing to deploy.
# Stage one builds the React app; stage two runs Flask and serves both.

FROM node:22-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/ ./server/
COPY --from=build /build/dist ./dist

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORTAL_DB=/data/portal.db

EXPOSE 5005
# One worker keeps the intake rate limiter's writes in one place. Threads carry
# the concurrency; nothing here is CPU bound.
CMD ["gunicorn", "--chdir", "server", "--workers", "1", "--threads", "8", \
     "--timeout", "120", "--bind", "0.0.0.0:5005", "wsgi:app"]
