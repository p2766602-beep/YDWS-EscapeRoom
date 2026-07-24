import { startTopic, submitAnswer, getOverview } from './api.js';

// 圖像素材根目錄（docs/密室逃脫圖像素材清單.md，2026-07-24生成入庫）。
// public/images/下的靜態資源要用BASE_URL組路徑，直接寫死'/images/...'在部署後（base:'/YDWS-EscapeRoom/'）會找不到檔案。
const IMG_BASE = `${import.meta.env.BASE_URL}images/`;

// 13主題官方清單（BlocklyYdws docs/密室逃脫獨立專案-架構規格.md §1/§8定案）。
// column對應Tier1~Tier5（Tier3.5獨立一欄），純粹是總覽節點圖的排版分組，跟後端progress key無關。
// 圖示檔案＝topic-icons/{code}.png（素材清單.md），不再用emoji。
const TOPIC_MAP = [
  { code: 'max_value', name: '找最大值', column: 1 },
  { code: 'find_min', name: '找最小值', column: 1 },
  { code: 'linear_search', name: '線性搜尋', column: 1 },
  { code: 'bubble_sort', name: '氣泡排序', column: 2 },
  { code: 'selection_sort', name: '選擇排序', column: 2 },
  { code: 'insertion_sort', name: '插入排序', column: 2 },
  { code: 'binary_search', name: '二分搜尋', column: 3 },
  { code: 'recursion_basics', name: '遞迴基礎', column: 4 },
  { code: 'merge_sort', name: '合併排序', column: 4 },
  { code: 'greedy', name: '貪婪演算法', column: 5 },
  { code: 'dfs', name: 'DFS深度優先', column: 5 },
  { code: 'bfs', name: 'BFS廣度優先', column: 5 },
  { code: 'dp', name: '動態規劃', column: 6 },
];

const COLUMN_LABELS = {
  1: 'Tier1｜基礎',
  2: 'Tier2｜排序三部曲',
  3: 'Tier3｜分治',
  4: 'Tier3.5｜遞迴橋樑',
  5: 'Tier4｜策略與圖走訪',
  6: 'Tier5｜總整理',
};
const COLUMN_COUNT = 6;

// column→tier-icons檔名（COLUMN_LABELS的Tier編號跟column索引不是1:1，對照素材清單.md）。
const COLUMN_ICON_FILES = {
  1: 'tier-icon-1.png',
  2: 'tier-icon-2.png',
  3: 'tier-icon-3.png',
  4: 'tier-icon-3-5.png',
  5: 'tier-icon-4.png',
  6: 'tier-icon-5.png',
};

document.body.style.backgroundImage = `url('${IMG_BASE}frames/bg-texture-parchment.png')`;
document.body.style.backgroundRepeat = 'repeat';

// 自選難度取代年級分版：資優班內部能力落差本身就大，年級不是準確的能力代理指標。
// entry畫面選一次，13主題共用同一個難度場次（2026-07-23確認，不做每主題各自選難度）。
const DIFFICULTIES = [
  { code: 'basic', name: '基礎版' },
  { code: 'advanced', name: '進階版' },
];

const app = document.getElementById('app');

const state = {
  screen: 'entry', // entry | overview | level | completed
  studentId: '',
  difficulty: DIFFICULTIES[0].code,
  topic: null,
  topicName: null,
  overviewTopics: null, // [{code,status,level}] 從/overview抓回來的進度
  overviewLoading: false,
  level: null,
  levelKind: null,
  content: null,
  fragments: [],
  finalKey: null,
  review: null, // AI協作學習與素養引導（GEM原設計階段五）
  dragOrder: null, // Level4用：目前排列順序（steps的索引陣列）
  loading: false,
  error: '',
  lastFeedback: null, // { pass, text }
};

function render() {
  app.innerHTML = '';
  app.classList.toggle('wide', state.screen === 'overview');
  if (state.screen === 'entry') return renderEntryScreen();
  if (state.screen === 'overview') return renderOverviewScreen();
  if (state.screen === 'level') return renderLevelScreen();
  if (state.screen === 'completed') return renderCompletedScreen();
}

function renderCard(children) {
  const card = document.createElement('div');
  card.className = 'card';
  children.forEach((c) => c && card.appendChild(c));
  app.appendChild(card);
  return card;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value);
    }
  });
  children.forEach((c) => c && node.appendChild(c));
  return node;
}

