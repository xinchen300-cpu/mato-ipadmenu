-- Automaat Menu: digitaal menu op een iPad naast de automaat (21-10-2026).
-- Staat volledig los van de rest van de database. Alles heet menu_* of staat in schema menu_private.
-- Verwijderen: drop schema menu_private cascade; drop table public.menu_document;
--   drop function public.menu_session_ok, public.menu_login, public.menu_logout,
--   public.menu_change_password, public.menu_save; bucket menu-media legen en verwijderen.

create schema if not exists menu_private;
revoke all on schema menu_private from public, anon, authenticated;

create table if not exists menu_private.admin (
  id int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists menu_private.sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days'
);

create table if not exists menu_private.backups (
  day date primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_document (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
comment on table public.menu_document is
  'Automaat Menu (iPad naast de automaat, beheer op /admin): het hele menu als één JSON-document met handelaars, secties, producten en instellingen. Iedereen mag lezen; schrijven alleen via menu_save() met een beheersessie (21-10-2026).';

alter table public.menu_document enable row level security;
drop policy if exists "menu_document is publiek leesbaar" on public.menu_document;
create policy "menu_document is publiek leesbaar" on public.menu_document
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.menu_document from anon, authenticated;
-- Nodig in projecten die nieuwe tabellen niet automatisch openzetten voor de API (zoals vendly).
grant select on public.menu_document to anon, authenticated;

create or replace function menu_private.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function menu_private.session_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from menu_private.sessions
    where token_hash = menu_private.token_hash(p_token) and expires_at > now()
  );
$$;

create or replace function public.menu_session_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select menu_private.session_ok(p_token);
$$;

create or replace function public.menu_login(p_password text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text;
  v_token text;
begin
  select password_hash into v_hash from menu_private.admin where id = 1;
  if v_hash is null or extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    raise exception 'ONJUIST_WACHTWOORD' using errcode = '28P01';
  end if;
  delete from menu_private.sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into menu_private.sessions (token_hash) values (menu_private.token_hash(v_token));
  return v_token;
end $$;

create or replace function public.menu_logout(p_token text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from menu_private.sessions where token_hash = menu_private.token_hash(p_token);
$$;

create or replace function public.menu_change_password(p_token text, p_new text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not menu_private.session_ok(p_token) then
    raise exception 'NIET_INGELOGD' using errcode = '28000';
  end if;
  if length(coalesce(p_new, '')) < 10 then
    raise exception 'WACHTWOORD_TE_KORT' using errcode = '22023';
  end if;
  update menu_private.admin
    set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8)), updated_at = now()
    where id = 1;
  -- Andere apparaten moeten opnieuw inloggen.
  delete from menu_private.sessions where token_hash <> menu_private.token_hash(p_token);
end $$;

-- p_base_version: de versie die het beheer heeft geladen. Is het menu intussen elders
-- gewijzigd, dan weigeren we, zodat niemand ongemerkt andermans wijzigingen overschrijft.
create or replace function public.menu_save(p_token text, p_data jsonb, p_base_version bigint) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_version bigint;
begin
  if not menu_private.session_ok(p_token) then
    raise exception 'NIET_INGELOGD' using errcode = '28000';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object'
     or jsonb_typeof(p_data -> 'settings') is distinct from 'object'
     or jsonb_typeof(p_data -> 'vendors') is distinct from 'array'
     or jsonb_typeof(p_data -> 'sections') is distinct from 'array'
     or jsonb_typeof(p_data -> 'products') is distinct from 'array' then
    raise exception 'ONGELDIG_MENU' using errcode = '22023';
  end if;
  if pg_column_size(p_data) > 5 * 1024 * 1024 then
    raise exception 'MENU_TE_GROOT' using errcode = '22023';
  end if;

  select version into v_version from public.menu_document where id = 1 for update;
  if v_version is not null and p_base_version is distinct from v_version then
    raise exception 'CONFLICT' using errcode = '40001';
  end if;

  -- Eén reservekopie per dag (de versie van vóór de eerste wijziging die dag), 60 dagen bewaard.
  insert into menu_private.backups (day, data)
    select current_date, data from public.menu_document where id = 1
    on conflict (day) do nothing;
  delete from menu_private.backups where day < current_date - 60;

  if v_version is null then
    insert into public.menu_document (id, data) values (1, p_data) returning version into v_version;
  else
    update public.menu_document
      set data = p_data, version = version + 1, updated_at = now()
      where id = 1
      returning version into v_version;
  end if;
  return v_version;
end $$;

revoke all on all functions in schema menu_private from public, anon, authenticated;
revoke all on function public.menu_session_ok(text), public.menu_login(text), public.menu_logout(text),
  public.menu_change_password(text, text), public.menu_save(text, jsonb, bigint) from public;
grant execute on function public.menu_session_ok(text), public.menu_login(text), public.menu_logout(text),
  public.menu_change_password(text, text), public.menu_save(text, jsonb, bigint) to anon, authenticated, service_role;

-- Foto's en video's. Openbaar leesbaar; uploaden alleen via de edge function menu-upload,
-- die eerst de beheersessie controleert. 50 MB is het maximum van het gratis abonnement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-media', 'menu-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;
