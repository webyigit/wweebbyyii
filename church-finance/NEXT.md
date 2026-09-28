# 이어서 작업하기 (어느 기기에서든)

이 프로젝트의 모든 기록은 GitHub 에 있으므로, PC·휴대폰 어디서든 이어서 할 수 있습니다.

## 휴대폰에서

1. **Claude 앱** → 왼쪽 메뉴 **Code** → 목록에서 이 세션(교회 재정관리)을 누르면 **대화가 그대로 이어집니다.**
2. 세션이 안 보이거나 새로 시작해야 하면: Code → 새 세션 → 저장소 `webyigit/wweebbyyii` 선택 → 아래 문장을 붙여넣기

```
church-finance 폴더의 NEXT.md, PLAN.md, HISTORY.md 를 읽고 교회 재정관리 프로젝트를 이어서 진행해줘.
브랜치는 claude/jolly-edison-hynxn7 이야.
```

## 지금 어디까지 왔나 (2026-09-28 기준)

- 0단계 설계 완료(`docs/04`, `docs/05`), **1단계 앱 첫 동작판 완료** (`app/`, 기기 저장만)
- 앱 실행: `cd church-finance/app && npm install && npm run dev` · 검사: `npm test` (단위), `npm run e2e` (브라우저 28항목 × 화면 2종 × 2회 = 112번)
- 2단계 진행 중: **엑셀 가져오기 완료** (개인별 헌금집계 1~6월, 실제 파일로 원 단위 검증)
  - 실제 파일 검증: `REAL_XLSX=/경로/파일.xlsx npx vitest run src/domain/importReal.test.ts` (파일은 저장소에 두지 않음)
- **앱 공개 주소**: https://webyigit.github.io/wweebbyyii/church-finance/ (다시 올리기: `church-finance/deploy.sh` → 커밋 → main 반영)
- 클라우드: Supabase 프로젝트 있음, 동기화 코드 완료, **SQL 실행 완료(표 생성 확인, 로그인 안 한 접근은 막힘 확인)**
  - 남은 고객 할 일: `docs/06-클라우드설정.md` 6~7번 (Site URL, 각자 가입)
  - 이 작업 환경에서 Supabase 접속 허용됨 (네트워크 설정 완료)
- **4단계 기부금영수증 완료** (앱 '기부금영수증' 탭): 발급·법정 서식·발급대장·신청자·예전 대장 가져오기·주민번호 금고
  - 클라우드 가입할 때 `supabase/update-001-receipts.sql` 도 실행해야 영수증 기록이 올라감
  - 남은 것: 온라인 신청서(Q16), 가중치 열(Q14), 포함 과목(Q15)
- **5단계 예결산·제직회 완료** (앱 '예결산·제직회' 탭): 결산·예산(안), 지출 현황, 요약, 부서별 상세, 해외선교 — 실제 엑셀과 164건 원 단위 일치
- **바로 다음 할 일**
  1. 작년(2025) 출납·헌금 파일 가져오기 → 요약 보고의 '작년 대비' 채우기 (Q17)
  2. 3단계 남은 것: 과목 이동(Q10) 기록, 계좌 잔액 대사(통장 잔액 vs 장부), 차입 현황
  3. 실제 Supabase 서버와 동기화 시험 (고객이 가입한 뒤)
- 3단계 지출·출납 보고서 완료, 실제 출납 파일과 원 단위 일치
- 주간 명단 가져오기 완료 (8~9월 7주). 7월 명단 파일은 없음 (Q13)
- 실제 파일 검증 환경변수: `REAL_XLSX`, `REAL_CASHBOOK`, `REAL_WEEKLY_DIR`
- 출납 기장 대조 완료: `REAL_CASHBOOK=/경로/주간파일.xlsx` 를 함께 주면 importReal 테스트가 장부 대조까지 함
- 참고 원본(구글 드라이브, 읽기만):
  - 출납: `★ 09-27_수입지출내역` (매주 복사되는 최신 파일)
  - 기장: `★★ 2026년도 개인별 헌금집계 ★★`, `MM-DD_주일헌금현황`

## 발표자료 (구글 슬라이드)

- 폴더 (늘 최신판이 여기 있음): https://drive.google.com/drive/folders/1GJjbPK6LSxm5BFxKp2sGWXj196ytT1VS
- 현재판 (0~5단계, 13장): https://docs.google.com/presentation/d/1fYiBUtDxvTvwOwi50meuRCM7U3lIeduP2vF35M-CmTI/edit
  - 알려진 작은 흠: 3~4번 슬라이드 10번 동그라미 숫자 줄바꿈, 마지막 장 4번 줄과 아래 글자 겹침 → `build.py` 에는 고쳐 둠, 다음 갱신 때 반영
- 원본 생성기: `slides/build.py` (갱신 방법은 CLAUDE.md)

## 작업 규칙 요약 (자세한 건 CLAUDE.md)

- 실제 교인 이름·금액·주민번호·계좌번호는 저장소에 **절대** 넣지 않음 (공개 저장소)
- 작업할 때마다 `HISTORY.md` 에 기록, 이 파일(`NEXT.md`)의 "다음 할 일" 갱신
