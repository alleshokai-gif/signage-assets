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
