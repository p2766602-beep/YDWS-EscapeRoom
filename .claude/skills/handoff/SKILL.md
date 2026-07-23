---
name: handoff
description: 換機器（家用⇄學校）前的收尾流程。檢查本專案與另外兩個關聯專案（YDWS-CodingBank、YDWS-EscapeRoom）的git狀態，列出未commit變更與未push commit，等使用者明確同意才push／部署，最後產生交接摘要。使用者說「要換機器了」「幫我收尾」「/handoff」時執行。
---

# 換機器交接流程

本專案（BlocklyYdws）跟另外兩個平行專案共用同一套交接儀式：
- `YDWS-CodingBank`（家用：`C:\YOSEP\YDWS-CodingBank`／學校：`D:\YOSEP\YDWS-CodingBank`）
- `YDWS-EscapeRoom`（家用：`C:\YOSEP\YDWS-EscapeRoom`／學校：`D:\YOSEP\YDWS-EscapeRoom`）

依序執行以下步驟，每一步做完才進下一步。**遇到需要判斷的地方要停下來問使用者，不要自己假設。**

## 1. 檢查本專案（BlocklyYdws）

- `git status` 看有沒有未commit的變更
- `git log --oneline @{u}..HEAD` 看有沒有本地領先remote、尚未push的commit
- 有未commit的變更就列出檔案清單給使用者看，**問是否要commit、commit訊息打算怎麼寫**，不要自己編訊息就直接commit

## 2. 依序檢查兩個關聯專案

對 `YDWS-CodingBank` 跟 `YDWS-EscapeRoom` **兩個都要做**，不能只做一個：
- 路徑找不到就依CLAUDE.md列出的候選路徑或搜尋資料夾名稱 `YDWS-CodingBank`／`YDWS-EscapeRoom`
- 同樣做 `git status` 跟未push commit檢查
- 這兩個專案沒有npm build/deploy流程，只需要看git狀態

## 3. 彙整差異報告

用表格列出三個專案各自的：未commit變更數、未push commit數、目前分支。
**在還沒檢查完三個專案前，不要下「已經同步完成」之類的結論**——這是過去最常出狀況的地方。

## 4. 等待使用者確認才動作

- 列出即將要push的commit清單（訊息＋涉及檔案），問使用者「要push這些嗎？」
- 得到明確同意後才執行 `git push`
- 本專案（BlocklyYdws）部署一律用 `npm run deploy`（內部呼叫`gh-pages`套件，走git push機制，不需要gh CLI互動登入）；部署前一樣要先問使用者是否要部署
- **絕對不要自己判斷「應該可以吧」就動手push或部署**

## 5. 產生交接文件

寫一份 `HANDOFF.md`（或使用者指定的檔名），內容包含：
- 三個專案目前各自完成到哪、分支狀態
- 已知待辦、被跳過或使用者拒絕的動作
- 下一步建議
- 提醒下次工作階段開始時，先讀這份文件 + `專案規劃摘要.md`最上方的「目前決策現況」表，不要只讀單一專案的歷史就下結論

## 絕對不要

- 沒問過使用者就自動push或部署
- 只檢查一個專案就回報「都同步好了」
- 自己幫使用者寫commit訊息並直接commit（除非使用者明確要求）
