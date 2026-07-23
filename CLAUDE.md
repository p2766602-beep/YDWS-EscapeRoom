# 跨專案提醒（務必先讀）

本專案（**YDWS-EscapeRoom**，演算法密室逃脫獨立學習模組）是 **BlocklyYdws**（教學平台本體）
與 **YDWS-CodingBank**（題庫生產管線）之外的第三個獨立git repo，三者是同一個工作系統的一部分，
但各自是獨立的git歷史，`git log`互相看不到對方。

**在回答任何「目前進度」「還有什麼待辦」「這件事解決了沒」之類的問題之前，一定要先去查
BlocklyYdws那邊的狀態，不能只看這個專案的歷史就下結論。**

## 本專案的定位

沿用`prompts/密室逃脫檢核-GEM.md`（放在BlocklyYdws裡）的遊戲設計（5關結構、蘇格拉底式引導、
碎片收集、最終金鑰、AI協作學習回顧），但工程架構獨立於BlocklyYdws之外。完整架構規格見
BlocklyYdws的`docs/密室逃脫獨立專案-架構規格.md`（2026-07-22定案，本專案的實作應以該文件為準）。

**情境D（SRC助教/SRC00）不在本專案裡跑，而是留在BlocklyYdws主平台的AI伴學浮動面板內**，透過
iframe + postMessage嵌入本專案部署的embed頁面（比照BlocklyYdws的
`src/smartring/simulator-bridge.js`模式），帶入SRC知識包參數。本專案的引擎程式碼會被BlocklyYdws
的SRC00課程引用，修改引擎行為時要意識到這個跨專案影響面。

## 怎麼找到BlocklyYdws / YDWS-CodingBank

平行資料夾，路徑依電腦而異：
- 家用電腦：`C:\YOSEP\BlocklyYdws`、`C:\YOSEP\YDWS-CodingBank`（三專案同層目錄）
- 學校電腦：路徑可能不同，找不到時用檔案搜尋找資料夾名稱。

## 共用的專案日誌

三專案共用同一份跨專案歷史記錄，**檔案實際放在BlocklyYdws裡**：`專案規劃摘要.md`。
不管是在哪一側做的決策或變更，都要回去更新那份文件，否則其他側的對話會讀不到。
