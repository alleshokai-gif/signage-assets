const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

for(const relative of ['../index.html','../wi59-canary/index.html']) {
  test(relative+' validates and plays saved MP3 in WAV order',async()=>{
    const html=fs.readFileSync(path.join(__dirname,relative),'utf8');
    const from=(a,b)=>{
      const start=html.indexOf(a),end=html.indexOf(b,start+1);
      assert(start>=0 && end>start,a);
      return html.slice(start,end);
    };
    const played=[],events=[];let requested=0;
    const context=vm.createContext({
      GAS_API_URL:'https://synthetic.invalid/exec',VOICE_BASE:'voice/',CLOCK_VOICE_BASE:'clock/',
      SignageBoundary:{request:async(_url,p)=>{requested++;return {ok:true,audio:p.index===1?'valid':'invalid'};}},
      playWav:async key=>{assert.equal(requested,1);played.push(key);return 'ended';},
      playTtsBase64:async value=>{played.push(value);return value==='valid'?'ended':'error';},
      playStoredMp3Base64:async value=>{played.push(value);return value==='valid';},
      playRadioUnavailableCue_:async()=>{played.push('cue');return true;},
      wait:async()=>{},radioDiagNow_:()=>0,radioDiagElapsed_:()=>1,
      radioDiagEvent_:(_context,event)=>events.push(event.event),
      radioDiagErrorClass_:()=> 'request',console:{warn(){}},
    });
    vm.runInContext(from('function isRadioQueueItem_(item){','function radioQueueOutcome_'),context);
    const queue=[{type:'wav',key:'INTRO_WEATHER_TODAY'},
      {type:'mp3',reason:'clock_0720',queueId:'queue-1',index:1},
      {type:'missing_audio'},
      {type:'wav',key:'CLOSE_MORNING'}];
    assert(queue.every(context.isRadioQueueItem_));
    vm.runInContext(from('async function playRadioQueue(items','    /**'),context);
    const result=await context.playRadioQueue(queue,{events:[]});
    assert.deepEqual(played,['INTRO_WEATHER_TODAY','valid','cue','CLOSE_MORNING']);
    if(relative==='../index.html') {
      assert.equal(result.ttsComplete,1);
      assert.equal(result.ttsFailed,1);
      assert(events.includes('audio-request-success'));
      assert(events.includes('audio-missing'));
      assert(events.includes('fallback-cue'));
    } else assert.equal(result.missingAudio,1);
  });
}
