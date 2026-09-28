import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 인터넷이 없어도 앱이 열리도록 (배포된 앱에서만 — 개발 서버에서는 끔)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => { /* 안 돼도 앱은 동작 */ }));
}
