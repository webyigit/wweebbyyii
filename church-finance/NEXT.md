# 이어서 작업하기 (어느 기기에서든)

이 프로젝트의 모든 기록은 GitHub 에 있으므로, PC·휴대폰 어디서든 이어서 할 수 있습니다.

## 휴대폰에서

1. **Claude 앱** → 왼쪽 메뉴 **Code** → 목록에서 이 세션(교회 재정관리)을 누르면 **대화가 그대로 이어집니다.**
2. 세션이 안 보이거나 새로 시작해야 하면: Code → 새 세션 → 저장소 `webyigit/wweebbyyii` 선택 → 아래 문장을 붙여넣기

```
church-finance 폴더의 NEXT.md, PLAN.md, HISTORY.md 를 읽고 교회 재정관리 프로젝트를 이어서 진행해줘.
브랜치는 claude/jolly-edison-hynxn7 이야.
```

## 지금 어디까지 왔나 (2026-10-07 기준)

**0~6단계 앱 개발 완료.** 이제 고객 쪽 준비 → 4주 병행 운영 → 엑셀 중단 (`docs/07-엑셀중단계획.md`).

- **앱**: https://webyigit.github.io/wweebbyyii/church-finance/ · 사용법: `docs/사용설명서.md`
  - 탭: 헌금 입력 · 주일헌금현황 · 지출 입력 · 수입지출 보고(엑셀과 대조) · 통장 내역 · 교인·가정 · 예산·이월 ·
    기부금영수증 · 예결산·제직회 · 재정 현황(대사·차입·과목 이동) · 엑셀 가져오기 · 계정·백업
  - 다시 올리기: `church-finance/deploy.sh` → 커밋 → main 반영 (GitHub Pages = main /docs)
- **클라우드(Supabase)**: 표·권한 설정 완료. 고객이 4명 가입하면 동기화 시작. 가입할 때 `supabase/update.sql` 한 번 실행
- **검사**
  - `cd church-finance/app && npm test` (단위) · `npm run e2e` (브라우저 2회) · `npm run typecheck`
  - 실제 파일 대조 (저장소 밖 파일): `REAL_XLSX=개인별헌금집계 REAL_CASHBOOK=주간출납파일 REAL_WEEKLY_DIR=주간명단폴더 REAL_LEDGER_2025=총계정원장_2025 npx vitest run src/domain/importReal.test.ts`
- **2026 결산·2027 예산(안)**: 12월 말 예상 계산(`projectYearEnd`) 추가, 예결산 PPT 고객에게 전달 (실금액이라 저장소 밖)
- **남은 일**
  0. 예결산위원회 협의 5가지 결정 → 앱 결산·예산(안)에 입력 / (선택) 결산 화면에 '12월 말 예상' 칸
  1. 고객: 4명 가입 → 자료 가져오기 → 4주 병행 운영 (대조표는 `docs/07`)
  2. 고객 답변 기다리는 것: Q10(과목 이동 날짜·이유), Q11·Q12(엑셀 불일치), Q13, Q14~Q16(영수증), Q18(작년 대비 기준), Q19(선교 송금)
  3. 개발(선택): 온라인 영수증 신청서(Q16 답에 따라), 실제 Supabase 로 동기화 시험(가입 후)
- 참고 원본(구글 드라이브, 읽기만): 출납 `★ MM-DD_수입지출내역`, 기장 `★★ 2026년도 개인별 헌금집계 ★★`, 2025년 `총계정원장_2025`

## 발표자료 (구글 슬라이드)

- 폴더 (늘 최신판이 여기 있음): https://drive.google.com/drive/folders/1GJjbPK6LSxm5BFxKp2sGWXj196ytT1VS
- 현재판 (0~6단계 완료, 14장): https://docs.google.com/presentation/d/1-DntyJ3Ow__cxR71g6uQRW9IjRX5FfuSaDQQqIFvztg/edit
  - 알려진 작은 흠: 진행 슬라이드의 두 자리 번호(10~12) 동그라미 줄바꿈 → `build.py` 에 고쳐 둠, 다음 갱신 때 반영
- 원본 생성기: `slides/build.py` (갱신 방법은 CLAUDE.md)

## 작업 규칙 요약 (자세한 건 CLAUDE.md)

- 실제 교인 이름·금액·주민번호·계좌번호는 저장소에 **절대** 넣지 않음 (공개 저장소)
- 작업할 때마다 `HISTORY.md` 에 기록, 이 파일(`NEXT.md`)의 "다음 할 일" 갱신
