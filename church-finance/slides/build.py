"""프로젝트 히스토리 발표자료 생성기 → history.odp

실행:  python3 build.py
결과:  history.odp  (구글 드라이브에 올리면 Google Slides 로 변환됨)

왜 .odp 인가: 드라이브 도구에는 파일을 base64 문자열로 넘겨야 하는데, .pptx 는 파일 조각이 많아
문자열이 5만 자를 넘고 옮겨 적다 틀리기 쉽다. .odp 는 슬라이드와 발표자 노트가 한 XML 에 들어가서
훨씬 작다.

규칙 (CLAUDE.md):
- HISTORY.md 에 항목이 늘면 이 파일의 TIMELINE·결정·로드맵·다음 할 일·발표자 노트를 함께 갱신.
- 누구나 이 자료 하나로 발표할 수 있도록 슬라이드마다 발표자 노트(notes)를 꼭 채운다.
- 실제 교인 이름·금액·계좌번호는 넣지 않는다.
"""
import base64
import zipfile
from xml.sax.saxutils import escape

UPDATED = "2026-09-28"
FONT = "Noto Sans KR"
C = dict(ink="#1F3A34", mist="#E6EFEB", gold="#C8963E", white="#FFFFFF", text="#22302C",
         muted="#5F6F6A", red="#B5483B", pale="#CFE0D9", faint="#A9BFB7", line="#B7CBC3")

# ── 스타일 레지스트리 ─────────────────────────────────────────────
_gstyles, _tstyles = {}, {}


def gstyle(fill=None, stroke=None, valign="top", width="0.03in"):
    key = (fill, stroke, valign, width)
    if key not in _gstyles:
        _gstyles[key] = f"g{len(_gstyles)}"
    return _gstyles[key]


def tstyle(size, bold=False, color=C["text"], align="left"):
    key = (size, bold, color, align)
    if key not in _tstyles:
        _tstyles[key] = f"t{len(_tstyles)}"
    return _tstyles[key]


def paras(text, st):
    return "".join(
        f'<text:p text:style-name="{st}P"><text:span text:style-name="{st}">{escape(line)}</text:span></text:p>'
        for line in str(text).split("\n"))


# 좌표는 10 x 5.625 인치 기준으로 적고, 구글 슬라이드 기본 페이지(28 x 15.75cm)에 맞춰 K 배 확대한다.
# (구글은 .odp 의 페이지 크기 설정을 무시하고 기본 크기를 쓰므로 여기에 맞춘다.)
K = 28 / 25.4


def box(x, y, w, h):
    return f'svg:x="{x * K:.3f}in" svg:y="{y * K:.3f}in" svg:width="{w * K:.3f}in" svg:height="{h * K:.3f}in"'


class Slide:
    def __init__(self, bg=C["white"]):
        self.bg, self.items, self.notes = bg, [], ""

    def text(self, t, x, y, w, h, size=14, bold=False, color=C["text"], align="left", valign="top"):
        st = tstyle(size, bold, color, align)
        self.items.append(f'<draw:frame draw:style-name="{gstyle(valign=valign)}" {box(x, y, w, h)}>'
                          f'<draw:text-box>{paras(t, st)}</draw:text-box></draw:frame>')

    def rect(self, x, y, w, h, fill=C["mist"], radius=0.06):
        self.items.append(f'<draw:rect draw:style-name="{gstyle(fill)}" draw:corner-radius="{radius * K:.3f}in" {box(x, y, w, h)}/>')

    def badge(self, x, y, label, fill=C["ink"], color=C["white"], d=0.42, size=13):
        st = tstyle(size, True, color, "center")
        self.items.append(f'<draw:ellipse draw:style-name="{gstyle(fill, valign="middle")}" {box(x, y, d, d)}>'
                          f'{paras(label, st)}</draw:ellipse>')

    def vline(self, x, y1, y2, color=C["line"]):
        self.items.append(f'<draw:line draw:style-name="{gstyle(stroke=color)}" svg:x1="{x * K:.3f}in" svg:y1="{y1 * K:.3f}in" svg:x2="{x * K:.3f}in" svg:y2="{y2 * K:.3f}in"/>')

    def title(self, t, sub=None):
        self.text(t, 0.5, 0.35, 9, 0.6, 26, True, C["ink"])
        if sub:
            self.text(sub, 0.5, 0.95, 9, 0.35, 12, color=C["muted"])

    def footer(self, n):
        self.text(f"교회 재정관리 프로젝트 · {n}", 0.5, 5.2, 9, 0.25, 9, color=C["muted"], align="right")


