create table customers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  name text not null,
  email text,
  created_at timestamptz not null default now(),
  unique (organisation_id, id)
);
create table invoice_sequences (
  organisation_id uuid primary key references organisations(id),
  next_number int not null
);
create table invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  customer_id uuid not null,
  number text,
  status text not null default 'DRAFT' check (status in ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID')),
  currency char(3) not null,
  issue_date date,
  due_date date not null,
  total_minor bigint not null check (total_minor > 0),
  paid_minor bigint not null default 0 check (paid_minor >= 0 and paid_minor <= total_minor),
  journal_id uuid,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, number),
  foreign key (organisation_id, customer_id) references customers(organisation_id, id),
  foreign key (organisation_id, journal_id) references journal_transactions(organisation_id, id)
);
create index on invoices (organisation_id, status, due_date);
create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  invoice_id uuid not null,
  description text not null,
  quantity int not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null check (line_total_minor >= 0),
  foreign key (organisation_id, invoice_id) references invoices(organisation_id, id)
);
create index on invoice_lines (organisation_id, invoice_id);

do $$ declare t text; begin
  foreach t in array array['customers','invoice_sequences','invoices','invoice_lines'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I using (organisation_id = current_org()) with check (organisation_id = current_org())', t);
  end loop;
end $$;

-- Issued invoices are immutable; lines can only be added while the invoice is a draft.
create function guard_invoice() returns trigger language plpgsql as $$
begin
  if old.status <> 'DRAFT' and (new.customer_id <> old.customer_id or new.total_minor <> old.total_minor
     or new.currency <> old.currency or new.number is distinct from old.number) then
    raise exception 'issued invoices are immutable';
  end if;
  if old.status = 'DRAFT' and new.status not in ('DRAFT','ISSUED') then
    raise exception 'invalid invoice status transition';
  end if;
  return new;
end $$;
create trigger guard_invoice before update on invoices for each row execute function guard_invoice();
create function guard_invoice_lines() returns trigger language plpgsql as $$
begin
  if (select status from invoices where id = new.invoice_id) <> 'DRAFT' then
    raise exception 'lines can only be added to draft invoices';
  end if;
  return new;
end $$;
create trigger guard_lines before insert on invoice_lines for each row execute function guard_invoice_lines();

grant select, insert, update on customers, invoices, invoice_sequences to ledgerflow_app;
grant select, insert on invoice_lines to ledgerflow_app;
