/* SIP Arts Foundation: PayPal donate button (footer + Support Our Work sections). Edit here only. */
(function(){
  var ID='K2TDBHWG8GVHN';
  var SDK='https://www.paypal.com/sdk/js?client-id=BAAjqq3QP3Au_KfJHsEdPigI5S9vlIb_6BARzXSAtv6hCTn2Oq3OGzw6DBXftpyqNK-lhEA1rDm8vBaD1k&components=hosted-buttons&enable-funding=venmo&currency=USD';
  var css='.sip-donate-section{padding:3.5rem 1.5rem 4rem;text-align:center}'+
    '.sip-donate-section.on-landing{padding-bottom:10rem}'+
    '.sip-donate-inner{max-width:560px;margin:0 auto}'+
    '.sip-donate-section h2{font-size:clamp(1.6rem,3vw,2.2rem);margin:0 0 .6rem}'+
    '.sip-donate-section p{margin:0 auto;max-width:34rem;line-height:1.6}'+
    '.sip-donate-box{max-width:360px;margin:1.4rem auto 0}'+
    '.sip-donate-footer{max-width:320px;margin:1.4rem auto 0;text-align:center}'+
    '.sip-donate-btn{display:inline-block;background:#FFD126;color:#0B2C5C;font-weight:700;text-decoration:none;padding:.7rem 1.6rem;border-radius:999px;line-height:1.2}'+
    '.sip-donate-btn:hover{filter:brightness(.95)}.sip-donate-btn:focus-visible{outline:3px solid #075a9c;outline-offset:3px}';
  function addCss(){var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);}
  function addFooter(){
    var fs=document.querySelectorAll('footer'); if(!fs.length) return false;
    var f=fs[fs.length-1];
    if(f.classList.contains('landing-footer')||f.querySelector('.sip-donate-footer')) return true;
    var d=document.createElement('div'); d.className='sip-donate-footer';
    var href=document.getElementById('sip-donate-title')?'#sip-donate-title':'/#sip-donate-title';
    d.innerHTML='<a class="sip-donate-btn" href="'+href+'">Donate</a>';
    f.appendChild(d); return true;
  }
  function loadSDK(cb){
    if(window.paypal&&window.paypal.HostedButtons) return cb();
    var s=document.createElement('script'); s.src=SDK; s.onload=cb; document.head.appendChild(s);
  }
  function renderAll(){
    var els=document.querySelectorAll('.sip-paypal');
    for(var i=0;i<els.length;i++){var el=els[i]; if(el.getAttribute('data-done')) continue; el.setAttribute('data-done','1');
      window.paypal.HostedButtons({hostedButtonId:ID}).render('#'+el.id);}
  }
  function init(){
    addCss(); var tries=0;
    (function wait(){ var ok=addFooter(); if(!ok && tries++<20) return setTimeout(wait,150);
      if(document.querySelector('.sip-paypal')) loadSDK(renderAll); })();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
