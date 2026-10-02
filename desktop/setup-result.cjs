const guide = require('./setup-guide.js');
function parseResult(text, expected = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4096) throw Error('設定結果ファイルを確認してください。');
  let data;
  try { data = JSON.parse(text); } catch { throw Error('ことばメモの設定結果ファイルを選んでください。'); }
  if (!data || data.version !== 1 || !guide.project(data.project || '') || !['prepare', 'finish'].includes(data.phase)) throw Error('設定結果の形式を確認してください。');
  const origin = guide.origin(data.origin || '');
  if (!origin || !new URL(origin).hostname.endsWith('.run.app')) throw Error('Google Cloud Runの設置先が含まれていません。');
  if (expected.project && data.project !== expected.project) throw Error('選択したプロジェクトと結果が違います。使うプロジェクトの結果を選んでください。');
  if (expected.origin && origin !== expected.origin) throw Error('準備した設置先と結果が違います。準備から確認してください。');
  return { version: 1, project: data.project, phase: data.phase, origin };
}
async function checkConnection(origin, request) {
  const response = await request(origin + '/api/config', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('設置先に接続できません。最後の設置が完了しているか確認してください。');
  const config = await response.json();
  if (config.configured !== true || config.origin !== origin || !/^[0-9]+-[A-Za-z0-9]+\.apps\.googleusercontent\.com$/.test(config.clientId || '')) throw Error('設置先とGoogleログインの設定が一致しません。');
  return { origin, configured: true };
}
module.exports = { parseResult, checkConnection };
