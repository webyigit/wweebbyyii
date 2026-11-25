// 오늘 할 일 위젯 — 홈 화면(소·중·대) + 잠금 화면(사각·원형·한 줄)
// 앱이 App Group UserDefaults 의 "worklog.widget.v1" 키에 JSON 을 써 두면 이 위젯이 읽습니다.
// 데이터 모양: worklog-app/src/widget/snapshot.ts
// 탭하면 worklog://today (항목 탭은 worklog://day/<날짜>?task=<id>) 로 앱이 열립니다.

import SwiftUI
import WidgetKit

// MARK: - 데이터

private let appGroup = "group.com.webyigit.worklog" // src/widget/config.ts APP_GROUP 과 같아야 함
private let storageKey = "worklog.widget.v1"
private let widgetKind = "WorklogTodayWidget"   // src/widget/config.ts WIDGET_KIND

struct WidgetItem: Codable, Hashable {
  let id: String
  let title: String
  let date: String
  let remindAt: String?
}

struct WidgetSnapshot: Codable {
  let version: Int
  let generatedAt: String
  let items: [WidgetItem]
  let truncated: Int
}

private func dayKey(_ d: Date) -> String {
  let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
  return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

private func loadSnapshot() -> WidgetSnapshot? {
  guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: storageKey),
        let data = raw.data(using: .utf8) else { return nil }
  return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
}

// MARK: - 타임라인

struct TodayEntry: TimelineEntry {
  let date: Date
  /** 오늘 기준 미완료(밀린 것 포함) */
  let items: [WidgetItem]
  let overdueCount: Int
  let hasData: Bool
}

/// 같은 데이터로 '그 시각의 오늘' 을 다시 거릅니다 (자정이 지나면 내일 것이 오늘로)
private func entry(at date: Date, from snap: WidgetSnapshot?) -> TodayEntry {
  guard let snap = snap else { return TodayEntry(date: date, items: [], overdueCount: 0, hasData: false) }
  let today = dayKey(date)
  let open = snap.items.filter { $0.date <= today }
  return TodayEntry(date: date, items: open, overdueCount: open.filter { $0.date < today }.count, hasData: true)
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry {
    TodayEntry(date: .now, items: [
      WidgetItem(id: "1", title: "주간 보고서 정리", date: dayKey(.now), remindAt: nil),
      WidgetItem(id: "2", title: "디자인 리뷰 회의", date: dayKey(.now), remindAt: nil),
    ], overdueCount: 0, hasData: true)
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : entry(at: .now, from: loadSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    let snap = loadSnapshot()
    let now = Date()
    let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86400))
    // 지금 + 자정(날짜가 바뀌면 다시 거름). 앱이 데이터를 바꾸면 reloadTimelines 로 즉시 갱신
    let entries = [entry(at: now, from: snap), entry(at: midnight.addingTimeInterval(1), from: snap)]
    completion(Timeline(entries: entries, policy: .after(midnight.addingTimeInterval(60))))
  }
}

// MARK: - 화면 (토스 톤: 흰 바탕, 진한 회색 글자, 파란 강조)

private let blue = Color(red: 0x31 / 255, green: 0x82 / 255, blue: 0xF6 / 255)
private let grey900 = Color(red: 0x19 / 255, green: 0x1F / 255, blue: 0x28 / 255)
private let grey600 = Color(red: 0x6B / 255, green: 0x76 / 255, blue: 0x84 / 255)
private let red = Color(red: 0xF0 / 255, green: 0x44 / 255, blue: 0x52 / 255)

private func itemURL(_ item: WidgetItem) -> URL {
  var c = URLComponents()
  c.scheme = "worklog"; c.host = "day"; c.path = "/\(item.date)"
  c.queryItems = [URLQueryItem(name: "task", value: item.id), URLQueryItem(name: "from", value: "widget")]
  return c.url ?? URL(string: "worklog://today?from=widget")!
}

private let todayURL = URL(string: "worklog://today?from=widget")!

struct ItemRow: View {
  let item: WidgetItem
  let today: String
  let lines: Int
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Circle().strokeBorder(item.date < today ? red : grey600.opacity(0.5), lineWidth: 1.5)
        .frame(width: 12, height: 12)
      Text(item.title)
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(grey900)
        .lineLimit(lines)
      Spacer(minLength: 0)
    }
  }
}

struct HomeView: View {
  @Environment(\.widgetFamily) var family
  let entry: TodayEntry

  private var maxRows: Int {
    switch family {
    case .systemSmall: return 3
    case .systemMedium: return 4
    default: return 9
    }
  }

  var body: some View {
    let today = dayKey(entry.date)
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text("오늘 할 일").font(.system(size: 13, weight: .semibold)).foregroundStyle(grey600)
        Spacer()
        Text("\(entry.items.count)").font(.system(size: 20, weight: .bold)).foregroundStyle(blue)
      }
      if !entry.hasData {
        Spacer()
        Text("앱을 한 번 열면\n할 일이 여기 보여요").font(.system(size: 13)).foregroundStyle(grey600)
        Spacer()
      } else if entry.items.isEmpty {
        Spacer()
        Text("오늘 할 일을\n모두 끝냈어요 👏").font(.system(size: 15, weight: .semibold)).foregroundStyle(grey900)
        Spacer()
      } else {
        ForEach(entry.items.prefix(maxRows), id: \.self) { item in
          if family == .systemSmall {
            ItemRow(item: item, today: today, lines: 1)
          } else {
            Link(destination: itemURL(item)) { ItemRow(item: item, today: today, lines: family == .systemLarge ? 2 : 1) }
          }
        }
        Spacer(minLength: 0)
        if entry.items.count > maxRows {
          Text("외 \(entry.items.count - maxRows)개").font(.system(size: 12, weight: .medium)).foregroundStyle(grey600)
        }
      }
    }
    .widgetURL(todayURL)
  }
}

struct LockView: View {
  @Environment(\.widgetFamily) var family
  let entry: TodayEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Text("\(entry.items.count)").font(.system(size: 22, weight: .bold))
          Text("할 일").font(.system(size: 10, weight: .semibold))
        }
      }
      .widgetURL(todayURL)
    case .accessoryInline:
      Text(entry.items.isEmpty ? "오늘 할 일 없음" : "할 일 \(entry.items.count)개 · \(entry.items[0].title)")
        .widgetURL(todayURL)
    default: // accessoryRectangular
      VStack(alignment: .leading, spacing: 1) {
        Text(entry.items.isEmpty ? "오늘 할 일 끝 👏" : "할 일 \(entry.items.count)개")
          .font(.system(size: 13, weight: .bold)).widgetAccentable()
        ForEach(entry.items.prefix(2), id: \.self) { item in
          Text("· \(item.title)").font(.system(size: 13)).lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(todayURL)
    }
  }
}

struct WorklogTodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: widgetKind, provider: Provider()) { entry in
      WidgetRoot(entry: entry)
    }
    .configurationDisplayName("오늘 할 일")
    .description("아직 끝내지 못한 업무를 보여 줘요. 누르면 앱이 열려요.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}

struct WidgetRoot: View {
  @Environment(\.widgetFamily) var family
  let entry: TodayEntry
  var body: some View {
    Group {
      switch family {
      case .accessoryCircular, .accessoryRectangular, .accessoryInline: LockView(entry: entry)
      default: HomeView(entry: entry)
      }
    }
    .containerBackground(for: .widget) { Color.white }
  }
}

@main
struct WorklogWidgetBundle: WidgetBundle {
  var body: some Widget {
    WorklogTodayWidget()
  }
}
