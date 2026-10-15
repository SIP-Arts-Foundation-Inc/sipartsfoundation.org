
const menu=document.querySelector('.menu-toggle');
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'Close':'Menu';document.querySelector('#primary-nav').classList.toggle('open',open)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu?.getAttribute('aria-expanded')==='true'){menu.click();menu.focus()}});
const search=document.querySelector('#resource-search'),topic=document.querySelector('#resource-topic');
function filterResources(){const q=(search?.value||'').trim().toLowerCase(),t=topic?.value||'all';let count=0;document.querySelectorAll('.resource-item').forEach(item=>{const show=(!q||item.textContent.toLowerCase().includes(q))&&(t==='all'||item.dataset.topics.split(' ').includes(t));item.hidden=!show;if(show)count++});document.querySelector('#resource-count').textContent=`${count} resource${count===1?'':'s'} shown`;document.querySelector('#resource-empty').hidden=count>0}
search?.addEventListener('input',filterResources);topic?.addEventListener('change',filterResources);
const form=document.querySelector('#support-form');
if(form){
 const category=form.querySelector('#category'),params=new URLSearchParams(location.search);if([...category.options].some(o=>o.value===params.get('category')))category.value=params.get('category');
 const status=document.querySelector('#form-status'),submit=form.querySelector('[type=submit]');let token='';
 const setStatus=(message,error=false)=>{status.classList.toggle('error',error);status.textContent=message;status.focus()};
 async function session(){const r=await fetch(form.dataset.endpoint,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok)throw new Error(data.message||'The form is temporarily unavailable.');token=data.token;return data}
 session().then(data=>{if(data.preview){const note=document.createElement('p');note.className='form-intro';note.textContent='Preview: requests are not sent. You can try the form without contacting anyone.';form.prepend(note)}}).catch(()=>{});
 form.addEventListener('submit',async e=>{e.preventDefault();status.textContent='';form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));form.querySelectorAll('.error-text').forEach(el=>el.remove());
 let errors=[];const data=Object.fromEntries(new FormData(form));
 const fail=(id,msg)=>{errors.push(msg);const field=form.querySelector('#'+id);field.setAttribute('aria-invalid','true');const p=document.createElement('p');p.className='error-text';p.id=id+'-error';p.textContent=msg;field.setAttribute('aria-describedby',p.id);field.closest('.field,.check').append(p)};
 if(!(data.name||'').trim())fail('name','Enter your name.');
 if(!category.value)fail('category','Choose what you would like help with.');
 if(data.preferred==='phone'&&!(data.phone||'').trim())fail('phone','Enter a phone number so we can call you.');
 if(data.preferred==='email'&&!(data.email||'').trim())fail('email','Enter an email address so we can reply.');
 if(data.email&&!form.querySelector('#email').validity.valid)fail('email','Enter a valid email address.');
 if((data.message||'').trim().length<10)fail('message','Tell us a little about what you need (at least 10 characters).');
 if(!data.consent)fail('consent','Please allow Disability Pathways to contact you about this request.');
 if(errors.length){setStatus('Please check the marked fields: '+errors.join(' '),true);form.querySelector('[aria-invalid=true]').focus();return}
 submit.disabled=true;submit.textContent='Sending…';
 try{if(!token)await session();const r=await fetch(form.dataset.endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({...data,token})});const result=await r.json();if(!r.ok)throw new Error(result.message||'Your request could not be sent. Please try again.');
 if(result.preview){setStatus('Preview complete. Your form passed validation. Nothing was sent or saved.');}
 else{form.reset();token='';setStatus('Your request has been submitted to Disability Pathways. We generally respond within two business days. Your reference is '+result.reference+'.');session().catch(()=>{});}
 }catch(err){setStatus(err.message||'Your request was not sent. Please try again or call (618) 816-8834.',true)}finally{submit.disabled=false;submit.textContent='Send my request'}
 });
}
