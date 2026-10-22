const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('clock menu replays the current morning until the night broadcast, without changing scheduled reasons',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const start=html.indexOf('    function clockMenuRadioReason_(now){');
  const end=html.indexOf('    async function requestHomeRadioFromClockMenu()',start);
  assert(start>=0&&end>start);
  const context=vm.createContext({});
  vm.runInContext(html.slice(start,end),context);
  const reason=(h,m)=>context.clockMenuRadioReason_({getHours:()=>h,getMinutes:()=>m});
  assert.equal(reason(11,59),'clock_0720');
  assert.equal(reason(12,20),'clock_0720');
  assert.equal(reason(18,29),'clock_0720');
  assert.equal(reason(18,30),'home');
});