function renderErrorBox() {
  if (!state.error) return null;
  return el('div', { class: 'error', text: state.error });
}

function renderEntryScreen() {
  const seatInput = el('input', { type: 'text', id: 'seat' });
  const nameInput = el('input', { type: 'text', id: 'name' });
  const firstTimeCheckbox = el('input', { type: 'checkbox', id: 'first-time' });

  const difficultySelect = el(
    'select',
    {
      onChange: (e) => {
        state.difficulty = e.target.value;
      },
    },
    DIFFICULTIES.map((d) => el('option', { value: d.code, text: d.name })),
  );
  difficultySelect.value = state.difficulty;

  const submitBtn = el('button', {
    class: 'btn-primary',
    text: state.loading ? '召喚中……' : '開始探索！',
    onClick: async () => {
      const seat = seatInput.value.trim();
      const name = nameInput.value.trim();
      if (!seat || !name) {
        state.error = '學號和姓名都要填喔，勇者。';
        return render();
      }
      const studentId = `${seat}-${name}`;
      state.error = '';
      state.loading = true;
      render();
      try {
        const data = await getOverview({ studentId });
        // 有沒有「帳號」沒有獨立欄位，靠13主題×2難度裡是否曾出現任何一筆紀錄來判斷。
        const hasAnyRecord = data.topics.some((t) => t.basic !== 'not_started' || t.advanced !== 'not_started');
        if (firstTimeCheckbox.checked && hasAnyRecord) {
          state.error = '這個學號已經有紀錄囉！如果你是回來接續進度的舊生，請取消勾選「第一次使用」再試一次。';
          state.loading = false;
          return render();
        }
        if (!firstTimeCheckbox.checked && !hasAnyRecord) {
          state.error = '查無這個學號的任何紀錄。如果你是第一次使用，請勾選「第一次使用」再試一次；如果不是，請確認學號和姓名有沒有打錯字。';
          state.loading = false;
          return render();
        }
        state.studentId = studentId;
        state.overviewTopics = data.topics;
        state.screen = 'overview';
      } catch (err) {
        state.error = err.message;
      }
      state.loading = false;
      render();
    },
  });

  const difficultyRow = el('div', { class: 'field-inline' }, [
    el('label', { text: '選擇難度' }),
    difficultySelect,
  ]);

  const seatRow = el('div', { class: 'field-inline' }, [
    el('label', { text: '學號' }),
    el('label', { class: 'checkbox-inline' }, [firstTimeCheckbox, document.createTextNode(' 第一次使用')]),
  ]);

  renderCard([
    el('div', { class: 'title-row' }, [
      el('img', { class: 'gm-avatar-img', src: `${IMG_BASE}avatars/gm-avatar.png`, alt: '關主' }),
      el('h1', { text: '真理大廳：演算法密室逃脫' }),
    ]),
    difficultyRow,
    seatRow,
    seatInput,
    el('label', { text: '姓名' }),
    nameInput,
    renderErrorBox(),
    submitBtn,
  ]);
}

async function loadOverview() {
  state.overviewLoading = true;
  state.error = '';
  render();
  try {
    const data = await getOverview({ studentId: state.studentId });
    state.overviewTopics = data.topics;
  } catch (err) {
    state.error = err.message;
  }
  state.overviewLoading = false;
  render();
}

// 目前這次選定的難度下的狀態（進行中/建議下一步用這個判斷）。
function statusOf(code) {
  const found = (state.overviewTopics || []).find((t) => t.topic === code);
  return found ? found[state.difficulty] : 'not_started';
}

// 跨難度的成就徽章：曾經過關的最高難度（進階版優先），不受目前選定難度影響。
function achievementOf(code) {
  const found = (state.overviewTopics || []).find((t) => t.topic === code);
  if (!found) return 'none';
  if (found.advanced === 'completed') return 'advanced';
  if (found.basic === 'completed') return 'basic';
  return 'none';
}

// 建議下一步＝依Tier順序第一個「還沒完成」的主題，軟性推薦、不鎖關（任何節點都能點）。
function recommendedCode() {
  const notDone = TOPIC_MAP.find((t) => statusOf(t.code) !== 'completed');
  return notDone ? notDone.code : null;
}

