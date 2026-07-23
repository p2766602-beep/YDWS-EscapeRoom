// 本機開發（vite dev）指向wrangler dev本機Worker；build出來的正式版本指向已部署的Worker。
export const WORKER_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:8787'
  : 'https://ydws-escaperoom-engine.tnjboxing.workers.dev';

async function postJSON(path, body) {
  const resp = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `伺服器錯誤（${resp.status}）`);
  }
  return data;
}

export function startTopic({ studentId, topic, topicName, difficulty }) {
  return postJSON('/level/start', { studentId, topic, topicName, difficulty });
}

export function submitAnswer({ studentId, topic, level, mode, answer, difficulty }) {
  return postJSON('/level/answer', { studentId, topic, level, mode, answer, difficulty });
}

export function getOverview({ studentId, difficulty }) {
  return postJSON('/overview', { studentId, difficulty });
}
