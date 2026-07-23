import {
  LEVEL_DEFS,
  DIFFICULTY_LEVELS,
  buildGenerationRequest,
  buildTextJudgeRequest,
  buildEncourageRequest,
  buildLiteracyReviewRequest,
  publicContent,
} from './prompts.js';

function normalizeDifficulty(value) {
  const key = String(value || '').trim();
  return DIFFICULTY_LEVELS[key] ? key : 'basic';
}

const GEMINI_MODEL = 'gemini-flash-lite-latest';
const TOTAL_LEVELS = 5;

// 13主題官方清單（BlocklyYdws docs/密室逃脫獨立專案-架構規格.md §1/§8定案），供總覽API
// 依序查詢每個主題的KV進度。前3個沿用垂直切片驗證期間就使用的代碼，避免破壞已測過的資料。
const TOPIC_CODES = [
  'max_value', 'find_min', 'linear_search',
  'bubble_sort', 'selection_sort', 'insertion_sort',
  'binary_search',
  'recursion_basics', 'merge_sort',
  'greedy', 'dfs', 'bfs',
  'dp',
];

// 三位數質數清單，過關金鑰從這裡隨機挑，不讓AI自己編（避免編出非質數或重複配發）。
const THREE_DIGIT_PRIMES = [
  101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197,
  199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313,
  317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439,
  443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571,
  577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691,
  701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829,
  839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977,
  983, 991, 997,
];