slides = []

# 1. 표지
s = Slide(C["ink"]); slides.append(s)
s.badge(0.6, 1.2, "✝", C["gold"], C["ink"], 0.6, 18)
s.text("교회 재정관리\n온라인 전환 프로젝트", 0.6, 1.95, 8.5, 1.4, 36, True, C["white"])
s.text("엑셀에서 웹·앱으로 — 진행 기록", 0.6, 3.4, 8.5, 0.45, 18, color=C["pale"])
s.text(f"최종 갱신 {UPDATED}   ·   PM: Claude   ·   고객: 교회 재정부", 0.6, 4.6, 8.5, 0.35, 11, color=C["faint"])
s.notes = ("안녕하세요. 오늘은 교회 재정관리를 엑셀에서 온라인 프로그램으로 옮기는 프로젝트가 어디까지 왔는지 말씀드리겠습니다. "
           "이 자료는 작업할 때마다 갱신되는 진행 기록입니다.")

# 2. 목표
s = Slide(); slides.append(s)
s.title("무엇을 만드나", "고객 요구사항 7가지")
s.text("헌금은 한 번만 입력 →\n주간 집계·개인별 집계·기부금영수증·예결산이 자동으로", 0.5, 1.45, 3.3, 1.6, 17, True, C["ink"])
s.text("이 한 문장이 프로젝트의 기준입니다.", 0.5, 3.15, 3.3, 0.4, 12, color=C["muted"])
reqs = [("100% 온라인", "엑셀 없이 1년 운영"), ("입력 최소화", "헌금 1건 = 입력 1번"), ("매주 집계", "지금 양식 그대로 출력"),
        ("기부금영수증", "연 1회 일괄 발행"), ("예결산", "예산 편성 → 결산서 자동"), ("웹 + 앱", "PC·휴대폰 모두"),
        ("동기화", "끊겨도 입력, 나중에 자동 맞춤")]
