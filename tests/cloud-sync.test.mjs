import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const compile=async file=>ts.transpileModule(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64')
const model=url(await compile('drive-model.ts'))
function fakeDB(){const values=new Map();return {open(){const req={};queueMicrotask(()=>{req.result={transaction(){const tx={objectStore(){return {get(key){const r={};queueMicrotask(()=>{r.result=structuredClone(values.get(key));r.onsuccess()});return r},put(v,k){values.set(k,structuredClone(v));queueMicrotask(()=>tx.oncomplete())},delete(k){values.delete(k);queueMicrotask(()=>tx.oncomplete())}}}};return tx}};req.onsuccess()});return req}}}
const row=(id,title,deleted=false)=>({id,title,deleted,section:'daily',display_number:1,sort_order:1,category_number:1,title_color:'black',meaning:'説明',steps:[],marked:'',created_at:'2026-01-01T00:00:00Z',updated_at:new Date().toISOString()})
test('two devices preserve offline changes, resolve conflicts, retry lost responses and isolate accounts',async()=>{
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});globalThis.window=new EventTarget();globalThis.__devices={};const remote=new Map();let serial=0,lose=false
 globalThis.fetch=async(input,init)=>{
  const u=new URL(input.replace('/api/drive', ''), 'https://www.googleapis.com'),account=init.headers['X-Kotoba-Account']
  if(u.pathname.endsWith('/generateIds'))return Response.json({ids:['id-'+(++serial)]})
  if(u.pathname==='/drive/v3/files')return Response.json({files:[...remote.values()].filter(f=>f.account===account).map(({id,name,createdTime})=>({id,name,createdTime}))})
  if(u.pathname==='/upload/drive/v3/files'){
   const parts=init.body.split('\r\n').filter(p=>p.startsWith('{')),meta=JSON.parse(parts[0]),event=JSON.parse(parts[1])
   if(remote.has(meta.id))return new Response('{}',{status:409})
   remote.set(meta.id,{...meta,event,account,createdTime:new Date(Date.UTC(2026,0,1,0,0,++serial)).toISOString()})
   if(lose){lose=false;throw Error('simulated lost response')};return Response.json({id:meta.id})
  }
  const f=remote.get(u.pathname.split('/').pop());return Response.json(f?.event||{},{status:f?.account===account?200:404})
 }
 async function device(name){
  const state={account:{id:'A',email:'a@example.test'},access:true,db:fakeDB()};globalThis.__devices[name]=state
  const auth=url(`const s=globalThis.__devices[${JSON.stringify(name)}];export const getAccount=()=>s.account;export const hasGoogleAccess=()=>s.access;export const getProfileNamespace=()=> 'test';export const expireGoogleSession=()=>{s.access=false};export const authHeaders=id=>{if(!s.access||s.account?.id!==id)throw Error('reconnect');return {'X-Kotoba-Account':id,'X-Kotoba-CSRF':'test'};};`)
  const drive=url((await compile('google-drive.ts')).replace("'./google-auth'",JSON.stringify(auth)).replace("'./drive-model'",JSON.stringify(model)))
  const source=(await compile('cloud-sync.ts')).replace("'./google-auth'",JSON.stringify(auth)).replace("'./google-drive'",JSON.stringify(drive)).replace("'./drive-model'",JSON.stringify(model)).replace(/import.meta.env.VITE_GOOGLE_CLIENT_ID/g,"'test'")
  const api=await import(url(source+'\n// '+name));return {state,api,async call(method,...args){globalThis.indexedDB=state.db;return api[method](...args)}}
 }
 const a=await device('pc'),b=await device('phone')
 await a.call('queueCloudCategories',[{number:1,name:'生活'}]);await a.call('queueCloudMemos',[row('memo','PC作成')],{memo:null})
 let phone=await b.call('loadCloudData');assert.equal(phone.rows[0].title,'PC作成');assert.equal(phone.categories[0].name,'生活')
 navigator.onLine=false;await b.call('queueCloudMemos',[row('memo','オフライン')],{memo:phone.rows[0].updated_at});assert.equal(b.api.getCloudSyncStatus().pending,1)
 assert.equal((await b.call('loadCloudData')).rows[0].title,'オフライン');navigator.onLine=true;await b.call('loadCloudData');assert.equal((await a.call('loadCloudData')).rows[0].title,'オフライン')
 const av=(await a.call('loadCloudData')).rows[0].updated_at,bv=(await b.call('loadCloudData')).rows[0].updated_at
 await a.call('queueCloudMemos',[row('memo','PC変更')],{memo:av});await b.call('queueCloudMemos',[row('memo','スマホ変更')],{memo:bv});assert.equal(b.api.getCloudSyncStatus().conflict,true)
 await b.call('resolveCloudConflict','local');assert.equal((await a.call('loadCloudData')).rows[0].title,'スマホ変更')
 const latest=(await a.call('loadCloudData')).rows[0].updated_at;lose=true;await a.call('queueCloudMemos',[row('memo','応答喪失')],{memo:latest});assert.equal(a.api.getCloudSyncStatus().pending,1);const count=remote.size
 navigator.onLine=false;await a.call('queueCloudMemos',[row('memo','追加編集')]);navigator.onLine=true;await a.call('loadCloudData');assert.equal(remote.size,count+1);assert.equal(a.api.getCloudSyncStatus().pending,0)
 phone=await b.call('loadCloudData');assert.equal(phone.rows[0].title,'追加編集');await b.call('queueCloudMemos',[row('memo','削除',true)],{memo:phone.rows[0].updated_at});assert.equal((await a.call('loadCloudData')).rows[0].deleted,true)
 a.state.access=false;await a.call('queueCloudMemos',[row('unsent','未送信')],{unsent:null});assert.equal(a.api.getCloudSyncStatus().pending,1)
 a.state.account={id:'B',email:'b@example.test'};a.state.access=true;assert.equal((await a.call('loadCloudData')).rows.length,0)
 await a.call('queueCloudMemos',[row('other','別の人')],{other:null});assert.equal((await b.call('loadCloudData')).rows.some(r=>r.id==='other'),false)
 a.state.account={id:'A',email:'a@example.test'};assert.equal((await a.call('loadCloudData')).rows.some(r=>r.id==='unsent'),true)
 await a.call('clearCloudCache','A');navigator.onLine=false;assert.equal((await a.call('loadCloudData')).rows.length,0);navigator.onLine=true
})