function renderOverviewScreen() {
  const header = el('div', { class: 'overview-header' }, [
    el('h1', { text: '🗺️ 真理大廳：主題探索地圖' }),
    el('p', { class: 'overview-sub' }, [
      el('img', { class: 'student-avatar-img', src: `${IMG_BASE}avatars/student-avatar.png`, alt: '學徒' }),
      document.createTextNode(`${state.studentId}｜${DIFFICULTIES.find((d) => d.code === state.difficulty).name}`),
    ]),
    el('a', {
      href: '#',
      class: 'switch-student-link',
      text: '換人 / 重新開始',
      onClick: (e) => {
        e.preventDefault();
        resetToEntryScreen();
      },
    }),
  ]);

  if (state.overviewLoading) {
    app.appendChild(header);
    app.appendChild(el('p', { text: '讀取進度中……' }));
    return;
  }

  const recommended = recommendedCode();
  const track = el('div', { class: 'overview-track' });
  const columns = el('div', { class: 'tier-columns' });

  for (let col = 1; col <= COLUMN_COUNT; col += 1) {
    const topicsInCol = TOPIC_MAP.filter((t) => t.column === col);
    const nodeEls = topicsInCol.map((t) => renderNode(t, recommended));
    const nodesWrap = el(
      'div',
      { class: `tier-nodes${topicsInCol.length > 1 ? ' has-spine' : ''}` },
      nodeEls,
    );
    const tierLabel = el('div', { class: 'tier-label' }, [
      el('img', { class: 'tier-icon-img', src: `${IMG_BASE}tier-icons/${COLUMN_ICON_FILES[col]}`, alt: '' }),
      document.createTextNode(COLUMN_LABELS[col]),
    ]);
    const column = el('div', { class: 'tier-column' }, [tierLabel, nodesWrap]);
    columns.appendChild(column);
  }

  track.appendChild(el('div', { class: 'trunk-line' }));
  track.appendChild(columns);

  app.appendChild(header);
  const errBox = renderErrorBox();
  if (errBox) app.appendChild(errBox);
  app.appendChild(track);
}

function renderNode(topicDef, recommended) {
  const status = statusOf(topicDef.code);
  const achievement = achievementOf(topicDef.code);

  let stateClass;
  let badgeEl;
  if (achievement === 'advanced') {
    stateClass = 'node--ach-advanced';
    badgeEl = el('img', { class: 'node-badge node-badge-img', src: `${IMG_BASE}badges/badge-advanced.png`, alt: '進階版過關' });
  } else if (achievement === 'basic') {
    stateClass = 'node--ach-basic';
    badgeEl = el('img', { class: 'node-badge node-badge-img', src: `${IMG_BASE}badges/badge-basic.png`, alt: '基礎版過關' });
  } else if (status === 'in_progress') {
    stateClass = 'node--in-progress';
    badgeEl = el('span', { class: 'node-badge', text: '◐' });
  } else if (topicDef.code === recommended) {
    stateClass = 'node--recommended';
    badgeEl = null;
  } else {
    stateClass = 'node--available';
    badgeEl = null;
  }

  return el('button', {
    class: `node ${stateClass}`,
    title: topicDef.name,
    onClick: () => enterTopic(topicDef),
  }, [
    el('img', { class: 'node-icon-img', src: `${IMG_BASE}topic-icons/${topicDef.code}.png`, alt: topicDef.name }),
    badgeEl,
    el('span', { class: 'node-label', text: topicDef.name }),
  ]);
}

async function enterTopic(topicDef) {
  state.topic = topicDef.code;
  state.topicName = topicDef.name;
  state.error = '';
  state.loading = true;
  render();
  try {
    const data = await startTopic({
      studentId: state.studentId,
      topic: state.topic,
      topicName: state.topicName,
      difficulty: state.difficulty,
    });
    applyStartResponse(data);
  } catch (err) {
    state.error = err.message;
    state.screen = 'overview';
  }
  state.loading = false;
  render();
}

function applyStartResponse(data) {
  if (data.status === 'completed') {
    state.screen = 'completed';
    state.fragments = data.fragments;
    state.finalKey = data.finalKey;
    state.review = data.review;
    return;
  }
  state.screen = 'level';
  state.level = data.level;
  state.levelKind = data.levelKind;
  state.content = data.content;
  state.fragments = data.fragments;
  state.lastFeedback = null;
  if (state.levelKind === 'drag') {
    state.dragOrder = state.content.steps.map((_, i) => i);
  } else {
    state.dragOrder = null;
  }
}

