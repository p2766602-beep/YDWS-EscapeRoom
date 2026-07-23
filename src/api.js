// 本機開發指向wrangler dev本機Worker，之後要正式串接時換成部署後的*.workers.dev網址。
export const WORKER_URL = 'http://127.0.0.1:8787';

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

export function startTopic({ studentId, topic, topicName }) {
  return postJSON('/level/start', { studentId, topic, topicName });
}

export function submitAnswer({ studentId, topic, level, mode, answer }) {
  return postJSON('/level/answer', { studentId, topic, level, mode, answer });
}
