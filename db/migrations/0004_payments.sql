create table payments (
  id uuid primary key,
  organisation_id uuid not null references organisations(id),
  customer_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  method text not null check (method in ('CASH','BANK_TRANSFER','MPESA','CARD','OTHER')),
  reference text,
  received_on date not null,
  journal_id uuid not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, customer_id) references customers(organisation_id, id),
  foreign key (organisation_id, journal_id) references journal_transactions(organisation_id, id)
);
-- The same method + reference can only be recorded once per organisation (blocks double entry).
create unique index payments_ref_unique on payments (organisation_id, method, reference) where reference is not null;
create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  payment_id uuid not null,
  invoice_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  foreign key (organisation_id, payment_id) references payments(organisation_id, id),
  foreign key (organisation_id, invoice_id) references invoices(organisation_id, id)
);
create index on payment_allocations (organisation_id, invoice_id);

do $$ declare t text; begin
  foreach t in array array['payments','payment_allocations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I using (organisation_id = current_org()) with check (organisation_id = current_org())', t);
    execute format('create trigger no_mutate before update or delete on %I for each row execute function forbid_mutation()', t);
  end loop;
end $$;
grant select, insert on payments, payment_allocations to ledgerflow_app;

-- An invoice is PAID exactly when its allocations cover the total.
alter table invoices add constraint invoice_paid_state check ((status = 'PAID') = (paid_minor = total_minor));
