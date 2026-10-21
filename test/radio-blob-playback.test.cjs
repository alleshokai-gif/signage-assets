const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('    async function playStoredMp3Base64(');
const end=html.indexOf('    async function ttsTest()',start);
assert(start>=0&&end>start);
const source=html.slice(start,end);

function host(fail=false){
  const urls=[],revoked=[],events=[];
  class Audio {
    constructor(){this.src='';this.error=null;}
    play(){
      queueMicrotask(()=>{
        this.onloadeddata?.();
        if(fail){this.error={code:3};this.onerror?.();}
        else{this.onplay?.();this.onended?.();}
      });
      return Promise.resolve();
    }
    pause(){}
    removeAttribute(name){if(name==='src')this.src='';}
    load(){}
  }
  const context=vm.createContext({Audio,Blob,Uint8Array,atob,URL:{
    createObjectURL(blob){assert.equal(blob.type,'audio/mpeg');urls.push(blob);return 'blob:synthetic';},
    revokeObjectURL(url){revoked.push(url);}
  }});
  vm.runInContext(source,context);
  return {play:value=>context.playStoredMp3Base64(value,(event,category)=>events.push([event,category])),urls,revoked,events};
}

test('stored MP3 uses a Blob URL and releases it after sequential playback',async()=>{
  const h=host();
  assert.equal(await h.play(Buffer.alloc(80,42).toString('base64')),'ended');
  assert.equal(h.urls.length,1);
  assert.deepEqual(h.revoked,['blob:synthetic']);
  assert.deepEqual(h.events.map(x=>x[0]),['decode-ready','play-start','ended']);
});

test('decode and malformed payload failures remain distinct and release resources',async()=>{
  const h=host(true);
  assert.equal(await h.play(Buffer.alloc(80,42).toString('base64')),'decode-error');
  assert(h.events.some(x=>x[0]==='decode-error'&&x[1]==='decode'));
  assert.deepEqual(h.revoked,['blob:synthetic']);
  assert.equal(await h.play('invalid!'),'format-error');
  assert(h.events.some(x=>x[0]==='format-error'&&x[1]==='format'));
  assert.equal(h.urls.length,1);
});
