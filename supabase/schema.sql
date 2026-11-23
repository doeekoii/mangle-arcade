-- =====================================================================
-- 맹글아케이드 부스 미니홈피 — Supabase 스키마
-- Supabase 대시보드 → SQL Editor → 새 쿼리에 이 파일 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하도록 작성돼 있어요.
-- 비밀번호(관리자·팀 PIN)는 이 파일에 들어 있지 않아요.
--   · 관리자 비밀번호: 배포 후 사이트의 #admin 화면에서 처음 한 번 만들어요.
--   · 팀 PIN: 관리자 화면에서 부스를 등록하거나 'PIN 재발급'을 누르면 발급돼요.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 테이블 ----------
create table if not exists public.booths (
  id          text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  no          text not null default '' check (char_length(no) <= 10),
  name        text not null default '새 부스' check (char_length(name) between 1 and 40),
  profile     jsonb not null default '{}'::jsonb check (pg_column_size(profile) < 20000),
  logo_url    text not null default '',
  logo_fit    text not null default 'contain' check (logo_fit in ('contain','fill')),
  updated_at  timestamptz not null default now()
);

create table if not exists public.booth_secrets (
  booth_id  text primary key references public.booths(id) on delete cascade,
  pin_hash  text not null
);

create table if not exists public.app_secrets (
  key   text primary key,
  hash  text not null
);

create table if not exists public.pin_attempts (
  id     bigserial primary key,
  scope  text not null,
  ok     boolean not null,
  at     timestamptz not null default now()
);
create index if not exists pin_attempts_scope_at on public.pin_attempts (scope, at);

