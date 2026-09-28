-- 업데이트: 새로 생긴 기록(기부금영수증 신청자·발급대장·설정, 통장·현금 잔액, 차입)을 올릴 수 있게
-- 사용법: SQL Editor → New query → 이 파일 내용 붙여넣기 → Run (이메일 고칠 것 없음, 여러 번 실행해도 안전)
-- 처음 설정하는 경우에는 schema.sql 에 이미 들어 있으므로 이 파일은 필요 없습니다.
create or replace function public.can_write(col text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(auth.jwt() ->> 'email')
      and ((role = 'bookkeeper' and col in ('offerings', 'households', 'members', 'aliases', 'categories', 'budgets', 'meta', 'applicants', 'receipts', 'settings'))
        or (role = 'cashier' and col in ('expenses', 'fixedRules', 'budgets', 'openings', 'bankTxns', 'bankRules', 'expenseItems', 'meta', 'offerings', 'accounts', 'loans')))
  )
$$;
