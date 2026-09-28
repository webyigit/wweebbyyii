// 파일 받기 — 파일 이름(한글·확장자)이 그대로 남게 직접 내려받는다.
// (엑셀 라이브러리의 writeFile 은 브라우저에서 이름이 'download' 로 바뀌는 일이 있었음)
import * as XLSX from "xlsx";

export function downloadBlob(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadWorkbook(wb: XLSX.WorkBook, name: string) {
  downloadBlob(name, XLSX.write(wb, { type: "array", bookType: "xlsx" }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