create table if not exists public.guestbook (
  id          uuid primary key default gen_random_uuid(),
  booth_id    text not null references public.booths(id) on delete cascade,
  nick        text not null default '익명' check (char_length(nick) between 1 and 20),
  msg         text not null check (char_length(msg) between 1 and 500),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists guestbook_booth_at on public.guestbook (booth_id, created_at desc);

create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  booth_id    text not null references public.booths(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  org         text not null default '' check (char_length(org) <= 60),
  role        text not null default '' check (char_length(role) <= 40),
  tel         text not null default '' check (char_length(tel) <= 30),
  mail        text not null default '' check (char_length(mail) <= 80),
  memo        text not null default '' check (char_length(memo) <= 300),
  img_url     text not null default '' check (img_url = '' or img_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/uploads/cards/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  agreed      boolean not null check (agreed),
  created_at  timestamptz not null default now()
);
create index if not exists cards_booth_at on public.cards (booth_id, created_at desc);

create table if not exists public.visits (
  booth_id  text not null references public.booths(id) on delete cascade,
  visitor   text not null check (char_length(visitor) between 8 and 64),
  day       date not null,
  primary key (booth_id, visitor, day)
);

-- ---------- 접근 규칙 (RLS) ----------
alter table public.booths        enable row level security;
alter table public.booth_secrets enable row level security;
alter table public.app_secrets   enable row level security;
alter table public.pin_attempts  enable row level security;
alter table public.guestbook     enable row level security;
alter table public.cards         enable row level security;
alter table public.visits        enable row level security;

drop policy if exists booths_read on public.booths;
create policy booths_read on public.booths for select to anon, authenticated using (true);

drop policy if exists gb_read on public.guestbook;
create policy gb_read on public.guestbook for select to anon, authenticated using (not hidden);
drop policy if exists gb_insert on public.guestbook;
create policy gb_insert on public.guestbook for insert to anon, authenticated with check (not hidden);

-- 명함: 누구나 보낼 수만 있고, 읽기는 팀 PIN이 있어야 하는 get_cards 함수로만 가능
drop policy if exists cards_insert on public.cards;
create policy cards_insert on public.cards for insert to anon, authenticated with check (agreed);

-- booth_secrets, app_secrets, pin_attempts, visits 에는 정책이 없어서 직접 접근 불가 (함수로만)

-- 테이블 권한: 필요한 것만 명시적으로 열어요 ('새 테이블 자동 API 권한' 설정이 꺼져 있어도 동작)
grant usage on schema public to anon, authenticated;
revoke all on public.booths, public.booth_secrets, public.app_secrets, public.pin_attempts,
              public.guestbook, public.cards, public.visits from anon, authenticated;
grant select on public.booths to anon, authenticated;
grant select, insert on public.guestbook to anon, authenticated;
grant insert on public.cards to anon, authenticated;

-- ---------- 내부 함수 ----------
create or replace function public._admin_ok(p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_fails int; v_hash text; v_ok boolean;
begin
  select count(*) into v_fails from pin_attempts
   where scope = 'admin' and not pin_attempts.ok and at > now() - interval '10 minutes';
  if v_fails >= 5 then raise exception 'locked'; end if;
  select hash into v_hash from app_secrets where key = 'admin';
  v_ok := v_hash is not null and p_pin is not null and crypt(p_pin, v_hash) = v_hash;
  insert into pin_attempts(scope, ok) values ('admin', v_ok);
  return v_ok;
end $$;

create or replace function public._can_edit(p_booth text, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_fails int; v_admin text; v_team text; v_ok boolean;
begin
  select count(*) into v_fails from pin_attempts
   where scope = 'booth:' || p_booth and not pin_attempts.ok and at > now() - interval '10 minutes';
  if v_fails >= 5 then raise exception 'locked'; end if;
  if p_pin is null or p_pin = '' then return false; end if;
  select hash into v_admin from app_secrets where key = 'admin';
  if v_admin is not null and crypt(p_pin, v_admin) = v_admin then return true; end if;
  select pin_hash into v_team from booth_secrets where booth_id = p_booth;
  v_ok := v_team is not null and crypt(p_pin, v_team) = v_team;
  insert into pin_attempts(scope, ok) values ('booth:' || p_booth, v_ok);
  return v_ok;
end $$;

create or replace function public._new_pin()
returns text language sql volatile set search_path = public, extensions as $$
  select lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0')
$$;

revoke all on function public._admin_ok(text)         from public, anon, authenticated;
revoke all on function public._can_edit(text, text)   from public, anon, authenticated;
revoke all on function public._new_pin()              from public, anon, authenticated;

-- ---------- 공개 함수: 방문 ----------
create or replace function public.record_visit(p_booth text, p_visitor text)
returns json language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not exists (select 1 from booths where id = p_booth) then return json_build_object('today', 0, 'total', 0); end if;
  insert into visits(booth_id, visitor, day) values (p_booth, p_visitor, v_day) on conflict do nothing;
  return json_build_object(
    'today', (select count(*) from visits where booth_id = p_booth and day = v_day),
    'total', (select count(*) from visits where booth_id = p_booth));
end $$;

-- ---------- 공개 함수: 팀 ----------
create or replace function public.verify_pin(p_booth text, p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
begin return _can_edit(p_booth, p_pin); end $$;

create or replace function public.update_booth(p_booth text, p_pin text, p_name text, p_profile jsonb, p_logo_url text, p_logo_fit text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _can_edit(p_booth, p_pin) then raise exception 'denied'; end if;
  if coalesce(p_logo_url, '') <> '' and p_logo_url !~ '^(https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/uploads/logos/[a-z0-9-]+\.(png|jpg|webp)|/assets/logos/[a-z0-9-]+\.png)$' then
    raise exception 'bad logo';
  end if;
  update booths set name = p_name, profile = coalesce(p_profile, '{}'::jsonb), logo_url = coalesce(p_logo_url, ''),
         logo_fit = coalesce(p_logo_fit, 'contain'), updated_at = now()
   where id = p_booth;
end $$;

create or replace function public.get_cards(p_booth text, p_pin text)
returns setof public.cards language plpgsql security definer set search_path = public as $$
begin
  if not _can_edit(p_booth, p_pin) then raise exception 'denied'; end if;
  return query select * from cards where booth_id = p_booth order by created_at desc;
end $$;

create or replace function public.set_guestbook_hidden(p_booth text, p_pin text, p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _can_edit(p_booth, p_pin) then raise exception 'denied'; end if;
  update guestbook set hidden = p_hidden where id = p_id and booth_id = p_booth;
end $$;

-- ---------- 공개 함수: 관리자 ----------
create or replace function public.admin_status()
returns json language sql security definer set search_path = public as $$
  select json_build_object('initialized', exists (select 1 from app_secrets where key = 'admin'))
$$;

-- 관리자 비밀번호가 아직 없을 때만 한 번 설정 가능
create or replace function public.admin_init(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if char_length(coalesce(p_pin, '')) < 8 then raise exception 'too short'; end if;
  insert into app_secrets(key, hash) values ('admin', crypt(p_pin, gen_salt('bf'))) on conflict (key) do nothing;
  if not found then raise exception 'already initialized'; end if;
end $$;

create or replace function public.admin_login(p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
begin return _admin_ok(p_pin); end $$;

-- 부스 등록(없으면 만들고 PIN 발급) 또는 번호·이름 수정. 새 PIN이 발급되면 반환
create or replace function public.admin_upsert_booth(p_admin text, p_id text, p_no text, p_name text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_pin text;
begin
  if not _admin_ok(p_admin) then raise exception 'denied'; end if;
  insert into booths(id, no, name) values (lower(p_id), coalesce(p_no, ''), coalesce(nullif(p_name, ''), '새 부스'))
  on conflict (id) do update set no = excluded.no, name = excluded.name, updated_at = now();
  if not exists (select 1 from booth_secrets where booth_id = lower(p_id)) then
    v_pin := _new_pin();
    insert into booth_secrets(booth_id, pin_hash) values (lower(p_id), crypt(v_pin, gen_salt('bf')));
  end if;
  return v_pin;
end $$;

create or replace function public.admin_reset_pin(p_admin text, p_booth text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_pin text := _new_pin();
begin
  if not _admin_ok(p_admin) then raise exception 'denied'; end if;
  if not exists (select 1 from booths where id = p_booth) then raise exception 'no booth'; end if;
  insert into booth_secrets(booth_id, pin_hash) values (p_booth, crypt(v_pin, gen_salt('bf')))
  on conflict (booth_id) do update set pin_hash = excluded.pin_hash;
  delete from pin_attempts where scope = 'booth:' || p_booth;
  return v_pin;
end $$;

create or replace function public.admin_delete_booth(p_admin text, p_booth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _admin_ok(p_admin) then raise exception 'denied'; end if;
  delete from booths where id = p_booth;
end $$;

drop function if exists public.admin_stats(text);
create or replace function public.admin_stats(p_admin text)
returns table(booth_id text, guestbook bigint, cards bigint, visitors bigint, photos bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not _admin_ok(p_admin) then raise exception 'denied'; end if;
  return query select b.id,
    (select count(*) from guestbook g where g.booth_id = b.id and not g.hidden),
    (select count(*) from cards c where c.booth_id = b.id),
    (select count(distinct v.visitor) from visits v where v.booth_id = b.id),
    (select count(*) from photos p where p.booth_id = b.id and not p.hidden)
  from booths b;
end $$;

grant execute on function public.record_visit(text, text)                            to anon, authenticated;
grant execute on function public.verify_pin(text, text)                              to anon, authenticated;
grant execute on function public.update_booth(text, text, text, jsonb, text, text)   to anon, authenticated;
grant execute on function public.get_cards(text, text)                               to anon, authenticated;
grant execute on function public.set_guestbook_hidden(text, text, uuid, boolean)     to anon, authenticated;
grant execute on function public.admin_status()                                      to anon, authenticated;
grant execute on function public.admin_init(text)                                    to anon, authenticated;
grant execute on function public.admin_login(text)                                   to anon, authenticated;
grant execute on function public.admin_upsert_booth(text, text, text, text)          to anon, authenticated;
grant execute on function public.admin_reset_pin(text, text)                         to anon, authenticated;
grant execute on function public.admin_delete_booth(text, text)                      to anon, authenticated;
grant execute on function public.admin_stats(text)                                   to anon, authenticated;

-- ---------- 사진첩 ----------
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  booth_id    text not null references public.booths(id) on delete cascade,
  url         text not null check (url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/uploads/photos/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  caption     text not null default '' check (char_length(caption) <= 80),
  nick        text not null default '익명' check (char_length(nick) between 1 and 20),
  by_team     boolean not null default false,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists photos_booth_at on public.photos (booth_id, created_at desc);
alter table public.photos add column if not exists like_count int not null default 0;
alter table public.photos add column if not exists thumb_url text not null default ''
  check (thumb_url = '' or thumb_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/uploads/photos/[0-9a-f-]{36}_t\.(jpg|png|webp)$');
alter table public.photos enable row level security;
drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select to anon, authenticated using (not hidden);
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert to anon, authenticated with check (not hidden and not by_team and like_count = 0);
revoke all on public.photos from anon, authenticated;
grant select, insert on public.photos to anon, authenticated;

-- 팀이 올린 사진 (TEAM 표시)
drop function if exists public.add_team_photo(text, text, text, text);
create or replace function public.add_team_photo(p_booth text, p_pin text, p_url text, p_thumb text, p_caption text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _can_edit(p_booth, p_pin) then raise exception 'denied'; end if;
  insert into photos(booth_id, url, thumb_url, caption, nick, by_team)
  values (p_booth, p_url, coalesce(p_thumb, ''), coalesce(p_caption, ''), coalesce(nullif((select name from booths where id = p_booth), ''), '팀'), true);
end $$;

create or replace function public.set_photo_hidden(p_booth text, p_pin text, p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _can_edit(p_booth, p_pin) then raise exception 'denied'; end if;
  update photos set hidden = p_hidden where id = p_id and booth_id = p_booth;
end $$;

grant execute on function public.add_team_photo(text, text, text, text, text)     to anon, authenticated;
grant execute on function public.set_photo_hidden(text, text, uuid, boolean)       to anon, authenticated;

-- ---------- 사진 좋아요 ----------
create table if not exists public.photo_likes (
  photo_id    uuid not null references public.photos(id) on delete cascade,
  visitor     text not null check (char_length(visitor) between 8 and 64),
  created_at  timestamptz not null default now(),
  primary key (photo_id, visitor)
);
alter table public.photo_likes enable row level security;
revoke all on public.photo_likes from anon, authenticated;

-- 누르면 좋아요, 다시 누르면 취소. 방문자(기기)당 사진 하나에 한 번
create or replace function public.toggle_like(p_photo uuid, p_visitor text)
returns json language plpgsql security definer set search_path = public as $$
declare v_liked boolean; v_count int;
begin
  if not exists (select 1 from photos where id = p_photo and not hidden) then raise exception 'no photo'; end if;
  delete from photo_likes where photo_id = p_photo and visitor = p_visitor;
  if found then v_liked := false;
  else insert into photo_likes(photo_id, visitor) values (p_photo, p_visitor); v_liked := true;
  end if;
  update photos set like_count = (select count(*) from photo_likes where photo_id = p_photo) where id = p_photo
  returning like_count into v_count;
  return json_build_object('liked', v_liked, 'count', v_count);
end $$;

create or replace function public.my_likes(p_booth text, p_visitor text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select l.photo_id from photo_likes l join photos p on p.id = l.photo_id
   where p.booth_id = p_booth and l.visitor = p_visitor
$$;

grant execute on function public.toggle_like(uuid, text)  to anon, authenticated;
grant execute on function public.my_likes(text, text)     to anon, authenticated;

-- ---------- 실시간 방명록 (미니룸 말풍선) ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guestbook') then
    alter publication supabase_realtime add table public.guestbook;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photos') then
    alter publication supabase_realtime add table public.photos;
  end if;
end $$;

-- ---------- 사진 저장소 ----------
-- 명함·로고 사진은 추측할 수 없는 무작위 파일명으로 저장되고, 목록 조회는 막혀 있어요.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "mangle upload" on storage.objects;
create policy "mangle upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] in ('cards', 'logos', 'photos'));

-- ---------- 테스트용 예시 부스 (슈퍼말차) ----------
insert into public.booths (id, no, name, logo_url, logo_fit, profile) values (
  'supermatcha', '07', '슈퍼말차', '/assets/logos/supermatcha.png', 'fill',
  jsonb_build_object(
    'short', 'SUPER MATCHA',
    'tagline', '커피 다음의 한 잔, 슈퍼푸드 티',
    'mood', '말차 한 잔으로 풀충전',
    'intro', '2017년 서울에서 시작한 오가닉 티 브랜드예요.',
    'slogan', 'Post Coffee Culture for New Generation',
    'story', '고카페인 커피 대신 몸에 좋은 슈퍼푸드 티를 일상의 한 잔으로 제안하는 오가닉 티 브랜드예요. Hayden과 Amy가 함께 시작했고, 지속 가능한 식습관과 한국의 식음료 문화를 세계에 알리는 것을 목표로 해요.',
    'values', jsonb_build_array('슈가 라이트', '영양 가득', '100% 오가닉', '에너지 부스터', '풍부한 항산화'),
    'products', jsonb_build_array('SUPER MATCHA™ — 대표 말차 라인', 'SUPER BORI™ — 보리 티 라인', '디저트 · 기프트 · 굿즈', '카페 메뉴: 리프레셔 · 소프트서브 · 커피 · 베이커리'),
    'certs', jsonb_build_array('비건', '유기농 인증', 'Non-GMO'),
    'impact', 'water.org 공식 기부처로 물 부족 국가의 식수 지원에 참여하고, 일회용품은 플라스틱 대신 생분해 PLA를 사용해요.',
    'regions', '한국 · 말레이시아 · 태국 · 필리핀',
    'founders', 'Hayden, Amy',
    'founded', '2017',
    'company', '주식회사 힛더티 (서울 성동구)',
    'insta', 'supermatcha.official',
    'web', 'https://supermatcha.com',
    'news', '맹글아케이드 부스 미니홈피 테스트 중이에요. 방명록과 명함을 남겨 보세요.'
  )
) on conflict (id) do nothing;
