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
s.footer(len(slides))
s.notes = ("먼저 목표입니다. 핵심은 한 문장입니다. 헌금은 한 번만 입력하면 주간 집계, 개인별 집계, 기부금영수증, 예결산이 모두 자동으로 나오게 하는 것입니다. "
           "오른쪽 일곱 가지가 재정부가 요청한 요구사항이고, 이 일곱 가지가 모두 되어야 완료로 봅니다.")

# 3~4. 진행 타임라인 — HISTORY.md 항목이 늘면 여기에 추가 (한 장에 5개씩)
TIMELINE = [
    ("① 9/28", "프로젝트 시작", "드라이브 엑셀 분석, 계획·질문 작성, 기록 폴더 생성"),
    ("②③", "고객 답변 · 실제 파일 분석", "사용자 4명·권한 확정, 출납 파일 시트 27장 구조 파악"),
    ("④⑤", "어디서든 이어서 · 발표자료", "휴대폰에서 이어가기 안내, 이 발표자료 시작"),
    ("⑥", "1단계: 앱 첫 동작판", "헌금 입력(초성 검색), 주간 헌금현황 인쇄, 예산 진도율"),
    ("⑦~⑨", "2단계: 과거 엑셀 가져오기", "개인별 집계·주간 명단·출납 장부를 원 단위로 맞춤, 엑셀 속 불일치 3건 발견"),
    ("⑩", "3단계: 지출·출납 보고", "부서 12개·63항목, 고정지출 자동, 출납 보고서가 엑셀과 일치"),
    ("⑪", "3단계: 통장 내역", "농협 거래내역을 올리면 온라인 헌금 자동 매칭, 출금 자동 분류"),
    ("⑫~⑮", "클라우드 동기화 · 앱 공개", "Supabase 연결, 4명 역할별 권한, 누구나 여는 앱 주소"),
    ("⑯", "4단계: 기부금영수증", "가정별 합산·비율 나눔, 법정 서식, 발급대장, 주민번호 금고"),
    ("⑰", "5단계: 예결산·제직회", "결산·예산(안), 요약·상세·선교 보고 — 실제 엑셀과 164건 일치"),
    ("⑱", "작년(2025) 자료 가져오기", "2025 결산과 89건 일치, '작년 대비'가 엑셀과 다른 기준이었음을 발견"),
    ("⑲", "3·6단계 마무리", "통장 대사·차입·과목 이동, 백업, 인터넷 없이 열림, 엑셀과 자동 대조"),
]
TL_NOTES = [
    ("지금까지의 진행 첫 번째입니다. 첫날 구글 드라이브의 실제 엑셀을 분석해서 계획을 세웠고, 재정부 답변을 받아 사용자와 권한을 확정했습니다. "
     "휴대폰에서도 이어서 작업할 수 있게 했고, 1단계로 헌금 입력과 주간 헌금현황을 만들었습니다. "
     "2단계에서는 지난 엑셀 자료를 앱으로 가져오면서 원 단위까지 맞췄고, 그 과정에서 엑셀 안의 불일치 세 건을 찾아 재정부에 확인을 요청했습니다."),
    ("진행 두 번째입니다. 3단계에서 지출과 출납 보고서, 통장 거래내역 자동 분류를 만들었습니다. 이어서 PC와 휴대폰이 자동으로 맞춰지는 클라우드를 연결하고 "
     "앱을 누구나 열 수 있는 주소로 공개했습니다. 4단계 기부금영수증과 5단계 예결산·제직회 보고까지 마쳤고, 모두 실제 엑셀과 원 단위로 맞는지 확인했습니다."),
    ("진행 세 번째입니다. 작년 자료를 가져와 작년 결산과 원 단위로 맞췄고, 그 과정에서 엑셀 요약의 '작년 대비'가 서로 다른 기간과 범위를 비교하고 있었다는 것을 찾았습니다. "
     "마지막으로 통장 잔액 대사, 차입, 과목 이동, 백업과 되살리기, 인터넷 없이 여는 기능, 그리고 엑셀과 자동으로 비교하는 기능을 넣어 엑셀 없이 운영할 준비를 마쳤습니다."),
]
for k in range(0, len(TIMELINE), 5):
    part = TIMELINE[k:k + 5]
    s = Slide(); slides.append(s)
    s.title(f"지금까지의 진행 ({k // 5 + 1}/{(len(TIMELINE) + 4) // 5})", "작업 일지(HISTORY.md) 요약")
    gap = 0.8
    s.vline(0.9, 1.75, 1.75 + gap * (len(part) - 1))
    for i, (when, head, desc) in enumerate(part):
        y = 1.45 + i * gap
        last = k + i == len(TIMELINE) - 1
        two = k + i + 1 >= 10  # 두 자리 숫자는 구글에서 줄바꿈되지 않게 동그라미를 키우고 글자를 줄임
        s.badge(0.7 - (0.04 if two else 0), y - (0.04 if two else 0), k + i + 1, C["gold"] if last else C["ink"], d=0.48 if two else 0.4, size=8 if two else 13)
        s.text(when, 1.3, y + 0.02, 1.2, 0.36, 11, color=C["muted"], valign="middle")
        s.text(head, 2.5, y - 0.04, 6.8, 0.34, 15, True, C["ink"])
        s.text(desc, 2.5, y + 0.3, 6.8, 0.32, 11.5)
    s.footer(len(slides))
    s.notes = TL_NOTES[min(k // 5, len(TL_NOTES) - 1)]

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
s.footer(len(slides))
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
s.footer(len(slides))
s.notes = ("출납회계의 한 주를 비교해 보겠습니다. 왼쪽이 지금, 오른쪽이 앞으로입니다. 파일 복사와 초기화는 아예 없어지고, 고정지출은 미리 채워져서 확인만 하면 됩니다. "
           "은행 거래내역은 파일을 올리면 자동 분류되고, 검산도 자동입니다. 마지막엔 버튼 한 번으로 같은 모양의 두 장이 출력됩니다.")

# 지금 되는 것 (앱 화면)
FEATURES = [("헌금 입력", "초성 검색, 지난주 명단 한 번에"), ("주일헌금현황", "지금 양식 그대로 인쇄"), ("지출 입력", "고정지출이 미리 채워짐"),
            ("수입지출 보고", "주간·연 누계, 검산 자동"), ("통장 내역", "파일 올리면 자동 분류"), ("교인·가정", "가족 묶음, 영수증 신청자"),
            ("예산·이월", "예산과 전년 이월"), ("기부금영수증", "법정 서식·발급대장"), ("예결산·제직회", "결산·예산안·요약 보고"),
            ("재정 현황", "통장 대사·차입·과목 이동"), ("엑셀 가져오기", "지난 자료 한 번에"), ("계정·백업", "동기화·백업·되살리기")]
s = Slide(); slides.append(s)
s.title("지금 앱에서 되는 것", "앱 주소: webyigit.github.io/wweebbyyii/church-finance")
for i, (h, d) in enumerate(FEATURES):
    x, y = 0.5 + (i % 3) * 3.05, 1.3 + (i // 3) * 0.9
    s.rect(x, y, 2.85, 0.78)
    s.text(h, x + 0.2, y + 0.08, 2.5, 0.34, 13.5, True, C["ink"])
    s.text(d, x + 0.2, y + 0.42, 2.5, 0.3, 10.5, color=C["muted"])
s.footer(len(slides))
s.notes = ("지금 앱에서 되는 것들입니다. 인터넷이 끊겨도 앱이 열리고 입력됩니다. 헌금 입력부터 주간 현황, 지출, 출납 보고서, 통장 내역, 기부금영수증, 예결산과 제직회 보고까지 한 곳에서 됩니다. "
           "지난 엑셀 자료는 파일을 올리면 한 번에 들어오고, 로그인하면 PC와 휴대폰이 자동으로 맞춰집니다. 인터넷 주소만 있으면 설치 없이 열립니다.")

# 정확성 검증
s = Slide(); slides.append(s)
s.title("정확한가? — 실제 엑셀과 원 단위로 비교", "돈을 다루므로 '비슷하다'가 아니라 '같다'를 기준으로 삼았습니다")
checks = [("309명", "이름별 1년 헌금 합계가\n엑셀과 모두 같음"), ("761건", "지출 전부 과목을 찾고\n부서 12개 합계 일치"),
          ("253건", "올해 164·작년 89 결산\n숫자가 원 단위 일치"), ("160번", "실제 브라우저로 눌러 보는\n검사, 매번 전부 통과")]
for i, (n, d) in enumerate(checks):
    x = 0.5 + i * 2.3
    s.rect(x, 1.5, 2.1, 2.3)
    s.text(n, x + 0.2, 1.7, 1.8, 0.9, 32, True, C["ink"])
    s.text(d, x + 0.2, 2.65, 1.8, 1.0, 11)
s.text("덤으로: 엑셀 안의 불일치 3건(Q10~12), '작년 대비'가 다른 기준을 비교한 것(Q18)을 찾아 확인 요청", 0.5, 4.2, 9, 0.45, 12.5, True, C["red"])
s.footer(len(slides))
s.notes = ("정확성입니다. 재정 프로그램이라 비슷한 게 아니라 같아야 합니다. 그래서 실제 엑셀 파일과 원 단위로 비교했습니다. "
           "교인 309명의 1년 헌금 합계, 지출 761건, 올해와 작년 결산 숫자 253개가 모두 엑셀과 같았습니다. "
           "또 실제 브라우저로 사람처럼 눌러 보는 검사를 매번 160번 돌려 모두 통과했습니다. 이 과정에서 엑셀 안의 불일치와, 작년 대비 숫자가 서로 다른 기준을 비교하고 있던 것도 찾았습니다.")

# 개인정보 보호
s = Slide(); slides.append(s)
s.title("교인 정보는 어떻게 지키나")
prot = [("주민번호 금고", "저장하는 순간 잠김.\n'영수증 비밀번호'로만 열림.\n클라우드엔 잠긴 글자만."),
        ("역할별 권한", "등록된 4명만 로그인.\n기장·출납은 자기 일만 입력,\n재정부장·담임목사는 보기만."),
        ("기록이 남음", "모든 수정은 이전 내용과 함께\n이력에 남음. 지우기는\n'지움 표시'만 (감사 대응).")]
for i, (h, d) in enumerate(prot):
    x = 0.5 + i * 3.05
    s.rect(x, 1.3, 2.85, 2.9)
    s.badge(x + 0.2, 1.5, "✓", C["gold"], C["ink"], 0.45)
    s.text(h, x + 0.2, 2.1, 2.5, 0.4, 15, True, C["ink"])
    s.text(d, x + 0.2, 2.6, 2.5, 1.4, 11.5)
s.text("개발 기록(GitHub)은 공개이므로 실제 이름·금액·주민번호는 절대 넣지 않고, 가짜 이름으로만 시험합니다.", 0.5, 4.45, 9, 0.45, 12, color=C["muted"])
s.footer(len(slides))
s.notes = ("교인 정보 보호입니다. 주민번호는 저장하는 순간 잠기고, 기장회계가 정한 영수증 비밀번호가 있어야만 열립니다. 클라우드에도 잠긴 글자만 올라갑니다. "
           "로그인은 등록된 네 분만 되고, 각자 맡은 일만 입력할 수 있습니다. 모든 수정은 이력으로 남아 감사 때 확인할 수 있습니다. "
           "개발 기록은 공개되어 있으므로 실제 정보는 절대 넣지 않고 가짜 이름으로만 시험했습니다.")

# 6. 고객 확인 사항
s = Slide(); slides.append(s)
s.title("고객에게 확인한 것", "필요한 것만 물었습니다")
qa = [("지출은 어디에?", "주간 파일의 날짜 시트. 고정 지출 + 출납회계가 추가로 입력하는 지출"),
      ("누가 쓰나?", "입력 2명(기장회계·출납회계), 열람 2명(재정부장·담임목사)"),
      ("영수증 개인정보는?", "이름·전화·주소·주민번호를 매년 종이 신청서로 받아 수동 발행"),
      ("가족 헌금 영수증은?", "가정마다 신청자 1명에게 가족 전원 헌금을 몰아서 발행")]
for i, (q, a) in enumerate(qa):
    y = 1.45 + i * 0.9
    s.badge(0.45, y + 0.07, f"Q{i + 1}", d=0.56, size=9)
    s.text(q, 1.2, y, 2.6, 0.7, 14, True, C["ink"], valign="middle")
    s.rect(3.8, y, 5.7, 0.7)
    s.text(a, 4.0, y, 5.4, 0.7, 12, valign="middle")
s.footer(len(slides))
s.notes = ("재정부에 확인한 네 가지입니다. 지출은 주간 파일에서 고정지출과 추가 지출로 관리하고, 사용자는 입력 두 분과 열람 두 분입니다. "
           "기부금영수증은 매년 종이 신청서로 개인정보를 받고, 가족 헌금은 신청자 한 분에게 모아서 발행합니다. 질문은 꼭 필요한 것만 드렸습니다.")

# 7. 결정과 이유
s = Slide(); slides.append(s)
s.title("주요 결정과 그 이유")
dec = [("웹·앱 한 벌로", "PWA 하나로 PC·휴대폰 모두. 스토어 심사 없이 설치"),
       ("클라우드 + 기기 사본", "Supabase + 기기 저장소. 와이파이 끊겨도 입력"),
       ("실데이터는 저장소에 없음", "공개 저장소라 교인 정보는 DB에만, 주민번호 암호화"),
       ("가정 단위 영수증", "가족 헌금을 신청자에게 모음. 두 사람이면 비율로"),
       ("엑셀과 같은 양식", "익숙한 출력물 그대로. 검산은 자동으로"),
       ("마감에서 거꾸로 일정", "영수증 1월·결산 공동의회가 못 미루는 마감")]
for i, (h, d) in enumerate(dec):
    x, y = 0.5 + (i % 3) * 3.05, 1.3 + (i // 3) * 1.9
    s.rect(x, y, 2.85, 1.7)
    s.badge(x + 0.2, y + 0.2, "✓", C["gold"], C["ink"], 0.4)
    s.text(h, x + 0.2, y + 0.7, 2.5, 0.38, 13.5, True, C["ink"])
    s.text(d, x + 0.2, y + 1.08, 2.5, 0.55, 10.5)
s.footer(len(slides))
s.notes = ("주요 결정과 이유입니다. 웹과 앱을 한 벌로 만들어 비용을 줄이고, 인터넷이 끊겨도 입력되게 합니다. 교인 정보는 공개된 곳에 절대 두지 않고 주민번호는 암호화합니다. "
           "영수증은 가정 단위로 자동 합산하고, 한 가정을 두 분이 나눠 받으면 비율로 나눕니다. 출력물은 지금 엑셀 양식 그대로 만들었습니다. 일정은 영수증과 결산 마감에서 거꾸로 짰습니다.")

# 8. 로드맵 — NOW 는 현재 단계 번호
NOW = 6
phases = [("0", "분석·설계", "완료 ✓"), ("1", "헌금 입력 +\n주간현황", "완료 ✓"), ("2", "과거 데이터\n이관", "완료 ✓"),
          ("3", "지출 +\n계좌 대사", "완료 ✓"), ("4", "기부금\n영수증", "완료 ✓"), ("5", "예결산", "완료 ✓"),
          ("6", "병행 운영 ·\n엑셀 중단", "앱 완료 ✓\n병행 운영")]
s = Slide(); slides.append(s)
s.title("단계별 로드맵", "각 단계 끝마다: 고객 확인 → 기록 → 다음 단계")
for i, (n, h, when) in enumerate(phases):
    x, w, now = 0.5 + i * 1.3, 1.2, i == NOW
    s.rect(x, 1.6, w, 2.6, C["ink"] if now else C["mist"])
    s.badge(x + 0.37, 1.8, n, C["gold"] if now else C["ink"], C["ink"] if now else C["white"], 0.46)
    s.text(h, x + 0.08, 2.45, w - 0.16, 0.8, 12, True, C["white"] if now else C["ink"], "center")
    s.text(when, x + 0.08, 3.35, w - 0.16, 0.6, 9.5, color=C["pale"] if now else C["muted"], align="center")
s.text("▲ 지금 여기", 0.5 + NOW * 1.3, 4.35, 1.6, 0.35, 12, True, C["gold"])
s.footer(len(slides))
s.notes = ("로드맵입니다. 0단계부터 6단계까지 앱 개발은 모두 마쳤습니다. 이제 마지막으로 네 분이 실제로 쓰면서 "
           "4주 동안 엑셀과 나란히 결과를 비교합니다. 결과가 계속 같으면 엑셀을 중단합니다.")

# 9. 다음 할 일
NEXT = ["네 분 가입 → 클라우드 동기화 시작 (PC·휴대폰 자동 맞춤)", "지난 자료·작년 자료 가져오기, 통장·차입 등록",
        "4주 병행: 매주 '엑셀과 대조'가 모두 ✔ 이면 엑셀 중단", "남은 확인: 질문 Q10~Q19 (사용 설명서·중단 계획은 docs 폴더)"]
s = Slide(C["ink"]); slides.append(s)
s.text("다음 할 일", 0.6, 0.5, 8.8, 0.7, 30, True, C["white"])
for i, t in enumerate(NEXT):
    s.badge(0.6, 1.5 + i * 0.72, i + 1, C["gold"], C["ink"], 0.48)
    s.text(t, 1.3, 1.5 + i * 0.72, 8.1, 0.48, 16, color=C["white"], valign="middle")
s.text("기록 위치: GitHub webyigit/wweebbyyii › church-finance (HISTORY.md, PLAN.md, NEXT.md)", 0.6, 4.6, 8.8, 0.35, 11, color=C["faint"])
s.notes = ("다음 할 일입니다. 앱 개발은 모두 끝났고, 이제 재정부가 쓰기 시작하는 단계입니다. 네 분이 가입하면 PC와 휴대폰이 자동으로 맞춰집니다. "
           "지난 자료를 가져오고 통장과 차입을 등록한 뒤, 4주 동안 엑셀과 나란히 쓰면서 매주 앱의 '엑셀과 대조' 결과가 모두 맞으면 엑셀을 중단합니다. "
           "사용 설명서와 중단 계획은 GitHub의 docs 폴더에 있습니다. 감사합니다.")

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
