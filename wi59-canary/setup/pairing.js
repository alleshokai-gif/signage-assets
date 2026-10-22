(function(root){
  'use strict';
  const ENDPOINT='https://script.google.com/macros/s/AKfycbxImsH4sWBlEbYaiEl4X7mUmAsuzr3j8hRJeg7Hlq6fXSQRh79XCGB8PoX7arfbPrnbXQ/exec';
  const start=root.document.getElementById('pairStart');
  const admin=root.document.getElementById('pairAdmin');
  const info=root.document.getElementById('pairStatus');
  const beginButton=root.document.getElementById('pairBegin');
  const saved=root.SignageBoundary.credentialStatus()==='saved';
  start.hidden=saved;
  admin.hidden=!saved;

  function encode(bytes){
    return root.btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(value){
    return Uint8Array.from(root.atob(value.replace(/-/g,'+').replace(/_/g,'/')),ch=>ch.charCodeAt(0));
  }
  async function post(body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await root.fetch(ENDPOINT,{method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),
        credentials:'omit',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('transport');
      const data=await response.json();
      if(!data||typeof data.ok!=='boolean')throw Error('response');
      return data;
    }finally{clearTimeout(timer);}
  }
  beginButton.onclick=async()=>{
    beginButton.disabled=true;
    try{
      if(!root.crypto?.subtle)throw Error('crypto');
      info.textContent='登録を開始しています…';
      const keys=await root.crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,
        publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
      const publicKey=encode(await root.crypto.subtle.exportKey('spki',keys.publicKey));
      const pollToken=encode(root.crypto.getRandomValues(new Uint8Array(32)));
      const begin=await post({action:'pairBegin',publicKey,pollToken});
      if(!begin.ok||!(/^[a-f0-9]{32}$/.test(begin.requestId))||
          !(/^[A-F0-9]{8}$/.test(begin.code))||!Number.isSafeInteger(begin.expiresAt))throw Error('begin');
      info.textContent=`コード ${begin.code}。合鍵が保存済みのPCで同じコードを確認して承認してください。`;
      while(Date.now()<begin.expiresAt){
        await new Promise(resolve=>setTimeout(resolve,5000));
        let result;
        try{result=await post({action:'pairPoll',requestId:begin.requestId,pollToken});}
        catch(_){continue;}
        if(!result.ok)break;
        if(result.state!=='approved')continue;
        if(result.code!==begin.code||!(/^[A-Za-z0-9_-]{300,600}$/.test(result.ciphertext||'')))throw Error('response');
        const plaintext=await root.crypto.subtle.decrypt({name:'RSA-OAEP'},keys.privateKey,decode(result.ciphertext));
        root.SignageBoundary.saveCredential(new TextDecoder().decode(plaintext));
        info.textContent='保存しました。保存状態を再確認しています…';
        root.location.reload();
        return;
      }
      info.textContent='登録が期限切れです。もう一度開始してください。';
    }catch(_){info.textContent='登録できませんでした。通信と端末の暗号機能を確認して再試行してください。';}
    finally{beginButton.disabled=false;}
  };

  async function refresh(){
    const target=root.document.getElementById('pairRequests');
    target.textContent='確認中…';
    try{
      const result=await root.SignageBoundary.request(ENDPOINT,{action:'pairList'});
      if(!Array.isArray(result.pending))throw Error('response');
      target.replaceChildren();
      if(!result.pending.length){target.textContent='承認待ちはありません。';return;}
      for(const pending of result.pending){
        if(!/^[a-f0-9]{32}$/.test(pending.requestId||'')||
            !(/^[A-F0-9]{8}$/.test(pending.code||'')))continue;
        const row=root.document.createElement('p'),button=root.document.createElement('button');
        button.type='button';button.textContent=`${pending.code} を承認`;
        button.onclick=async()=>{
          button.disabled=true;
          try{
            await root.SignageBoundary.approvePairing(ENDPOINT,pending.requestId,pending.publicKey);
            row.textContent=`${pending.code} を承認しました。端末側の保存完了を確認してください。`;
          }catch(_){row.textContent='承認できませんでした。端末で登録をやり直してください。';}
        };
        row.append(button);target.append(row);
      }
    }catch(_){target.textContent='承認待ちを取得できませんでした。';}
  }
  root.document.getElementById('pairRefresh').onclick=refresh;
  if(saved)refresh();
})(window);
