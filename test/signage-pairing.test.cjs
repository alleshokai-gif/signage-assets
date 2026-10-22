'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

test('PC encrypts an existing key for the kiosk without exposing plaintext in the relay',async()=>{
  const keys=await webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
  const publicKey=Buffer.from(await webcrypto.subtle.exportKey('spki',keys.publicKey)).toString('base64url');
  const credential='sg1_'+ 'a'.repeat(43),requestId='a'.repeat(32);
  let sent;
  const root={
    module:{exports:{}},location:{protocol:'https:'},crypto:webcrypto,
    atob:value=>Buffer.from(value,'base64').toString('binary'),
    btoa:value=>Buffer.from(value,'binary').toString('base64'),
    TextEncoder,
    localStorage:{getItem:key=>key==='signage.scoped-key.v1'?credential:null},
    fetch:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,state:'approved'})};},
    AbortController,setTimeout,clearTimeout,Uint8Array,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../wi59-canary/assets/signage-boundary.js'),'utf8'),root);
  const result=await root.module.exports.approvePairing('https://script.google.com/macros/s/'+'a'.repeat(40)+'/exec',requestId,publicKey);
  assert.equal(result.state,'approved');
  assert.equal(sent.action,'pairApprove');
  assert.equal(sent.requestId,requestId);
  assert(!sent.ciphertext.includes(credential));
  const decrypted=await webcrypto.subtle.decrypt({name:'RSA-OAEP'},keys.privateKey,Buffer.from(sent.ciphertext,'base64url'));
  assert.equal(new TextDecoder().decode(decrypted),credential);
});
