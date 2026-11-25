/**
 * App Group: 앱과 위젯이 데이터를 나눠 쓰는 공용 저장소 이름.
 * plugins/withWorklogWidget.js 가 `group.<ios.bundleIdentifier>` 로 만들고, 위젯 Swift 도 같은 값을 씁니다.
 * bundleIdentifier 를 바꾸면 여기와 targets/widget/WorklogWidget.swift 의 appGroup 도 같이 바꾸세요
 * (tests/reminders-widget.test.ts 가 어긋나면 실패합니다).
 */
export const APP_GROUP = 'group.com.webyigit.worklog';
export const WIDGET_KIND = 'WorklogTodayWidget';