for i, (h, d) in enumerate(reqs):
    x, y = 4.1 + (i % 2) * 2.75, 1.35 + (i // 2) * 0.95
    s.rect(x, y, 2.6, 0.8)
    s.badge(x + 0.15, y + 0.19, i + 1)
    s.text(h, x + 0.7, y + 0.1, 1.8, 0.32, 13, True, C["ink"])
    s.text(d, x + 0.7, y + 0.42, 1.8, 0.3, 10.5, color=C["muted"])
s.footer(2)
s.notes = ("먼저 목표입니다. 핵심은 한 문장입니다. 헌금은 한 번만 입력하면 주간 집계, 개인별 집계, 기부금영수증, 예결산이 모두 자동으로 나오게 하는 것입니다. "
           "오른쪽 일곱 가지가 재정부가 요청한 요구사항이고, 이 일곱 가지가 모두 되어야 완료로 봅니다.")

# 3. 진행 타임라인 — HISTORY.md 항목이 늘면 여기에 추가
TIMELINE = [
    ("09-28 ①", "프로젝트 시작", "드라이브 엑셀 분석, 계획·질문 작성, 기록 폴더 생성"),
    ("09-28 ②", "고객 답변 반영", "사용자 4명·권한 확정, 지출 쪽 분석, 가정 단위 영수증 결정"),
    ("09-28 ③", "실제 주간 파일 분석", "출납 파일 시트 27장 구조 파악, 제출물 2장 확인"),
    ("09-28 ④", "어디서든 이어서", "휴대폰에서 이어가기 안내, 히스토리 발표자료(이 자료) 시작"),
]
s = Slide(); slides.append(s)
s.title("지금까지의 진행", "작업 일지(HISTORY.md) 요약 — 새 항목은 아래로 이어집니다")
gap = min(0.95, 3.4 / max(1, len(TIMELINE) - 1)) if len(TIMELINE) > 1 else 0.95
s.vline(0.9, 1.75, 1.75 + gap * (len(TIMELINE) - 1))
for i, (when, head, desc) in enumerate(TIMELINE):
    y = 1.55 + i * gap
    s.badge(0.7, y, i + 1, C["gold"] if i == len(TIMELINE) - 1 else C["ink"], d=0.4)
    s.text(when, 1.3, y + 0.02, 1.2, 0.36, 11, color=C["muted"], valign="middle")
    s.text(head, 2.5, y - 0.02, 6.8, 0.34, 15, True, C["ink"])
    s.text(desc, 2.5, y + 0.32, 6.8, 0.32, 11.5)
s.footer(3)
s.notes = ("지금까지의 진행입니다. 첫날 구글 드라이브의 실제 엑셀을 분석해서 계획을 세웠고, 재정부 답변을 받아 사용자와 권한을 확정했습니다. "
           "이어서 출납회계가 매주 쓰는 실제 파일 27장을 모두 분석했고, 휴대폰에서도 이어서 작업할 수 있게 하면서 이 발표자료를 만들기 시작했습니다.")

# 4. 현황 분석
s = Slide(); slides.append(s)
s.title("지금 엑셀은 어떻게 돌아가나", "구글 드라이브 스프레드시트 분석 결과")
stats = [("27장", "출납 파일 한 개의 시트 수\n(제출은 그중 2장)"), ("52번", "매년 파일 전체를 복사하는 횟수\n(매주 새 파일)"),
         ("2번", "같은 헌금을 입력하는 횟수\n(주간현황 + 개인별 집계)"), ("수십 개", "손으로 만든 ✔/✘ 검산 수식\n(정확성이 최우선)")]
for i, (n, d) in enumerate(stats):
    x = 0.5 + i * 2.3
    s.rect(x, 1.5, 2.1, 2.3)
    s.text(n, x + 0.2, 1.7, 1.8, 0.9, 34, True, C["ink"])
    s.text(d, x + 0.2, 2.65, 1.8, 1.0, 11)
s.text("그 결과: 개인별 집계가 7월부터 밀려 있고, 이름 찾기 오류(#N/A)·깨진 수식(#REF!)이 생김", 0.5, 4.2, 9, 0.45, 13, True, C["red"])
s.footer(4)
s.notes = ("분석해 보니 이렇습니다. 출납 파일 하나에 시트가 27장이지만 실제로 제출하는 건 2장입니다. 매주 파일 전체를 복사해서 1년에 52번 새로 만들고, "
           "같은 헌금을 두 곳에 두 번 입력합니다. 담당자분들이 정확성을 위해 검산 수식을 수십 개 만들어 두셨을 만큼 수고가 많습니다. "
           "그 결과 개인별 집계가 밀리고 수식 오류가 생기고 있습니다.")

# 5. 한 주 비교
s = Slide(); slides.append(s)
s.title("출납회계의 한 주 — 지금 vs 앞으로")
before = ["지난주 파일 통째로 복사", "금액 초기화, 지난주 잔액 확인", "고정지출 복사·붙여넣기", "농협 출금 묶음·상세 입력",
          "합계 검산, 부서 시트 확인", "두 장 출력해 제출"]
after = ["(없음) 주차는 날짜로 자동", "(없음) 잔액은 이어서 계산", "고정지출이 미리 채워짐 → 확인만", "거래내역 파일 올리면 자동 분류",
         "검산은 자동, 결과만 화면에 표시", "버튼 한 번으로 두 장 출력"]
for k, (h, lst) in enumerate([("지금 (엑셀)", before), ("앞으로 (새 프로그램)", after)]):
    x = 0.5 + k * 4.6
    s.rect(x, 1.2, 4.4, 3.85, C["mist"] if k == 0 else C["ink"])
    s.text(h, x + 0.3, 1.35, 3.8, 0.4, 15, True, C["ink"] if k == 0 else C["gold"])
    for i, t in enumerate(lst):
        s.text(str(i + 1), x + 0.3, 1.9 + i * 0.5, 0.3, 0.4, 12, True, C["muted"] if k == 0 else C["pale"], valign="middle")
        s.text(t, x + 0.65, 1.9 + i * 0.5, 3.6, 0.4, 12, color=C["text"] if k == 0 else C["white"], valign="middle")
s.footer(5)
s.notes = ("출납회계의 한 주를 비교해 보겠습니다. 왼쪽이 지금, 오른쪽이 앞으로입니다. 파일 복사와 초기화는 아예 없어지고, 고정지출은 미리 채워져서 확인만 하면 됩니다. "
           "은행 거래내역은 파일을 올리면 자동 분류되고, 검산도 자동입니다. 마지막엔 버튼 한 번으로 같은 모양의 두 장이 출력됩니다.")

# 6. 고객 확인 사항
s = Slide(); slides.append(s)
s.title("고객에게 확인한 것", "필요한 것만 물었습니다")
qa = [("지출은 어디에?", "주간 파일의 날짜 시트. 고정 지출 + 출납회계가 추가로 입력하는 지출"),
      ("누가 쓰나?", "입력 2명(기장회계·출납회계), 열람 2명(재정부장·담임목사)"),
      ("영수증 개인정보는?", "이름·전화·주소·주민번호를 매년 종이 신청서로 받아 수동 발행"),
      ("가족 헌금 영수증은?", "가정마다 신청자 1명에게 가족 전원 헌금을 몰아서 발행")]
for i, (q, a) in enumerate(qa):
    y = 1.45 + i * 0.9
    s.badge(0.5, y + 0.1, f"Q{i + 1}", d=0.5, size=10)
    s.text(q, 1.2, y, 2.6, 0.7, 14, True, C["ink"], valign="middle")
    s.rect(3.8, y, 5.7, 0.7)
    s.text(a, 4.0, y, 5.4, 0.7, 12, valign="middle")
s.footer(6)
s.notes = ("재정부에 확인한 네 가지입니다. 지출은 주간 파일에서 고정지출과 추가 지출로 관리하고, 사용자는 입력 두 분과 열람 두 분입니다. "
           "기부금영수증은 매년 종이 신청서로 개인정보를 받고, 가족 헌금은 신청자 한 분에게 모아서 발행합니다. 질문은 꼭 필요한 것만 드렸습니다.")

# 7. 결정과 이유
s = Slide(); slides.append(s)
s.title("주요 결정과 그 이유")
dec = [("웹·앱 한 벌로", "PWA 하나로 PC·휴대폰 모두. 스토어 심사 없이 설치"),
       ("클라우드 + 기기 사본", "Supabase + 기기 저장소. 와이파이 끊겨도 입력"),
       ("실데이터는 저장소에 없음", "공개 저장소라 교인 정보는 DB에만, 주민번호 암호화"),
       ("가정 단위 영수증", "가족을 묶고 신청자 1명 지정 → 자동 합산"),
       ("영수증 신청서 온라인화", "교인이 직접 입력. 작년 신청자는 확인만"),
       ("마감에서 거꾸로 일정", "영수증 1월·결산 공동의회가 못 미루는 마감")]
for i, (h, d) in enumerate(dec):
    x, y = 0.5 + (i % 3) * 3.05, 1.3 + (i // 3) * 1.9
    s.rect(x, y, 2.85, 1.7)
    s.badge(x + 0.2, y + 0.2, "✓", C["gold"], C["ink"], 0.4)
    s.text(h, x + 0.2, y + 0.7, 2.5, 0.38, 13.5, True, C["ink"])
    s.text(d, x + 0.2, y + 1.08, 2.5, 0.55, 10.5)
s.footer(7)
s.notes = ("주요 결정과 이유입니다. 웹과 앱을 한 벌로 만들어 비용을 줄이고, 인터넷이 끊겨도 입력되게 합니다. 교인 정보는 공개된 곳에 절대 두지 않고 주민번호는 암호화합니다. "
           "영수증은 가정 단위로 자동 합산하고, 신청서도 온라인으로 받아 입력을 줄입니다. 일정은 영수증과 결산 마감에서 거꾸로 짰습니다.")

# 8. 로드맵 — NOW 는 현재 단계 번호
NOW = 0
phases = [("0", "분석·설계", "9월 말~10월 초"), ("1", "헌금 입력 +\n주간현황", "10월"), ("2", "과거 데이터\n이관", "10월 말~11월 초"),
          ("3", "지출 +\n계좌 대사", "11월"), ("4", "기부금\n영수증", "11월 말~12월"), ("5", "예결산", "12월~1월"),
          ("6", "앱 마무리 ·\n엑셀 중단", "1월")]
s = Slide(); slides.append(s)
s.title("단계별 로드맵", "각 단계 끝마다: 고객 확인 → 기록 → 다음 단계")
for i, (n, h, when) in enumerate(phases):
    x, w, now = 0.5 + i * 1.3, 1.2, i == NOW
    s.rect(x, 1.6, w, 2.6, C["ink"] if now else C["mist"])
    s.badge(x + 0.37, 1.8, n, C["gold"] if now else C["ink"], C["ink"] if now else C["white"], 0.46)
    s.text(h, x + 0.08, 2.45, w - 0.16, 0.8, 12, True, C["white"] if now else C["ink"], "center")
    s.text(when, x + 0.08, 3.35, w - 0.16, 0.6, 9.5, color=C["pale"] if now else C["muted"], align="center")
s.text("▲ 지금 여기", 0.5 + NOW * 1.3, 4.35, 3, 0.35, 12, True, C["gold"])
s.footer(8)
s.notes = ("로드맵입니다. 지금은 0단계 분석·설계를 마무리하는 중입니다. 10월에 헌금 입력과 주간현황부터 엑셀과 병행해서 실제로 쓰기 시작하고, "
           "11월에 지출, 12월에 영수증, 1월에 예결산을 거쳐 엑셀을 완전히 중단하는 것이 목표입니다. 단계마다 재정부 확인을 받습니다.")

# 9. 다음 할 일
NEXT = ["계정과목표 확정 — 헌금 항목, 회계 3종, 부서 13개와 항목", "데이터베이스 설계",
        "1단계 개발 시작 — 로그인, 교인·가정 명부, 헌금 입력, 주간 헌금현황"]
s = Slide(C["ink"]); slides.append(s)
s.text("다음 할 일", 0.6, 0.5, 8.8, 0.7, 30, True, C["white"])
for i, t in enumerate(NEXT):
    s.badge(0.6, 1.55 + i * 0.9, i + 1, C["gold"], C["ink"], 0.48)
    s.text(t, 1.3, 1.55 + i * 0.9, 8.1, 0.48, 16, color=C["white"], valign="middle")
s.text("기록 위치: GitHub webyigit/wweebbyyii › church-finance (HISTORY.md, PLAN.md, NEXT.md)", 0.6, 4.6, 8.8, 0.35, 11, color=C["faint"])
s.notes = ("다음 할 일은 세 가지입니다. 계정과목표를 확정하고, 데이터베이스를 설계한 뒤, 1단계 개발을 시작합니다. "
           "모든 기록은 GitHub에 남아 있어서 누구나 과정을 확인할 수 있습니다. 감사합니다.")

# ── ODP 쓰기 ─────────────────────────────────────────────────────
NS = ('xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
      'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
      'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
      'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
      'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
      'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" office:version="1.2"')

pages = []
bgs = {}
for i, sl in enumerate(slides):
    bg = bgs.setdefault(sl.bg, f"dp{len(bgs)}")
    notes = (f'<presentation:notes><draw:frame presentation:class="notes" {box(0.8, 5.0, 6.9, 4.5)}>'
             f'<draw:text-box><text:p>{escape(sl.notes)}</text:p></draw:text-box></draw:frame></presentation:notes>')
    pages.append(f'<draw:page draw:name="s{i + 1}" draw:style-name="{bg}" draw:master-page-name="M">'
                 + "".join(sl.items) + notes + '</draw:page>')

auto = []
for color, name in bgs.items():
    auto.append(f'<style:style style:name="{name}" style:family="drawing-page"><style:drawing-page-properties '
                f'draw:fill="solid" draw:fill-color="{color}" presentation:background-visible="true"/></style:style>')
for (fill, stroke, valign, width), name in _gstyles.items():
    fillp = f'draw:fill="solid" draw:fill-color="{fill}"' if fill else 'draw:fill="none"'
    strokep = f'draw:stroke="solid" svg:stroke-color="{stroke}" svg:stroke-width="{width}"' if stroke else 'draw:stroke="none"'
    auto.append(f'<style:style style:name="{name}" style:family="graphic"><style:graphic-properties {fillp} {strokep} '
                f'draw:textarea-vertical-align="{valign}" draw:auto-grow-height="false" fo:padding="0in" '
                f'fo:wrap-option="wrap"/></style:style>')
for (size, bold, color, align), name in _tstyles.items():
    w = "bold" if bold else "normal"
    auto.append(f'<style:style style:name="{name}P" style:family="paragraph"><style:paragraph-properties fo:text-align="{"start" if align == "left" else "end" if align == "right" else "center"}"/></style:style>')
    auto.append(f'<style:style style:name="{name}" style:family="text"><style:text-properties fo:font-family="{FONT}" '
                f'style:font-family-asian="{FONT}" fo:font-size="{size * K:.1f}pt" style:font-size-asian="{size * K:.1f}pt" '
                f'fo:font-weight="{w}" style:font-weight-asian="{w}" fo:color="{color}"/></style:style>')

content = (f'<?xml version="1.0" encoding="UTF-8"?><office:document-content {NS}><office:automatic-styles>'
           + "".join(auto) + '</office:automatic-styles><office:body><office:presentation>'
           + "".join(pages) + '</office:presentation></office:body></office:document-content>')
styles = (f'<?xml version="1.0" encoding="UTF-8"?><office:document-styles {NS}><office:automatic-styles>'
          '<style:page-layout style:name="PM"><style:page-layout-properties fo:margin="0in" fo:page-width="10in" '
          'fo:page-height="5.625in" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles>'
          '<office:master-styles><style:master-page style:name="M" style:page-layout-name="PM"/></office:master-styles>'
          '</office:document-styles>')
manifest = ('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">'
            '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>'
            '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
            '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>'
            '</manifest:manifest>')

with zipfile.ZipFile("history.odp", "w") as z:
    ts = (2026, 1, 1, 0, 0, 0)
    z.writestr(zipfile.ZipInfo("mimetype", ts), "application/vnd.oasis.opendocument.presentation", zipfile.ZIP_STORED)
    for name, data in [("content.xml", content), ("styles.xml", styles), ("META-INF/manifest.xml", manifest)]:
        z.writestr(zipfile.ZipInfo(name, ts), data.encode(), zipfile.ZIP_DEFLATED, 9)

b64 = base64.b64encode(open("history.odp", "rb").read()).decode()
open("history.odp.b64", "w").write(b64)
print(f"history.odp: {len(slides)} slides, base64 {len(b64)} chars")
