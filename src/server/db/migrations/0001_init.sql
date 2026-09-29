-- 0001: extensions used across the schema (PLAN.md §8.8). pg_stat_statements is created by
-- infra/postgres/init.sql because it needs shared_preload_libraries, which a plain CI service lacks.
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;
