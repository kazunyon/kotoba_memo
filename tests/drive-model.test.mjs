import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/drive-model.ts',import.meta.url),'utf8')
const {outputText} = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}})
const {foldEvents,validateEvent} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const row=(id,title,deleted=false)=>({id,title,deleted,section:'daily',display_number:1,sort_order:1,category_number:1,title_color:'black',meaning:'説明',steps:[],marked:'',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'})
const event=(id,time,rows,categories=null)=>({id,createdTime:time,event:{format:'kotoba-drive-event',version:1,mutationId:id,rows,categories}})
test('different memos survive simultaneous uploads and input order does not change result',()=>{
 const events=[event('b','2026-01-02T00:00:00Z',[row('two','別項目')]),event('a','2026-01-02T00:00:00Z',[row('one','項目')])]
 assert.deepEqual(foldEvents(events),foldEvents([...events].reverse()))
 assert.equal(foldEvents(events).rows.length,2)
})
test('later updates win, deletion tombstones remain and server timestamps replace client timestamps',()=>{
 const state=foldEvents([event('a','2026-01-02T00:00:00Z',[row('one','旧')]),event('b','2026-01-03T00:00:00Z',[row('one','新',true)])])
 assert.equal(state.rows[0].title,'新');assert.equal(state.rows[0].deleted,true)
 assert.equal(state.versions.one,'2026-01-03T00:00:00Z')
})
test('category deletion synchronizes as an empty list and advances revision',()=>{
 const state=foldEvents([event('a','2026-01-02T00:00:00Z',[],[{number:1,name:'生活'}]),event('b','2026-01-03T00:00:00Z',[],[])])
 assert.deepEqual(state.categories,[]);assert.equal(state.categoryRevision,2)
})
test('malformed Drive data fails closed',()=>{
 assert.throws(()=>validateEvent({format:'wrong'}))
 const bad=event('a','2026-01-02T00:00:00Z',[{...row('one','項目'),steps:[{id:'x',description:'操作',imageDataUrl:'javascript:alert(1)'}]}])
 assert.throws(()=>validateEvent(bad.event))
})
