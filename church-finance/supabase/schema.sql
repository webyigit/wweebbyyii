-- 교회 재정관리 — 클라우드 데이터베이스 설정 (Supabase)
-- 사용법: Supabase 대시보드 → 왼쪽 SQL Editor → New query → 이 파일 내용을 전부 붙여넣고 Run.
--        여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
-- 마지막의 사용자 4명 이메일만 교회에 맞게 고쳐서 실행하세요.

-- ─────────────────────────────────────────────────────────────
-- 1. 사용할 수 있는 사람과 역할 (여기에 없는 사람은 아무것도 못 봄)
--    bookkeeper = 기장회계(헌금·교인), cashier = 출납회계(지출·통장·예산),
--    finance_head = 재정부장(보기), pastor = 담임목사(보기)
-- ─────────────────────────────────────────────────────────────
--    한 사람이 두 역할을 맡아도 됩니다 (같은 이메일을 두 줄에 쓰면 두 역할 모두 가짐)
create table if not exists public.app_users (
  email text not null,
  role text not null check (role in ('bookkeeper', 'cashier', 'finance_head', 'pastor')),
  name text,
  created_at timestamptz not null default now(),
  primary key (email, role)
);
alter table public.app_users enable row level security;

-- 로그인한 사람의 역할들 (쉼표로 이어서, 예: 'bookkeeper,cashier'). 등록 안 됐으면 null
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select string_agg(role, ',' order by role) from public.app_users
  where lower(email) = lower(auth.jwt() ->> 'email')
$$;

drop policy if exists "본인 역할 보기" on public.app_users;
create policy "본인 역할 보기" on public.app_users for select
  using (public.my_role() is not null);

-- ─────────────────────────────────────────────────────────────
-- 2. 모든 기록을 담는 표 하나 (기기 안 데이터베이스와 1:1 로 맞춤)
--    collection = 종류 (offerings, expenses, households …), id = 그 안의 번호, doc = 내용
--    updated_at 은 서버 시각 → 기기들이 "마지막으로 받은 뒤 바뀐 것"만 받아 감
-- ─────────────────────────────────────────────────────────────
create table if not exists public.records (
  collection text not null,
  id text not null,
  doc jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (collection, id)
);
create index if not exists records_updated_idx on public.records (updated_at);
alter table public.records enable row level security;

-- 저장할 때마다 서버 시각·저장한 사람을 찍는다 (기기 시계가 틀려도 순서가 맞게)
create or replace function public.stamp_record() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.jwt() ->> 'email';
  return new;
end $$;
drop trigger if exists records_stamp on public.records;
create trigger records_stamp before insert or update on public.records
  for each row execute function public.stamp_record();

-- 누가 무엇을 쓸 수 있나
create or replace function public.can_write(col text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(auth.jwt() ->> 'email')
      and ((role = 'bookkeeper' and col in ('offerings', 'households', 'members', 'aliases', 'categories', 'budgets', 'meta', 'applicants', 'receipts', 'settings'))
        or (role = 'cashier' and col in ('expenses', 'fixedRules', 'budgets', 'openings', 'bankTxns', 'bankRules', 'expenseItems', 'meta', 'offerings', 'accounts', 'loans')))
  )
$$;
-- 출납회계가 offerings 를 쓸 수 있는 것은 '통장 내역'으로 온라인 헌금을 넣기 때문 (기장회계 확인 전제)

drop policy if exists "등록된 사람은 보기" on public.records;
create policy "등록된 사람은 보기" on public.records for select
  using (public.my_role() is not null);
drop policy if exists "역할에 맞게 쓰기" on public.records;
create policy "역할에 맞게 쓰기" on public.records for insert
  with check (public.can_write(collection));
drop policy if exists "역할에 맞게 고치기" on public.records;
create policy "역할에 맞게 고치기" on public.records for update
  using (public.can_write(collection)) with check (public.can_write(collection));
-- 지우기는 없음: 앱은 deleted=true 로 표시만 한다 (기록이 남도록)

-- ─────────────────────────────────────────────────────────────
-- 3. 바뀐 기록 이력 (감사 대응) — 고칠 때마다 이전 내용을 남김
-- ─────────────────────────────────────────────────────────────
create table if not exists public.record_history (
  hid bigserial primary key,
  collection text not null,
  id text not null,
  old_doc jsonb,
  new_doc jsonb,
  changed_at timestamptz not null default now(),
  changed_by text
);
alter table public.record_history enable row level security;
drop policy if exists "등록된 사람은 이력 보기" on public.record_history;
create policy "등록된 사람은 이력 보기" on public.record_history for select
  using (public.my_role() is not null);

create or replace function public.keep_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.record_history (collection, id, old_doc, new_doc, changed_by)
  values (new.collection, new.id, case when tg_op = 'UPDATE' then old.doc end, new.doc, auth.jwt() ->> 'email');
  return new;
end $$;
drop trigger if exists records_history on public.records;
create trigger records_history after insert or update on public.records
  for each row execute function public.keep_history();

-- ─────────────────────────────────────────────────────────────
-- 4. 사용자 4명 — ★ 이메일을 실제 주소로 고쳐서 실행 ★
--    (이메일은 이 파일이 아니라 SQL Editor 에서만 고치세요. 저장소에 올리지 않습니다.)
-- ─────────────────────────────────────────────────────────────
--    같은 이메일이 여러 줄이어도 괜찮습니다 (한 사람이 여러 역할)
insert into public.app_users (email, role, name)
select distinct on (lower(email), role) lower(email), role, name from (values
  ('기장회계@example.com', 'bookkeeper', '기장회계'),
  ('출납회계@example.com', 'cashier', '출납회계'),
  ('재정부장@example.com', 'finance_head', '재정부장'),
  ('담임목사@example.com', 'pastor', '담임목사')
) as v(email, role, name)
on conflict (email, role) do update set name = excluded.name;
