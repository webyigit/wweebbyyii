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
- 앱 실행: `cd church-finance/app && npm install && npm run dev` · 검사: `npm test` (단위), `npm run e2e` (브라우저 48번)
- **바로 다음 할 일**
  1. 클라우드(Supabase) 연결 — 고객 계정 필요 (docs/QUESTIONS.md Q9)
  2. 2단계: 개인별 헌금집계 엑셀 → 앱 이관 도구 (실데이터는 저장소 밖에서만)
- 참고 원본(구글 드라이브, 읽기만):
  - 출납: `★ 09-27_수입지출내역` (매주 복사되는 최신 파일)
  - 기장: `★★ 2026년도 개인별 헌금집계 ★★`, `MM-DD_주일헌금현황`

## 발표자료 (구글 슬라이드)

- 폴더 (늘 최신판이 여기 있음): https://drive.google.com/drive/folders/1GJjbPK6LSxm5BFxKp2sGWXj196ytT1VS
- 현재판: https://docs.google.com/presentation/d/1MEcci-3vonrXQGE5IsVaZr8K_3YPLfGsI1OLOb3a1qQ/edit
- 원본 생성기: `slides/build.py` (갱신 방법은 CLAUDE.md)

## 작업 규칙 요약 (자세한 건 CLAUDE.md)

- 실제 교인 이름·금액·주민번호·계좌번호는 저장소에 **절대** 넣지 않음 (공개 저장소)
- 작업할 때마다 `HISTORY.md` 에 기록, 이 파일(`NEXT.md`)의 "다음 할 일" 갱신
