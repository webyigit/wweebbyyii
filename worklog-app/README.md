# 업무 기록 (worklog-app)

하루 업무를 체크리스트로 기록하는 앱. 아이폰 우선, 같은 코드로 안드로이드·PC(웹 브라우저)에서도 씁니다(Expo / React Native). 디자인은 토스 스타일.

- **홈**: 아직 못 끝낸 일만(밀린 일 · 오늘 · 예약된 일), 밀린 일은 '모두 오늘로'
- **기록**: 일간(기본, 위에 그 주 날짜) · 주간 · 월간 탭, 날짜 눌러 년/월/일 이동, 오늘 버튼
- 체크하면 취소선·흐리게·맨 아래로 / 전체·미완료·완료 필터 / 말줄임 없이 전체 내용
- 업무 누르면 수정 · 내일로 · 다음 주 월요일 · 날짜 골라 옮기기(미루기) · 삭제(되돌리기)
- 입력줄 날짜 칩으로 미래 날짜에 예약, 종 버튼으로 알림
- 아이폰 홈·잠금화면 위젯, GitHub 저장소에 JSON 으로 백업·동기화

문서: `docs/요구사항_20261125_v2.md`, `docs/화면설계_20261125_v2.md`, `docs/알림위젯_연동_20261125_v1.md`, `docs/결함리포트_20261125_v1.md`

## 아이폰에서 바로 써 보기 (Expo Go)

1. 아이폰에 App Store 에서 **Expo Go** 설치
2. PC(윈도우) PowerShell 에서 한 줄씩:
   ```
   cd worklog-app
   npm install
   npx expo start
   ```
3. 화면에 뜬 QR 코드를 아이폰 카메라로 찍으면 Expo Go 에서 열립니다(PC 와 같은 와이파이).
   위젯은 Expo Go 에서는 안 보이고 개발 빌드가 필요합니다(`docs/알림위젯_연동_20261125_v1.md`).

## PC 에서 쓰기

```
npx expo start --web
```
브라우저에서 열립니다. 배포용 정적 파일은 `npx expo export --platform web` 로 만듭니다(올리기 전 확인).

## GitHub 저장 설정

1. GitHub 에 **비공개(private)** 저장소를 하나 만듭니다. 예: `worklog-data`
2. https://github.com/settings/personal-access-tokens/new 에서 Fine-grained 토큰 생성
   - Repository access: 방금 만든 저장소만
   - Permissions → Contents: Read and write
3. 앱 → 설정 탭에 계정·저장소·토큰 입력 → '연결 확인' → '지금 동기화'

토큰은 기기 보안 저장소(iOS 키체인 / Android Keystore)에만 저장되고, 기록 파일이나 이 저장소에는 들어가지 않습니다.

## 개발

```
npm test                 # 날짜·합치기·동기화·알림·위젯 단위 검사
npm run typecheck        # 타입 검사
npx expo export --platform web --output-dir dist
node tests/e2e-web.mjs dist   # 아이폰 화면 크기로 주요 흐름 검사(playwright 필요)
```

## 정식 앱으로 설치(나중에)

App Store / TestFlight 배포는 Apple 개발자 계정(연 $99)과 EAS Build 가 필요합니다. 배포 전에 따로 확인합니다.
안드로이드는 `npx eas-cli build -p android` 로 같은 코드를 빌드합니다.
