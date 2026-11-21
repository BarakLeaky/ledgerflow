create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null,
  created_at timestamptz not null default now()
);
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_currency char(3) not null,
  created_at timestamptz not null default now()
);
create table memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  user_id uuid not null references users(id),
  role text not null check (role in ('owner','administrator','finance_manager','accountant','staff','approver','auditor','support')),
  created_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);
create table chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  code text not null,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  unique (organisation_id, code),
  unique (organisation_id, id)
);
create table journal_transactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  posted_at timestamptz not null default now(),
  description text not null,
  source_type text not null,
  source_id uuid,
  reverses_id uuid,
  idempotency_key text not null,
  created_by uuid references users(id),
  unique (organisation_id, id),
  unique (organisation_id, idempotency_key),
  foreign key (organisation_id, reverses_id) references journal_transactions(organisation_id, id)
);
create table journal_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  transaction_id uuid not null,
  account_id uuid not null,
  currency char(3) not null,
  amount_minor bigint not null check (amount_minor > 0),
  direction text not null check (direction in ('DEBIT','CREDIT')),
  foreign key (organisation_id, transaction_id) references journal_transactions(organisation_id, id),
  foreign key (organisation_id, account_id) references chart_of_accounts(organisation_id, id)
);
create index on journal_lines (organisation_id, transaction_id);
create index on journal_lines (organisation_id, account_id);
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  actor_user_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  reason text,
  correlation_id text,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index on audit_logs (organisation_id, occurred_at desc);
create table idempotency_keys (
  organisation_id uuid not null references organisations(id),
  key text not null,
  operation text not null,
  request_hash text not null,
  result_ref jsonb,
  created_at timestamptz not null default now(),
  primary key (organisation_id, key)
);

-- Tenant isolation: org comes from a transaction-local setting, set by the server only.
create function current_org() returns uuid language sql stable as
$$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

do $$ declare t text; begin
  foreach t in array array['memberships','chart_of_accounts','journal_transactions','journal_lines','audit_logs','idempotency_keys'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I using (organisation_id = current_org()) with check (organisation_id = current_org())', t);
  end loop;
end $$;
alter table organisations enable row level security;
create policy tenant_isolation on organisations using (id = current_org()) with check (id = current_org());

-- Membership lookup before a tenant is selected (runs as owner, returns role only).
create function resolve_membership(p_user uuid, p_org uuid) returns text
language sql security definer set search_path = public as
$$ select role from memberships where user_id = p_user and organisation_id = p_org $$;

-- Append-only ledger and audit trail.
create function forbid_mutation() returns trigger language plpgsql as
$$ begin raise exception '% on % is not allowed: append-only', tg_op, tg_table_name; end $$;
create trigger no_mutate before update or delete on journal_lines for each row execute function forbid_mutation();
create trigger no_mutate before update or delete on journal_transactions for each row execute function forbid_mutation();
create trigger no_mutate before update or delete on audit_logs for each row execute function forbid_mutation();

-- Deferred check: at commit, >=2 lines and debits = credits per currency.
create function check_journal_balance() returns trigger language plpgsql as $$
declare cnt int; bad int;
begin
  select count(*) into cnt from journal_lines where transaction_id = new.transaction_id;
  if cnt < 2 then raise exception 'journal % needs at least two lines', new.transaction_id; end if;
  select count(*) into bad from (
    select currency from journal_lines where transaction_id = new.transaction_id
    group by currency
    having sum(case when direction = 'DEBIT' then amount_minor else -amount_minor end) <> 0) t;
  if bad > 0 then raise exception 'journal % is unbalanced', new.transaction_id; end if;
  return null;
end $$;
create constraint trigger journal_balanced after insert on journal_lines
  deferrable initially deferred for each row execute function check_journal_balance();

-- Least-privilege app role: no UPDATE/DELETE on ledger or audit tables.
grant usage on schema public to ledgerflow_app;
grant select, insert on users, organisations, journal_transactions, journal_lines, audit_logs, idempotency_keys to ledgerflow_app;
grant select, insert, update on memberships, chart_of_accounts to ledgerflow_app;
grant execute on function resolve_membership(uuid, uuid), current_org() to ledgerflow_app;