function applyAnswerResponse(data) {
  if (!data.pass) {
    state.lastFeedback = { pass: false, text: data.feedback };
    return;
  }
  if (data.completed) {
    state.screen = 'completed';
    state.fragments = data.fragments;
    state.finalKey = data.finalKey;
    state.review = data.review;
    state.lastFeedback = { pass: true, text: data.feedback };
    return;
  }
  state.level = data.nextLevel;
  state.levelKind = data.levelKind;
  state.content = data.content;
  state.fragments = data.fragments;
  state.lastFeedback = { pass: true, text: data.feedback };
  if (state.levelKind === 'drag') {
    state.dragOrder = state.content.steps.map((_, i) => i);
  } else {
    state.dragOrder = null;
  }
}

async function doSubmit(mode, answer) {
  state.error = '';
  state.loading = true;
  render();
  try {
    const data = await submitAnswer({
      studentId: state.studentId,
      topic: state.topic,
      level: state.level,
      mode,
      answer,
      difficulty: state.difficulty,
    });
    applyAnswerResponse(data);
  } catch (err) {
    state.error = err.message;
  }
  state.loading = false;
  render();
}

function renderFeedback() {
  if (!state.lastFeedback) return null;
  return el('div', {
    class: `feedback ${state.lastFeedback.pass ? 'pass' : 'fail'}`,
    text: state.lastFeedback.text,
  });
}

function renderFragments() {
  if (!state.fragments || state.fragments.length === 0) return null;
  return el('div', { class: 'fragments', text: `🧩 已收集碎片：${state.fragments.length} / 5` });
}

function renderTextFallback(onSubmitText) {
  const textarea = el('textarea', { placeholder: '也可以用你自己的話回答……' });
  const btn = el('button', {
    class: 'btn-secondary',
    text: state.loading ? '傳送中……' : '用文字回答',
    onClick: () => onSubmitText(textarea.value),
  });
  return el('div', {}, [el('label', { text: '或者，直接打字回答：' }), textarea, btn]);
}

function renderLevelScreen() {
  const kind = state.levelKind;
  const content = state.content;
  const children = [
    el('div', { class: 'title-row' }, [
      el('img', { class: 'gm-avatar-img gm-avatar-img--small', src: `${IMG_BASE}avatars/gm-avatar.png`, alt: '關主' }),
      el('h1', { text: `${state.topicName} — Level ${state.level} / 5` }),
    ]),
    el('a', {
      href: '#',
      class: 'level-back-link',
      text: '← 返回總覽（可以先去看看別的主題，之後回來會接續這一關的進度）',
      onClick: (e) => {
        e.preventDefault();
        returnToOverview();
      },
    }),
    renderFragments(),
    renderFeedback(),
    renderErrorBox(),
  ];

  if (kind === 'text') {
    const question = content.story || '';
    if (content.scenarios) {
      const list = el('ul', { class: 'scenario-list' });
      content.scenarios.forEach((s) => list.appendChild(el('li', { text: s })));
      children.push(list);
    } else if (content.story) {
      children.push(el('p', { text: content.story }));
    }
    children.push(el('p', { text: content.question, style: 'font-weight:600' }));

    const textarea = el('textarea', { placeholder: '在這裡輸入你的答案……' });
    const submitBtn = el('button', {
      class: 'btn-primary',
      text: state.loading ? '傳送中……' : '提交答案',
      onClick: () => doSubmit('text', textarea.value),
    });
    children.push(textarea, submitBtn);
  }

  if (kind === 'button') {
    const scenarioText = content.scenario || content.crisisScenario || '';
    children.push(el('p', { text: scenarioText }));
    children.push(el('p', { text: content.question, style: 'font-weight:600' }));

    content.options.forEach((opt, idx) => {
      const label = ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
      const btn = el('button', {
        class: 'option-btn',
        text: `${label}. ${opt}`,
        onClick: () => doSubmit('button', idx),
      });
      children.push(btn);
    });

    children.push(el('div', { class: 'divider' }, [renderTextFallback((val) => doSubmit('text', val))]));
  }

  if (kind === 'drag') {
    children.push(el('p', { text: content.question, style: 'font-weight:600' }));
    const list = el('ul', { class: 'drag-list' });
    state.dragOrder.forEach((stepIdx, pos) => {
      const item = el('li', { class: 'drag-item' }, [
        el('span', { text: `${pos + 1}. ${content.steps[stepIdx]}` }),
        el('span', { class: 'drag-actions' }, [
          el('button', {
            class: 'btn-secondary',
            text: '▲',
            onClick: () => {
              if (pos === 0) return;
              const arr = state.dragOrder;
              [arr[pos - 1], arr[pos]] = [arr[pos], arr[pos - 1]];
              render();
            },
          }),
          el('button', {
            class: 'btn-secondary',
            text: '▼',
            onClick: () => {
              if (pos === state.dragOrder.length - 1) return;
              const arr = state.dragOrder;
              [arr[pos + 1], arr[pos]] = [arr[pos], arr[pos + 1]];
              render();
            },
          }),
        ]),
      ]);
      list.appendChild(item);
    });
    children.push(list);
    children.push(
      el('button', {
        class: 'btn-primary',
        text: state.loading ? '傳送中……' : '提交排序',
        onClick: () => doSubmit('drag', state.dragOrder),
      }),
    );
    children.push(el('div', { class: 'divider' }, [renderTextFallback((val) => doSubmit('text', val))]));
  }

  renderCard(children);
}

