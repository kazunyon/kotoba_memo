const guide = window.KotobaGuide
const $ = id => document.getElementById(id)
const KEY = 'kotoba-setup-progress-v1'
let state = { version: 1, index: 0, project: '', origin: '', verified: [], completed: [] }
let busy = false
function status(text) { $('status').textContent = text }
function normalize(saved) {
  if (!saved || saved.version !== 1) return state
  const value = { version: 1, index: Math.min(guide.steps.length - 1, Math.max(0, Number.isInteger(saved.index) ? saved.index : 0)), project: guide.project(saved.project || '') ? saved.project : '', origin: guide.origin(saved.origin || ''), verified: Array.isArray(saved.verified) ? saved.verified.filter(id => ['prepare', 'finish'].includes(id)) : [], completed: Array.isArray(saved.completed) ? saved.completed.filter(id => guide.steps.some(step => step.id === id)) : [] }
  if (!value.project) value.index = 0
  else if (!value.origin && value.index > 3) value.index = 3
  return value
}
async function save() {
  try {
    if (window.kotobaSetup?.saveProgress) await window.kotobaSetup.saveProgress(state)
    else localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch { status('進み具合を保存できませんでした。閉じずに続けるか、図解マニュアルを印刷してください。'); return false }
}
function panel(name) { for (const id of ['welcome', 'wizard', 'existing-panel']) $(id).hidden = id !== name; status('') }
function element(tag, text, className) { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el }
async function copy(text) {
  try { if (window.kotobaSetup?.copy) await window.kotobaSetup.copy(text); else await navigator.clipboard.writeText(text); status('コピーしました。Googleの画面へ貼り付けてください。') }
  catch { status('コピーできませんでした。表示された文字を選択してコピーしてください。') }
}
function copied(text, name) {
  const box = element('div', '', 'copy-box'), pre = element('pre', text)
  const button = element('button', name); button.type = 'button'; button.disabled = !text; button.onclick = () => void copy(text)
  const details = element('details'), summary = element('summary', 'コピーする内容を見る')
  details.append(summary, pre); box.append(button, details); return box
}
async function openPage(url) {
  try { if (window.kotobaSetup?.openPage) await window.kotobaSetup.openPage(url); else window.open(url, '_blank', 'noopener'); status('ブラウザを開きました。操作が終わったら、この画面へ戻ってください。') }
  catch { status('ブラウザを開けませんでした。図解マニュアルのURLを使ってください。') }
}
function validStep() {
  const step = guide.steps[state.index]
  return Boolean(guide.received(step, state) && (!step.confirm || $('ack')?.checked) && (step.input !== 'project' || guide.project($('project').value.trim())) && (step.input !== 'origin' || guide.extractOrigin($('origin').value)))
}
function render() {
  panel('wizard')
  const step = guide.steps[state.index]
  $('step-number').textContent = `${state.index + 1} / ${guide.steps.length}`; $('progress').value = state.index + 1
  $('step-title').textContent = step.title; $('step-action').textContent = step.action
  $('diagram').innerHTML = window.KotobaDiagram.diagram(step.diagram)
  $('instructions').replaceChildren(...step.lines.map(line => element('li', line)))
  $('action-area').replaceChildren(); $('confirmation').replaceChildren()
  if (step.link || step.route) {
    const button = element('button', step.shell ? 'Cloud Shellを開く' : 'Googleの設定ページを開く', 'secondary'); button.type = 'button'; button.onclick = () => void openPage(guide.link(step, state)); $('action-area').append(button)
  }
  if (step.extraRoute) {
    const button = element('button', 'Googleのクライアント画面を開く', 'secondary'); button.type = 'button'; button.onclick = () => void openPage(guide.link({ route: step.extraRoute }, state)); $('action-area').append(button)
  }
  if (step.command) $('action-area').prepend(copied(guide.command(step.command, state), '命令をコピー'))
  if (step.snippet) $('action-area').append(copied(guide.snippet(step, state), step.snippetName || (step.snippet === 'callback' ? 'URLをコピー' : '権限の名前をコピー')))
  if (step.input === 'project' || step.input === 'origin') {
    const name = step.input, label = element('label', name === 'project' ? 'プロジェクトID' : 'アプリURL（結果全体の貼り付けもできます）')
    label.htmlFor = name
    const input = element(name === 'project' ? 'input' : 'textarea'); input.id = name; input.value = state[name]; input.placeholder = name === 'project' ? '例：my-kotoba-memo' : 'https://…run.app'; input.autocomplete = 'off'
    input.oninput = () => { $('next').disabled = !validStep() }
    $('action-area').append(label, input)
  }
  if (step.receive) {
    const received = guide.received(step, state)
    $('action-area').append(element('p', received ? '設定結果を受け取りました。設置先：' + state.origin : 'Cloudの設定結果を待っています。URLを入力する必要はありません。', 'note'))
    const button = element('button', '設定結果を受け取る', 'secondary'); button.type = 'button'; button.onclick = () => void importResult(button); $('action-area').append(button)
  }
  if (step.input === 'connect') {
    $('action-area').append(element('p', state.origin, 'address'))
    const button = element('button', '接続を確認して開始'); button.type = 'button'; button.onclick = () => void connect(state.origin, button); $('action-area').append(button)
  }
  if (step.confirm) {
    const label = element('label', '', 'check-row'), check = document.createElement('input'); check.type = 'checkbox'; check.id = 'ack'; check.checked = state.completed.includes(step.id); check.onchange = () => { $('next').disabled = !validStep() }; label.append(check, element('span', step.confirm)); $('confirmation').append(label)
  }
  $('back').textContent = state.index ? '戻る' : 'はじめの画面へ'; $('next').hidden = state.index === guide.steps.length - 1; $('next').disabled = !validStep()
  $('error-log').value = ''; $('diagnosis').textContent = ''; $('help').open = false
  $('recovery').hidden = true
  $('step-title').focus(); window.scrollTo(0, 0)
}
async function acceptResult(result) {
  if (state.project && result.project !== state.project) throw Error('選んだプロジェクトと結果が違います。');
  if (state.origin && state.origin !== result.origin) throw Error('準備した設置先と結果が違います。');
  state.project = result.project; state.origin = result.origin;
  state.verified = [...new Set([...(state.verified || []), 'prepare', ...(result.phase === 'finish' ? ['finish'] : [])])];
  state.completed = [...new Set([...state.completed, 'project', 'billing', 'prepare', 'address', ...(result.phase === 'finish' ? ['credentials', 'finish'] : [])])];
  state.index = guide.steps.findIndex(step => step.id === (result.phase === 'finish' ? 'connect' : 'branding'));
  await save(); render();
  if (result.phase === 'finish') await connect(state.origin, $('action-area').querySelector('button'));
  else status('準備結果から設置先を自動設定しました。次はGoogleのアプリ名・同意設定です。');
}
async function importResult(button) {
  if (busy) return;
  busy = true; button.disabled = true; status('設定結果を読み取り、プロジェクトと設置先を確認しています…');
  let result;
  try {
    if (!window.kotobaSetup?.importResult) throw Error('この操作はインストールしたPCアプリで行ってください。');
    result = await window.kotobaSetup.importResult({ project: state.project, origin: state.origin });
  } catch (error) { status(error.message); }
  finally { busy = false; button.disabled = false; }
  if (result) { try { await acceptResult(result); } catch (error) { status(error.message); } }
  else if (!$('status').textContent.includes('。')) status('ファイルを選びませんでした。もう一度受け取れます。');
}
async function connect(value, button) {
  const url = guide.origin(value)
  if (!url) { status('HTTPSのアプリURLを貼り付けてください。'); return }
  if (busy) return
  busy = true; button.disabled = true; status('設置先とGoogle認証の設定を確認しています…')
  try {
    if (!window.kotobaSetup?.connect) throw Error('この操作はインストールしたPCアプリで行ってください。')
    await window.kotobaSetup.connect(url)
  } catch (error) { status(`接続できませんでした。${error.message} Cloudの設置が完了したら、もう一度接続を確認してください。`) }
  finally { busy = false; button.disabled = false }
}
$('start').onclick = async () => {
  if (state.completed.length && !confirm('記録した進み具合を最初に戻します。Google Cloudの設定は削除しません。よろしいですか？')) return
  state = { version: 1, index: 0, project: '', origin: '', verified: [], completed: [] }; await save(); render()
}
$('resume').onclick = render
$('next').onclick = async () => {
  if (!validStep()) return
  const step = guide.steps[state.index]
  if (step.input === 'project') {
    const value = $('project').value.trim(); if (value !== state.project) { state.origin = ''; state.verified = []; state.completed = [] } state.project = value
  }
  if (step.input === 'origin') {
    const value = guide.extractOrigin($('origin').value); if (value !== state.origin) state.completed = state.completed.filter(id => ['project', 'billing', 'prepare'].includes(id)); state.origin = value
  }
  state.completed = [...new Set([...state.completed, step.id])]; state.index++; await save(); render()
}
$('back').onclick = async () => { if (!state.index) { panel('welcome'); $('resume').hidden = false; return } state.index--; await save(); render() }
$('pause').onclick = async () => { if (!await save()) return; panel('welcome'); $('resume').hidden = false; status('ここまでの進み具合を記録しました。あとで「続きから再開する」を押してください。') }
$('existing').onclick = () => { panel('existing-panel'); $('url').value = state.origin }
$('welcome-result').onclick = () => void importResult($('welcome-result'))
$('existing-back').onclick = () => panel('welcome')
$('connection-form').onsubmit = event => { event.preventDefault(); void connect($('url').value, $('connection-form').querySelector('button')) }
$('diagnose').onclick = () => {
  const result = guide.diagnose($('error-log').value); $('error-log').value = ''; $('diagnosis').textContent = `${result.title}。${result.detail}`
  $('recovery').hidden = !result.step
  $('recovery').onclick = async () => { state.verified = ['prepare', 'billing'].includes(result.step) ? [] : (state.verified || []).filter(phase => phase !== 'finish'); state.index = guide.steps.findIndex(step => step.id === result.step); await save(); render() }
}
$('manual').onclick = async () => {
  try {
    if (window.kotobaSetup?.manual) { await window.kotobaSetup.manual({ project: state.project, origin: state.origin }); return }
    window.open('setup-manual.html?' + new URLSearchParams({ project: state.project, origin: state.origin }), '_blank', 'noopener')
  } catch { status('マニュアルを開けませんでした。ヘルプメニューからもう一度お試しください。') }
}
;(async () => {
  try { state = normalize(window.kotobaSetup?.loadProgress ? await window.kotobaSetup.loadProgress() : JSON.parse(localStorage.getItem(KEY) || 'null')) }
  catch { status('進み具合を読み込めませんでした。最初から、または設置済みURLから進められます。') }
  const pending = await window.kotobaSetup?.pendingResult?.(); if (pending) { await acceptResult(pending); return }
  $('resume').hidden = !state.project && !state.completed.length
})()
