# Запуск в Docker (Ubuntu 22.04 LTS, демо)

Три контейнера: `postgres`, `backend` (FastAPI, миграции применяются автоматически при старте), `frontend` (nginx, раздаёт React-сборку и проксирует `/api`, включая WebSocket). Без hot-reload — после изменения кода нужна пересборка образа.

Все файлы, связанные с Docker, лежат в этой папке (`docker/`). Сами `Dockerfile`/`.dockerignore` остаются в `backend/` и `frontend/` — так требует Docker (build context).

## Первый запуск

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
```

```bash
cd swot/docker
cp postgres.env.example .env                          # заполнить POSTGRES_*
cp backend.env.docker.example backend.env.docker       # заполнить реальными значениями
```

Значения `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` в `.env` должны совпадать с тем, что указано в `DATABASE_URL` внутри `backend.env.docker`.

```bash
sudo docker compose up -d --build
```

Гость (`guest`/`guest12345`) и все эталонные примеры создаются автоматически при первом старте backend — вручную запускать `seed_guest.py` не нужно.

Приложение доступно на `http://<IP сервера>:8080` (порт 8080 — чтобы не конфликтовать с Apache на 80).

> Образы: PostgreSQL 17, Python 3.12 — как на VPS. Если раньше уже запускался вариант
> с PostgreSQL 16, старый volume с базой 17-я версия не откроет: сделать дамп, затем
> `sudo docker compose down -v` (удалит данные!) и восстановить дамп в новый контейнер.

## После изменений в коде

```bash
cd swot/docker
sudo docker compose up -d --build
```

## Полезное

```bash
cd swot/docker
sudo docker compose logs -f backend    # логи backend (плюс файлы в ../logs — они смонтированы с хоста)
sudo docker compose logs -f frontend
sudo docker compose ps
sudo docker compose down               # остановить (данные БД и аватары остаются в volume)
```
