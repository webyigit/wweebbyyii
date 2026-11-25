# 업무 기록 (worklog-app)

일간·주간·월간 업무 기록 앱. 아이폰 우선, 같은 코드로 안드로이드도 빌드할 수 있습니다(Expo / React Native).

- 기록: 한 일 · 할 일 · 메모 3칸, 입력을 멈추면 자동 저장(기기 안)
- 주간·월간 화면에서 그 기간의 일간 기록을 모아 보기
- 목록·검색
- GitHub 저장소의 JSON 파일 하나로 백업·동기화(나중에 고친 쪽이 남음, 삭제도 전달)

## 아이폰에서 바로 써 보기 (Expo Go)

1. 아이폰에 App Store 에서 **Expo Go** 설치
2. PC(윈도우) PowerShell 에서 한 줄씩:
   ```
   cd worklog-app
   npm install
   npx expo start
   ```
3. 화면에 뜬 QR 코드를 아이폰 카메라로 찍으면 Expo Go 에서 열립니다(PC 와 같은 와이파이).

## GitHub 저장 설정

1. GitHub 에 **비공개(private)** 저장소를 하나 만듭니다. 예: `worklog-data`
2. https://github.com/settings/personal-access-tokens/new 에서 Fine-grained 토큰 생성
   - Repository access: 방금 만든 저장소만
   - Permissions → Contents: Read and write
3. 앱 → 설정 탭에 계정·저장소·토큰 입력 → '연결 확인' → '지금 동기화'

토큰은 기기 보안 저장소(iOS 키체인 / Android Keystore)에만 저장되고, 기록 파일이나 이 저장소에는 들어가지 않습니다.

## 개발

```
npm test                 # 날짜·합치기·base64·동기화 단위 검사
npm run typecheck        # 타입 검사
npx expo export --platform web --output-dir dist
node tests/e2e-web.mjs dist   # 아이폰 화면 크기로 주요 흐름 검사(playwright 필요)
```

## 정식 앱으로 설치(나중에)

App Store / TestFlight 배포는 Apple 개발자 계정(연 $99)과 EAS Build 가 필요합니다. 배포 전에 따로 확인합니다.
안드로이드는 `npx eas-cli build -p android` 로 같은 코드를 빌드합니다.
