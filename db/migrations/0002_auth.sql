alter table users add column password_hash text not null;
create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on sessions (user_id);

-- The app role can no longer read or write users directly; only these narrow functions.
revoke select, insert on users from ledgerflow_app;
create function create_user(p_email text, p_name text, p_hash text) returns uuid
language sql security definer set search_path = public as
$$ insert into users(email, name, password_hash) values (lower(p_email), p_name, p_hash) returning id $$;
create function find_login(p_email text) returns table (id uuid, password_hash text)
language sql security definer set search_path = public as
$$ select u.id, u.password_hash from users u where u.email = lower(p_email) $$;
create function session_user_info(p_token_hash text) returns table (id uuid, email text, name text)
language sql security definer set search_path = public as
$$ select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id
   where s.token_hash = p_token_hash and s.expires_at > now() $$;
create function list_memberships(p_user uuid) returns table (organisation_id uuid, name text, base_currency char(3), role text)
language sql security definer set search_path = public as
$$ select o.id, o.name, o.base_currency, m.role from memberships m
   join organisations o on o.id = m.organisation_id where m.user_id = p_user order by o.name $$;

grant select, insert, delete on sessions to ledgerflow_app;
grant execute on function create_user(text,text,text), find_login(text), session_user_info(text), list_memberships(uuid) to ledgerflow_app;
