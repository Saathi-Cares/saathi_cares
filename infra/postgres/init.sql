-- Roles per PLAN.md §8.8. Runs once, on the first start of an empty data directory.
-- The official postgres image runs *.sql files in /docker-entrypoint-initdb.d/ with psql as the superuser,
-- so the backtick \set lines below read the passwords from the container's environment.
\set owner_pw `echo "$SAATHI_OWNER_PASSWORD"`
\set app_pw   `echo "$SAATHI_APP_PASSWORD"`

create role saathi_owner login password :'owner_pw';
create role saathi_app   login password :'app_pw';

create database saathi owner saathi_owner;
\connect saathi

-- pg_stat_statements needs shared_preload_libraries (set in postgresql.conf); safe here.
create extension if not exists pg_stat_statements;

-- The app may create exactly one schema: pg-boss's (see src/server/README.md).
grant connect, create on database saathi to saathi_app;
grant usage on schema public to saathi_app;

-- Tables created by future migrations (run as saathi_owner) are readable/writable by the app by default.
-- Migrations that must withhold UPDATE/DELETE (audit_log, payment_events, ...) revoke explicitly.
alter default privileges for role saathi_owner in schema public grant select, insert, update, delete on tables to saathi_app;
alter default privileges for role saathi_owner in schema public grant usage, select on sequences to saathi_app;
