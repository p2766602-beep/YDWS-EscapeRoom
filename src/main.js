import { startTopic, submitAnswer } from './api.js';

// 垂直切片驗證用的主題清單（不是正式的13主題總覽選單，那是§8之後的MVP範圍）。
const TOPICS = [
  { code: 'max_value', name: '找最大值' },
  { code: 'selection_sort', name: '選擇排序' },
  { code: 'greedy', name: '貪婪演算法' },
];

const app = document.getElementById('app');

const state = {
  screen: 'identity', // identity | level | completed
  topic: TOPICS[0].code,
  topicName: TOPICS[0].name,
  studentId: '',
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
  if (state.screen === 'identity') return renderIdentityScreen();
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

function renderIdentityScreen() {
  const seatInput = el('input', { type: 'text', id: 'seat', placeholder: '例如：12' });
  const nameInput = el('input', { type: 'text', id: 'name', placeholder: '例如：王小明' });

  const topicSelect = el(
    'select',
    {
      onChange: (e) => {
        state.topic = e.target.value;
        state.topicName = TOPICS.find((t) => t.code === state.topic).name;
      },
    },
    TOPICS.map((t) => el('option', { value: t.code, text: t.name })),
  );
  topicSelect.value = state.topic;

  const submitBtn = el('button', {
    class: 'btn-primary',
    text: state.loading ? '召喚中……' : '踏入密室',
    onClick: async () => {
      const seat = seatInput.value.trim();
      const name = nameInput.value.trim();
      if (!seat || !name) {
        state.error = '座號和姓名都要填喔，勇者。';
        return render();
      }
      state.studentId = `${seat}號-${name}`;
      state.error = '';
      state.loading = true;
      render();
      try {
        const data = await startTopic({ studentId: state.studentId, topic: state.topic, topicName: state.topicName });
        applyStartResponse(data);
      } catch (err) {
        state.error = err.message;
      }
      state.loading = false;
      render();
    },
  });

  renderCard([
    el('h1', { text: '🔮 真理大廳：演算法密室逃脫' }),
    el('label', { text: '選擇密室主題（垂直切片驗證用，非正式選單）' }),
    topicSelect,
    el('label', { text: '座號' }),
    seatInput,
    el('label', { text: '姓名' }),
    nameInput,
    renderErrorBox(),
    submitBtn,
  ]);
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
    el('h1', { text: `${state.topicName} — Level ${state.level} / 5` }),
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

function resetToIdentityScreen() {
  state.screen = 'identity';
  state.studentId = '';
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

function renderCompletedScreen() {
  renderCard([
    el('h1', { text: '🎉 恭喜通關！' }),
    el('p', { text: `${state.studentId} 完成了「${state.topicName}」密室逃脫任務！` }),
    el('p', { text: '請截圖此畫面，向現場主持人領取你的獎品！' }),
    el('div', { class: 'key-display', text: `🗝️ ${state.finalKey}` }),
    renderFragments(),
    el('button', { class: 'btn-primary', text: '再挑戰新的密室', onClick: resetToIdentityScreen }),
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
