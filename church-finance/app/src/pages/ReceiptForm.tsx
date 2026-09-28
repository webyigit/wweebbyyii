import { useEffect, useState } from "react";
import type { Receipt } from "../domain/types";
import type { ChurchInfo } from "../data/receiptActions";
import { revealId } from "../data/receiptActions";
import { won } from "../domain/weeklyReport";

// 법정 서식: 소득세법 시행규칙 [별지 제45호의2서식] 기부금 영수증. A4 한 장에 한 사람.
// 교회 직인은 인쇄한 뒤 찍는다.
const dateKo = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };

export function ReceiptForms({ receipts, church, onClose }: { receipts: Receipt[]; church: ChurchInfo; onClose: () => void }) {
  const [ids, setIds] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string | null> = {};
      for (const r of receipts) out[r.id] = r.kind === "corp" ? r.bizNo ?? null : await revealId(r.idSealed);
      if (alive) setIds(out);
    })();
    return () => { alive = false; };
  }, [receipts]);
  const hidden = receipts.filter((r) => r.kind === "person" && r.idSealed && !ids[r.id]).length;
  const missingChurch = !church.name || !church.regNo || !church.address;

  return (
    <div className="print-preview">
      <div className="row no-print pad">
        <button className="primary" onClick={() => print()}>인쇄 ({receipts.length}장)</button>
        <button onClick={onClose}>닫기</button>
        {hidden > 0 && <span className="warn">영수증 비밀번호를 넣지 않아 주민번호 뒷자리가 가려진 채 찍힙니다 ({hidden}장)</span>}
        {missingChurch && <span className="warn">설정에서 교회 정보(단체명·고유번호·소재지)를 먼저 넣으세요</span>}
      </div>
      {receipts.map((r) => <ReceiptPage key={r.id} r={r} church={church} idText={ids[r.id] ?? r.idMasked ?? r.bizNo ?? ""} />)}
    </div>
  );
}

function ReceiptPage({ r, church, idText }: { r: Receipt; church: ChurchInfo; idText: string }) {
  const corp = r.kind === "corp";
  const months = r.months.some((m) => m) ? r.months.map((amount, i) => ({ ym: `${r.year}.${String(i + 1).padStart(2, "0")}`, amount })).filter((m) => m.amount) : [{ ym: `${r.year}.01~${r.year}.12`, amount: r.amount }];
  return (
    <article className="receipt-page" data-serial={r.serial}>
      <p className="form-no">■ 소득세법 시행규칙 [별지 제45호의2서식]</p>
      <div className="receipt-title">
        <h1>기부금 영수증</h1>
        <p>일련번호 <b>{r.serial}</b></p>
      </div>
      {r.status === "void" && <p className="void-mark">폐기 — {r.voidReason}</p>}

      <h3>① 기부자</h3>
      <table className="form">
        <tbody>
          <tr><th>{corp ? "법인명" : "성명"}</th><td className="donor-name">{r.name}</td><th>{corp ? "사업자등록번호" : "주민등록번호"}</th><td className="donor-id">{idText}</td></tr>
          <tr><th>{corp ? "소재지" : "주소"}</th><td colSpan={3}>{r.address}</td></tr>
        </tbody>
      </table>

      <h3>② 기부금 단체</h3>
      <table className="form">
        <tbody>
          <tr><th>단체명</th><td>{church.name}</td><th>사업자등록번호<br />(고유번호)</th><td>{church.regNo}</td></tr>
          <tr><th>소재지</th><td>{church.address}</td><th>기부금공제대상<br />기부금단체 근거법령</th><td>{church.law}</td></tr>
        </tbody>
      </table>

      <h3>③ 기부금 모집처(언론기관 등)</h3>
      <table className="form">
        <tbody><tr><th>단체명</th><td /><th>사업자등록번호</th><td /></tr><tr><th>소재지</th><td colSpan={3} /></tr></tbody>
      </table>

      <h3>④ 기부내용</h3>
      <table className="form contents">
        <thead>
          <tr><th rowSpan={2}>코드</th><th rowSpan={2}>구분<br />(금전 또는 현물)</th><th rowSpan={2}>연월일</th><th colSpan={4}>내용</th></tr>
          <tr><th>품명</th><th>수량</th><th>단가</th><th>금액</th></tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.ym}><td>{church.code}</td><td>금전</td><td>{m.ym}</td><td>헌금</td><td /><td /><td className="num">{won(m.amount)}</td></tr>
          ))}
          <tr className="sum"><td colSpan={6}>합계</td><td className="num receipt-amount">{won(r.amount)}</td></tr>
        </tbody>
      </table>

      <p className="legal">
        「소득세법」 제34조, 「조세특례제한법」 제58조ㆍ제76조ㆍ제88조의4 및 「법인세법」 제24조에 따른 기부금을
        위와 같이 기부하였음을 증명하여 주시기 바랍니다.
      </p>
      <p className="sign">{dateKo(r.issuedAt)}　　신청인　{r.name}　(서명 또는 인)</p>
      <p className="legal">위와 같이 기부금을 기부받았음을 증명합니다.</p>
      <p className="sign">{dateKo(r.issuedAt)}　　기부금 수령인　{church.name} {church.receiver}　(서명 또는 인)</p>
    </article>
  );
}
