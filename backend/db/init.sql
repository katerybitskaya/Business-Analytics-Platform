CREATE DATABASE analytics_db
    ENCODING 'UTF8'
    LC_COLLATE 'en_US.UTF-8'
    LC_CTYPE 'en_US.UTF-8'
    TEMPLATE template0;

CREATE USER analytics_user WITH PASSWORD 'CHANGE_ME_LOCAL_PASSWORD';

GRANT ALL PRIVILEGES ON DATABASE analytics_db TO analytics_user;

\c analytics_db
GRANT ALL ON SCHEMA public TO analytics_user;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
