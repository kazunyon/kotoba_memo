document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault()
  const button = document.querySelector('button'), status = document.querySelector('#status')
  button.disabled = true; status.textContent = '接続先を確認しています…'
  try { await window.kotobaSetup.connect(document.querySelector('#url').value) }
  catch (error) { status.textContent = error.message; button.disabled = false }
})