function corsHeaders(origin, allowedOrigins) {
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function parseAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function callGeminiJSON(env, { systemInstruction, userPrompt, schema, temperature = 0.9 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini API 錯誤 ${resp.status}: ${errText.slice(0, 500)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini API 回應沒有內容');
  return JSON.parse(text);
}

// 難度是topic之外另一個決定進度身分的維度：同一個學生同一個主題換難度玩，要當成不同場次，
// 不能沿用另一個難度留下的進度。
function progressKey(topic, difficulty, studentId) {
  return `progress:${topic}:${difficulty}:${studentId}`;
}

async function loadProgress(kv, topic, difficulty, studentId) {
  const raw = await kv.get(progressKey(topic, difficulty, studentId));
  return raw ? JSON.parse(raw) : null;
}

async function saveProgress(kv, topic, difficulty, studentId, progress) {
  // 90天過期，跟ai-companion的KV慣例一致，不會無限累積
  await kv.put(progressKey(topic, difficulty, studentId), JSON.stringify(progress), { expirationTtl: 90 * 24 * 3600 });
}

function pickRandomPrime() {
  return THREE_DIGIT_PRIMES[Math.floor(Math.random() * THREE_DIGIT_PRIMES.length)];
}

// 防線二：就算prompt要求AI不要自己標序號，實測發現AI偶爾還是會手滑寫「第一步：」「首先，」
// 這類會洩漏正確順序的開頭字樣（一旦寫進steps文字裡，不管畫面怎麼打亂呈現順序，玩家直接照
// 序數詞排列就能過關，等於沒有打亂）。這裡用code把常見洩題字樣從每個步驟開頭剝掉，不完全
//依賴AI照做指示——跟Level4的correctOrder不假手AI做index運算是同一個防禦原則。
function stripOrdinalLeakage(text) {
  return String(text || '')
    .replace(/^\s*(第[一二三四五六七八九十0-9]+步|step\s*\d+|[①②③④⑤⑥⑦⑧⑨⑩]|首先|接著|然後|再來|最後|最終)[：:，,、]?\s*/i, '')
    .trim();
}

function shuffleWithMapping(items) {
  // Fisher-Yates洗牌，同時記錄「原始順序的第m個步驟，被放到打亂後的第幾個位置」，
  // 讓正確順序的比對完全交給程式碼算，不依賴AI自己輸出的index。
  const order = items.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const steps = order.map((originalIdx) => items[originalIdx]);
  const correctOrder = new Array(items.length);
  order.forEach((originalIdx, position) => {
    correctOrder[originalIdx] = position;
  });
  return { steps, correctOrder };
}

async function generateLevelContent(env, level, topicName, coreSentence, topicCode, difficulty) {
  const req = buildGenerationRequest(level, topicName, coreSentence, topicCode, difficulty);
  const content = await callGeminiJSON(env, req);
  if (level === 4) {
    content.orderedSteps = content.orderedSteps.map(stripOrdinalLeakage);
    const { steps, correctOrder } = shuffleWithMapping(content.orderedSteps);
    content.steps = steps;
    content.correctOrder = correctOrder;
  }
  return content;
}

// 記錄嘗試紀錄時，只保留文字類回答的原始內容（規準二「人類能動性」要看玩家打字時有沒有
// 主動追問/表達思考過程，按鈕/拖曳的選擇本身不需要留文字，pass/mode已經夠用）。
function summarizeAnswerText(mode, answer) {
  if (mode !== 'text') return null;
  const text = String(answer || '').trim();
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

// 玩家在按鈕/拖曳題型選擇打字回答時，用來組出「這一關認定的正解」文字，讓文字判斷通道在
// 任何題型都能運作，不只是Level1/3那種本來就有targetKeyword的開放式題型。
function buildReferenceAnswer(levelKind, storedContent) {
  if (levelKind === 'text') return storedContent.targetKeyword;
  if (levelKind === 'button') return storedContent.options[storedContent.correctIndex];
  if (levelKind === 'drag') return storedContent.orderedSteps.join('→');
  return '';
}

function buildJudgeContextText(levelKind, storedContent) {
  if (levelKind === 'button') return storedContent.scenario || storedContent.crisisScenario || '';
  if (levelKind === 'text') {
    if (storedContent.story) return storedContent.story;
    if (Array.isArray(storedContent.scenarios)) return storedContent.scenarios.join(' ');
  }
  return '';
}

// 從過關內容裡取一段文字當作「收集到的碎片」顯示給玩家，純粹是遊戲儀式感，不做嚴謹用途。
function extractFragment(level, storedContent, answer) {
  switch (level) {
    case 1:
      return storedContent.targetKeyword;
    case 2:
      return storedContent.options[storedContent.correctIndex];
    case 3:
      return storedContent.targetKeyword;
    case 4:
      return storedContent.orderedSteps.join('→');
    case 5:
      return storedContent.options[storedContent.correctIndex];
    default:
      return '';
  }
}

async function handleStart(request, env, headers) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: '請求格式錯誤' }, 400, headers);

  const studentId = String(body.studentId || '').trim().slice(0, 100);
  const topic = String(body.topic || '').trim();
  const topicName = String(body.topicName || topic).trim();
  const difficulty = normalizeDifficulty(body.difficulty);

  if (!studentId || !topic) {
    return jsonResponse({ error: '缺少必要欄位（studentId / topic）' }, 400, headers);
  }

  const kv = env.ESCAPE_ROOM_KV;
  let progress = await loadProgress(kv, topic, difficulty, studentId);

  if (progress) {
    if (progress.status === 'completed') {
      return jsonResponse(
        { status: 'completed', fragments: progress.fragments, finalKey: progress.finalKey, review: progress.review },
        200,
        headers,
      );
    }
    return jsonResponse(
      {
        status: 'in_progress',
        level: progress.level,
        levelKind: LEVEL_DEFS[progress.level].kind,
        content: publicContent(progress.level, progress.currentContent),
        fragments: progress.fragments,
      },
      200,
      headers,
    );
  }

  let content;
  try {
    content = await generateLevelContent(env, 1, topicName, null, topic, difficulty);
  } catch (err) {
    return jsonResponse({ error: 'AI 出題暫時失敗，請稍後再試。' }, 502, headers);
  }

  progress = {
    topic,
    topicName,
    difficulty,
    level: 1,
    status: 'in_progress',
    coreSentence: content.coreSentence,
    currentContent: content,
    fragments: [],
    finalKey: null,
    attemptLog: [],
    review: null,
  };
  await saveProgress(kv, topic, difficulty, studentId, progress);

  return jsonResponse(
    {
      status: 'in_progress',
      level: 1,
      levelKind: LEVEL_DEFS[1].kind,
      content: publicContent(1, content),
      fragments: [],
    },
    200,
    headers,
  );
}

async function handleAnswer(request, env, headers) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: '請求格式錯誤' }, 400, headers);

  const studentId = String(body.studentId || '').trim().slice(0, 100);
  const topic = String(body.topic || '').trim();
  const level = parseInt(body.level, 10);
  const mode = String(body.mode || '').trim();
  const answer = body.answer;
  const difficulty = normalizeDifficulty(body.difficulty);

  if (!studentId || !topic || !level || !mode) {
    return jsonResponse({ error: '缺少必要欄位（studentId / topic / level / mode）' }, 400, headers);
  }

  const kv = env.ESCAPE_ROOM_KV;
  const progress = await loadProgress(kv, topic, difficulty, studentId);

  if (!progress || progress.status === 'completed' || progress.level !== level) {
    return jsonResponse({ error: '關卡狀態不同步，請重新整理頁面。' }, 409, headers);
  }

  const storedContent = progress.currentContent;
  const levelKind = LEVEL_DEFS[level].kind;

  let pass = false;
  let feedback = '';

  if (mode === 'text') {
    const answerText = String(answer || '').trim();
    if (!answerText) {
      return jsonResponse(
        { pass: false, feedback: '勇者，沉默與虛無無法解開真理的封印，請輸入你明確的答案。' },
        200,
        headers,
      );
    }
    try {
      // 連續答錯時要讓引導逐漸更直白，避免學生卡在同一種模糊程度太久而挫折。
      const priorFailedAttempts = progress.attemptLog.filter((a) => a.level === level && !a.pass).length;
      const judgeReq = buildTextJudgeRequest({
        topicName: progress.topicName,
        level,
        contextText: buildJudgeContextText(levelKind, storedContent),
        question: storedContent.question,
        referenceAnswer: buildReferenceAnswer(levelKind, storedContent),
        referenceHints: levelKind === 'text' ? storedContent.targetHints : [],
        studentAnswer: answerText,
        attemptNumber: priorFailedAttempts + 1,
      });
      const result = await callGeminiJSON(env, judgeReq);
      pass = Boolean(result.pass);
      feedback = result.feedback;
    } catch (err) {
      return jsonResponse({ error: 'AI 判斷暫時失敗，請稍後再試。' }, 502, headers);
    }
  } else if (mode === 'button') {
    if (levelKind !== 'button') return jsonResponse({ error: '這一關不是按鈕題型' }, 400, headers);
    pass = Number(answer) === storedContent.correctIndex;
    feedback = pass ? null : storedContent.hint;
  } else if (mode === 'drag') {
    if (levelKind !== 'drag') return jsonResponse({ error: '這一關不是拖曳題型' }, 400, headers);
    const submitted = Array.isArray(answer) ? answer.map(Number) : [];
    pass = JSON.stringify(submitted) === JSON.stringify(storedContent.correctOrder);
    feedback = pass ? null : storedContent.hint;
  } else {
    return jsonResponse({ error: '不支援的answer mode' }, 400, headers);
  }

  progress.attemptLog.push({ level, mode, pass, answerText: summarizeAnswerText(mode, answer) });

  if (!pass) {
    await saveProgress(kv, topic, difficulty, studentId, progress);
    return jsonResponse({ pass: false, feedback }, 200, headers);
  }

  if ((mode === 'button' || mode === 'drag') && !feedback) {
    try {
      const encourageReq = buildEncourageRequest({ topicName: progress.topicName, level });
      const result = await callGeminiJSON(env, encourageReq);
      feedback = result.feedback;
    } catch (err) {
      feedback = '太棒了，你答對了！';
    }
  }

  const fragment = extractFragment(level, storedContent, answer);
  progress.fragments.push(fragment);

  if (level >= TOTAL_LEVELS) {
    progress.status = 'completed';
    progress.finalKey = pickRandomPrime();
    progress.currentContent = null;

    try {
      const reviewReq = buildLiteracyReviewRequest({ topicName: progress.topicName, attemptLog: progress.attemptLog });
      progress.review = await callGeminiJSON(env, reviewReq);
    } catch (err) {
      progress.review = null; // 回顧生成失敗不擋過關，金鑰跟碎片才是遊戲儀式感的核心產出
    }

    await saveProgress(kv, topic, difficulty, studentId, progress);
    return jsonResponse(
      {
        pass: true,
        feedback,
        fragment,
        completed: true,
        finalKey: progress.finalKey,
        fragments: progress.fragments,
        review: progress.review,
      },
      200,
      headers,
    );
  }

  const nextLevel = level + 1;
  let nextContent;
  try {
    nextContent = await generateLevelContent(env, nextLevel, progress.topicName, progress.coreSentence, topic, difficulty);
  } catch (err) {
    return jsonResponse({ error: 'AI 出下一關暫時失敗，請稍後再試。' }, 502, headers);
  }

  progress.level = nextLevel;
  progress.currentContent = nextContent;
  await saveProgress(kv, topic, difficulty, studentId, progress);

  return jsonResponse(
    {
      pass: true,
      feedback,
      fragment,
      completed: false,
      nextLevel,
      levelKind: LEVEL_DEFS[nextLevel].kind,
      content: publicContent(nextLevel, nextContent),
      fragments: progress.fragments,
    },
    200,
    headers,
  );
}

