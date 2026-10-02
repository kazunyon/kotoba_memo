import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const mock = `#!/usr/bin/env node
const fs=require('node:fs');const path=require('node:path');const args=process.argv.slice(2);const folder=process.env.KOTOBA_TEST_DIR;
fs.appendFileSync(path.join(folder,'calls'),JSON.stringify(args)+'\\n');
const key=(()=>{const flag=args.find(x=>x.startsWith('--secret='));return flag?flag.slice(9):args[2]})();
if(args[0]==='services') {if(process.env.KOTOBA_TEST_QUOTA==='1'&&!fs.existsSync(path.join(folder,'retried'))){fs.writeFileSync(path.join(folder,'retried'),'yes');console.error('429 RATE_LIMIT_EXCEEDED');process.exit(1)}process.exit(0)}
if(args[0]==='iam')process.exit(0);
if(args[0]==='projects')process.exit(0);
if(args[0]==='run'&&args[1]==='services'&&args[2]==='describe') {if(process.env.KOTOBA_TEST_DENIED==='1'){console.error('PERMISSION_DENIED');process.exit(1)}if(process.env.KOTOBA_TEST_NEW==='1'&&!fs.existsSync(path.join(folder,'service'))){console.error('NOT_FOUND');process.exit(1)}console.log('https://my-kotoba.example');process.exit(0)}
if(args[0]==='run'&&args[1]==='deploy'){fs.writeFileSync(path.join(folder,'service'),'yes');console.log('Done');process.exit(0)}
if(args[0]==='run')process.exit(0);
if(args[0]==='secrets'&&args[1]==='versions'&&args[2]==='describe'){const name=args.find(x=>x.startsWith('--secret=')).slice(9);if(fs.existsSync(path.join(folder,name))){console.log('ENABLED');process.exit(0)}console.error('NOT_FOUND');process.exit(1)}
if(args[0]==='secrets'&&args[1]==='describe'){if(fs.existsSync(path.join(folder,args[2]))){process.exit(0)}console.error('NOT_FOUND');process.exit(1)}
if(args[0]==='secrets'&&(args[1]==='create'||args[1]==='versions'&&args[2]==='add')){const name=args[1]==='create'?args[2]:args[3];const input=fs.readFileSync(0);if(!input.length){console.error('empty secret');process.exit(1)}fs.writeFileSync(path.join(folder,name),input);process.exit(0)}
if(args[0]==='secrets'&&args[1]==='add-iam-policy-binding')process.exit(0);
console.error('Unexpected mock command');process.exit(2);
`
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kotoba-cloud-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'gcloud'), mock); await chmod(join(dir, 'gcloud'), 0o755)
  await writeFile(join(dir, 'sleep'), '#!/usr/bin/env bash\nexit 0\n'); await chmod(join(dir, 'sleep'), 0o755)
  const env = { ...process.env, PATH: dir + ':' + process.env.PATH, KOTOBA_TEST_DIR: dir }
  return { dir, env, run: (script, args, extra = {}) => spawnSync('bash', [join(root, 'deployment', script), ...args], { env: { ...env, ...extra }, encoding: 'utf8' }) }
}
test('credentials are read off command history, missing versions are saved and reruns preserve the session key', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t)
  const id = '1234567890-ownclient.apps.googleusercontent.com', secret = 'GOCSPX-fake-secret-for-automated-test'
  const first = spawnSync('bash', [join(root, 'deployment/setup.sh'), 'credentials', 'my-project'], { env: f.env, input: id + '\n' + secret + '\n', encoding: 'utf8' })
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /認証設定を保存しました/)
  assert.equal((first.stdout + first.stderr).includes(secret), false)
  assert.equal((await readFile(join(f.dir, 'calls'), 'utf8')).includes(secret), false)
  assert.equal(await readFile(join(f.dir, 'kotoba-memo-client-secret'), 'utf8'), secret)
  const sessionKey = await readFile(join(f.dir, 'kotoba-memo-session-key'), 'utf8')
  assert.equal(Buffer.from(sessionKey, 'base64').length, 32)
  const again = f.run('setup.sh', ['credentials', 'my-project'])
  assert.equal(again.status, 0, again.stderr)
  assert.equal(await readFile(join(f.dir, 'kotoba-memo-session-key'), 'utf8'), sessionKey)
})
test('prepare retries quotas and explicitly sets the dedicated build identity', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t)
  const result = f.run('deploy.sh', ['my-project', 'asia-northeast1', 'kotoba-memo', 'prepare'], { KOTOBA_TEST_NEW: '1', KOTOBA_TEST_QUOTA: '1' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /再試行/); assert.match(result.stdout, /準備できました/)
  const calls = await readFile(join(f.dir, 'calls'), 'utf8')
  assert.match(calls, /roles\/run.builder/)
  assert.match(calls, /--build-service-account=projects\/my-project\/serviceAccounts\/kotoba-memo-build@my-project.iam.gserviceaccount.com/)
  assert.equal(calls.includes('allUsers'), false)
})
test('finish requires every enabled secret and access-denied is not mistaken for a new service', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t)
  let result = f.run('deploy.sh', ['my-project', 'asia-northeast1', 'kotoba-memo', 'finish'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /認証設定を確認/)
  for (const suffix of ['client-id', 'client-secret', 'session-key']) await writeFile(join(f.dir, 'kotoba-memo-' + suffix), 'fixture')
  result = f.run('deploy.sh', ['my-project', 'asia-northeast1', 'kotoba-memo', 'finish'])
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /設置できました/)
  const denied = f.run('deploy.sh', ['my-project', 'asia-northeast1', 'kotoba-memo', 'prepare'], { KOTOBA_TEST_DENIED: '1' })
  assert.notEqual(denied.status, 0)
  assert.match(denied.stderr, /PERMISSION_DENIED/)
})