function resetToEntryScreen() {
  state.screen = 'entry';
  state.studentId = '';
  state.topic = null;
  state.topicName = null;
  state.overviewTopics = null;
  state.level = null;
  state.levelKind = null;
  state.content = null;
  state.fragments = [];
  state.finalKey = null;
  state.review = null;
  state.dragOrder = null;
  state.lastFeedback = null;
  state.error = '';
  render();
}

async function returnToOverview() {
  state.screen = 'overview';
  state.topic = null;
  state.topicName = null;
  state.level = null;
  state.levelKind = null;
  state.content = null;
  state.finalKey = null;
  state.review = null;
  state.dragOrder = null;
  state.lastFeedback = null;
  render();
  await loadOverview();
}

function renderCompletedScreen() {
  const keyFrame = el('div', { class: 'key-frame' }, [
    el('div', { class: 'key-display', text: `🗝️ ${state.finalKey}` }),
  ]);
  keyFrame.style.backgroundImage = `url('${IMG_BASE}frames/key-card-frame.png')`;

  renderCard([
    el('img', { class: 'trophy-img', src: `${IMG_BASE}badges/trophy-cup.png`, alt: '獎盃' }),
    el('h1', { text: '🎉 恭喜通關！', style: 'text-align:center' }),
    el('p', { text: `${state.studentId} 完成了「${state.topicName}」密室逃脫任務！` }),
    el('p', { text: '請截圖此畫面，向現場主持人領取你的獎品！' }),
    keyFrame,
    renderFragments(),
    el('button', { class: 'btn-primary', text: '返回總覽', onClick: returnToOverview }),
  ]);

  renderReviewCard();
}

function renderReviewCard() {
  const review = state.review;
  if (!review) return;

  const children = [el('h1', { text: '🌟 真理大廳 AI協作小回顧' })];

  if (!review.hasEnoughEvidence) {
    children.push(
      el('p', { text: '太好囉，恭喜你成功過關！這次還沒有看到足夠的解謎互動紀錄，所以先不進行完整的自學回顧。' }),
      el('p', { text: '下次挑戰新的演算法密室時，如果遇到不會的概念、或看到沒學過的專有名詞，可以這樣問我：' }),
      el('p', { text: `「${review.suggestedQuestion}」`, style: 'font-weight:600' }),
    );
    renderCard(children);
    return;
  }

  children.push(el('h2', { text: '這次做得好的地方' }));
  (review.strengths || []).forEach((s) => {
    children.push(
      el('p', { text: `${s.criterion}：${s.badge}`, style: 'font-weight:600;margin-bottom:2px' }),
      el('p', { text: s.note, style: 'margin-top:0' }),
    );
  });

  children.push(el('h2', { text: '下次可以更進步的地方' }));
  children.push(
    el('p', { text: `${review.improvementCriterion}：${review.improvementBadge}`, style: 'font-weight:600;margin-bottom:2px' }),
    el('p', { text: review.improvementNote, style: 'margin-top:0' }),
  );

  children.push(el('h2', { text: '下次挑戰新密室，你可以這樣問我' }));
  children.push(el('p', { text: `「${review.suggestedQuestion}」`, style: 'font-weight:600' }));

  renderCard(children);
}

render();
