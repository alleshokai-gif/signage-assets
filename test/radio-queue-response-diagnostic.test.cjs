const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('malformed queue response keeps only safe format and redirect metadata',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const start=html.indexOf('/* Purpose-limited bearer key');
  const end=html.indexOf('</script>',start);
  assert(start>=0&&end>start);
  const secret='sg1_'+'a'.repeat(43);
  const root={module:{exports:{}},location:{protocol:'https:'},URL,AbortController,setTimeout,clearTimeout,
    localStorage:{getItem:()=>secret},
    fetch:async()=>({ok:true,status:200,redirected:true,url:'https://script.googleusercontent.com/macros/echo?token=private',
      headers:{get:()=> 'text/html; charset=UTF-8'},json:async()=>{throw Error('private HTML body');}})};
  vm.runInNewContext(html.slice(start,end),root);
  await assert.rejects(root.module.exports.request('https://script.google.com/macros/s/'+'a'.repeat(40)+'/exec',{reason:'clock_0720'}),error=>{
    assert.equal(error.category,'parse');
    assert.deepEqual(JSON.parse(JSON.stringify(error.diagnostic)),{responseFormat:'html',responseHost:'content',responseStatus:200,responseRedirected:true});
    assert(!JSON.stringify(error).includes(secret));
    assert(!JSON.stringify(error).includes('private'));
    return true;
  });
});

test('an aborted queue body is a timeout and stored audio has a measured read budget',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const start=html.indexOf('/* Purpose-limited bearer key');
  const end=html.indexOf('</script>',start);
  const delays=[];
  const root={module:{exports:{}},location:{protocol:'https:'},URL,AbortController,
    setTimeout:(_callback,ms)=>{delays.push(ms);return 1;},clearTimeout:()=>{},
    localStorage:{getItem:()=> 'sg1_'+'a'.repeat(43)},
    fetch:async()=>({ok:true,status:200,redirected:true,url:'https://script.googleusercontent.com/macros/echo',
      headers:{get:()=> 'application/json'},json:async()=>{throw Object.assign(Error('aborted'),{name:'AbortError'});}})};
  vm.runInNewContext(html.slice(start,end),root);
  const endpoint='https://script.google.com/macros/s/'+'a'.repeat(40)+'/exec';
  for(const parameters of [{reason:'clock_0720'},{action:'radioAudio',reason:'clock_0720'}]){
    await assert.rejects(root.module.exports.request(endpoint,parameters),error=>{
      assert.equal(error.code,'SIGNAGE_TRANSPORT_TIMEOUT');
      assert.equal(error.category,'transport');
      return true;
    });
  }
  assert.deepEqual(delays,[20000,20000]);
});