// 總覽畫面用：一次查13主題在「基礎版／進階版」兩個難度下各自的進度狀態。
// 節點的光暈顏色要能區分「過了基礎版」跟「過了進階版」，這是跨難度的成就徽章，
// 不是只看目前這次選定的難度，所以兩個難度都要查（13主題×2難度＝26次KV get，仍然
// 遠比list(prefix)簡單且沒有最終一致性風險）。目前這次選定的難度用來判斷「進行中/
// 建議下一步」，由前端自己從回傳的basic/advanced狀態裡挑對應的那一個來看。
async function handleOverview(request, env, headers) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: '請求格式錯誤' }, 400, headers);

  const studentId = String(body.studentId || '').trim().slice(0, 100);
  if (!studentId) return jsonResponse({ error: '缺少必要欄位（studentId）' }, 400, headers);

  const kv = env.ESCAPE_ROOM_KV;
  const statusFor = (progress) => {
    if (!progress) return 'not_started';
    return progress.status === 'completed' ? 'completed' : 'in_progress';
  };

  const topics = await Promise.all(
    TOPIC_CODES.map(async (topic) => {
      const [basicProgress, advancedProgress] = await Promise.all([
        loadProgress(kv, topic, 'basic', studentId),
        loadProgress(kv, topic, 'advanced', studentId),
      ]);
      return { topic, basic: statusFor(basicProgress), advanced: statusFor(advancedProgress) };
    }),
  );

  return jsonResponse({ topics }, 200, headers);
}

export default {
  async fetch(request, env) {
    const allowedOrigins = parseAllowedOrigins(env);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405, headers);
    }

    if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      return jsonResponse({ error: '不允許的來源' }, 403, headers);
    }

    const url = new URL(request.url);
    if (url.pathname === '/level/start') return handleStart(request, env, headers);
    if (url.pathname === '/level/answer') return handleAnswer(request, env, headers);
    if (url.pathname === '/overview') return handleOverview(request, env, headers);

    return jsonResponse({ error: 'Not Found' }, 404, headers);
  },
};
