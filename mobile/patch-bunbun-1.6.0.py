from pathlib import Path
import json
import re
import subprocess

p = Path('androidapp/app/src/main/assets/index.html')
s = p.read_text(encoding='utf-8')

s = s.replace('<title>BUNBUN 1.5 — 온라인 + 기기 AI 오프라인 통역기</title>', '<title>BUNBUN 1.6.0 — 5개 언어 여행 통역기</title>')
s = s.replace('한국어·영어·일본어·베트남어 다운로드', '한국어·영어·일본어·베트남어·필리핀어 다운로드')

# 녹음 상태 UI
css_anchor = '.mic.me .sub{color:#d4f8ff}'
css_patch = r'''.mic.me .sub{color:#d4f8ff}.mic.rec{position:relative;animation:recordPulse .85s ease-in-out infinite;background:linear-gradient(180deg,#dc2626,#8f1520)!important;border:2px solid #ff7b86!important;box-shadow:0 0 0 4px rgba(239,68,68,.24),0 0 26px rgba(239,68,68,.75);color:#fff;transform:scale(1.025)}.mic.rec .ic{animation:micBeat .85s ease-in-out infinite;filter:drop-shadow(0 0 8px rgba(255,255,255,.7))}.mic.rec .sub{color:#fff!important;font-weight:900}.mic.rec::after{content:'REC';position:absolute;top:7px;right:9px;background:#fff;color:#b91c1c;border-radius:999px;padding:2px 7px;font-size:9px;font-weight:1000;letter-spacing:.7px}@keyframes recordPulse{0%,100%{box-shadow:0 0 0 3px rgba(239,68,68,.18),0 0 14px rgba(239,68,68,.5)}50%{box-shadow:0 0 0 7px rgba(239,68,68,.32),0 0 34px rgba(239,68,68,.95)}}@keyframes micBeat{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}'''
if '.mic.rec{' not in s:
    if css_anchor not in s:
        raise SystemExit('recording CSS anchor not found')
    s = s.replace(css_anchor, css_patch, 1)

js_anchor = "const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null,nOn=false,nBtn=null,nLang=null;const STT_MSG="
js_patch = "const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null,nOn=false,nBtn=null,nLang=null;function setListeningVisual(btn,on){if(!btn)return;const sub=btn.querySelector('.sub');if(on){if(sub&&!btn.dataset.idleSub)btn.dataset.idleSub=sub.textContent||'';btn.classList.add('rec');btn.setAttribute('aria-pressed','true');if(sub)sub.textContent='● 듣는 중 · 다시 누르면 중지'}else{btn.classList.remove('rec');btn.setAttribute('aria-pressed','false');if(sub&&btn.dataset.idleSub)sub.textContent=btn.dataset.idleSub}}const STT_MSG="
if 'function setListeningVisual' not in s:
    if js_anchor not in s:
        raise SystemExit('recording JS anchor not found')
    s = s.replace(js_anchor, js_patch, 1)

for old, new in [
    ("nOn=true;nBtn=btn;nLang=lang;btn.classList.add('rec');setStatus('🎙️ '+LANGS[lang].name+'로 말하세요…');", "nOn=true;nBtn=btn;nLang=lang;setListeningVisual(btn,true);setStatus('🔴 음성 인식 중 · '+LANGS[lang].name+'로 말하세요…');"),
    ("function endNative(){nOn=false;if(nBtn)nBtn.classList.remove('rec');nBtn=null}", "function endNative(){nOn=false;if(nBtn)setListeningVisual(nBtn,false);nBtn=null}"),
    ("rec.continuous=false;btn.classList.add('rec');setStatus('듣는 중…');", "rec.continuous=false;setListeningVisual(btn,true);setStatus('🔴 음성 인식 중 · '+LANGS[lang].name+'로 말하세요…');"),
    ("rec=null;btn.classList.remove('rec');setStatus('');", "rec=null;setListeningVisual(btn,false);setStatus('');"),
    ("rec=null;btn.classList.remove('rec');setStatus('음성 인식 오류: '+e.error,true)", "rec=null;setListeningVisual(btn,false);setStatus('음성 인식 오류: '+e.error,true)"),
    ("rec.onend=()=>{rec=null;btn.classList.remove('rec')}", "rec.onend=()=>{rec=null;setListeningVisual(btn,false)}")
]:
    if old in s:
        s = s.replace(old, new, 1)

# 하단 입력창이 번역 결과를 덮지 않도록 실제 dock 높이에 맞춰 여백 계산
s = s.replace('--danger:#ff7373;--safe-b:env(safe-area-inset-bottom,0px)}', '--danger:#ff7373;--safe-b:env(safe-area-inset-bottom,0px);--dock-h:250px}')
s = s.replace('#chat{padding:12px 14px 180px}', '#chat{padding:12px 14px calc(var(--dock-h,250px) + 20px)}')
s = s.replace('#phrases{padding:8px 12px 170px}', '#phrases{padding:8px 12px calc(var(--dock-h,250px) + 10px)}')
s = s.replace('#hist{padding:0 12px 170px}', '#hist{padding:0 12px calc(var(--dock-h,250px) + 10px)}')
helper_anchor = 'function sendTyped(){'
helper = "function updateDockInset(){const d=$('dock');if(!d)return;const h=d.offsetHeight||250;document.documentElement.style.setProperty('--dock-h',h+'px')}window.addEventListener('resize',updateDockInset);if(window.ResizeObserver){new ResizeObserver(updateDockInset).observe($('dock'))}function scrollBubbleIntoView(el){if(!el)return;requestAnimationFrame(()=>{try{el.scrollIntoView({block:'end',behavior:'smooth'})}catch(e){document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight}})}"
if 'function updateDockInset()' not in s:
    if helper_anchor not in s:
        raise SystemExit('layout JS anchor not found')
    s = s.replace(helper_anchor, helper + helper_anchor, 1)
old_add = "function addBubble(d){if(!chat.querySelector('.msg'))chat.innerHTML='';const el=document.createElement('div');el.className='msg'+(d.mine?' mine':'');el.innerHTML=bubbleHTML(d);chat.appendChild(el);document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight;return el}"
new_add = "function addBubble(d){if(!chat.querySelector('.msg'))chat.innerHTML='';const el=document.createElement('div');el.className='msg'+(d.mine?' mine':'');el.innerHTML=bubbleHTML(d);chat.appendChild(el);scrollBubbleIntoView(el);return el}"
if old_add in s:
    s = s.replace(old_add, new_add, 1)
old_update = "function updateBubble(el,d){el.innerHTML=bubbleHTML(d);el.querySelectorAll('.act').forEach(b=>{b.onclick=()=>{const a=b.dataset.a;if(a==='speak')speak(d.out,d.to);if(a==='copy'){copy(d.out);toast('복사했어요')}if(a==='fav'){const h=S.hist.find(x=>x.src===d.src&&x.out===d.out);if(h){h.fav=!h.fav;store.set('hist',S.hist);b.classList.toggle('on',h.fav);b.textContent=h.fav?'★ 저장됨':'☆ 저장'}}}})}"
new_update = "function updateBubble(el,d){el.innerHTML=bubbleHTML(d);el.querySelectorAll('.act').forEach(b=>{b.onclick=()=>{const a=b.dataset.a;if(a==='speak')speak(d.out,d.to);if(a==='copy'){copy(d.out);toast('복사했어요')}if(a==='fav'){const h=S.hist.find(x=>x.src===d.src&&x.out===d.out);if(h){h.fav=!h.fav;store.set('hist',S.hist);b.classList.toggle('on',h.fav);b.textContent=h.fav?'★ 저장됨':'☆ 저장'}}}});scrollBubbleIntoView(el)}"
if old_update in s:
    s = s.replace(old_update, new_update, 1)
startup = 'initLangSelects();applyEngineUI();updateNetworkStatus();requestModelStatus();renderCats();renderBook();emptyChat();renderHist();'
if startup in s:
    s = s.replace(startup, startup + 'updateDockInset();', 1)

# 필리핀어(Tagalog/Filipino) - UI, STT/TTS, 무료 번역, 오프라인 번역과 문장집
old_langs = "const LANGS={ko:{name:'한국어',bcp:'ko-KR',flag:'🇰🇷'},vi:{name:'Tiếng Việt',bcp:'vi-VN',flag:'🇻🇳'},en:{name:'English',bcp:'en-US',flag:'🇺🇸'},ja:{name:'日本語',bcp:'ja-JP',flag:'🇯🇵'}};const SERVER='/api/translate';"
new_langs = "const LANGS={ko:{name:'한국어',bcp:'ko-KR',flag:'🇰🇷'},vi:{name:'Tiếng Việt',bcp:'vi-VN',flag:'🇻🇳'},en:{name:'English',bcp:'en-US',flag:'🇺🇸'},ja:{name:'日本語',bcp:'ja-JP',flag:'🇯🇵'},tl:{name:'Filipino',bcp:'fil-PH',flag:'🇵🇭'}};const SERVER='/api/translate';"
if old_langs not in s:
    raise SystemExit('LANGS anchor not found')
s = s.replace(old_langs, new_langs, 1)

m = re.search(r"const BOOK=(\[.*?\]);\nconst \$=", s, re.S)
if not m:
    raise SystemExit('BOOK anchor not found')
literal = m.group(1)
parsed = subprocess.check_output(['node', '-e', 'const BOOK='+literal+';process.stdout.write(JSON.stringify(BOOK))'], text=True)
book = json.loads(parsed)
tl = [
    'Kumusta po','Salamat po','Paumanhin po','Opo','Hindi po','Ayos lang','Paalam','Hindi ako marunong mag-Filipino','Marunong po ba kayong mag-English?','Pakibagalan po ang pagsasalita.','Pakiulit po.',
    'Patingin po ng menu.','Ito po.','Ano po ang mairerekomenda ninyo?','Huwag pong maanghang.','Huwag pong lagyan ng cilantro.','Walang yelo, pakiusap.','Isang basong tubig po.','Paki-takeout po.','Masarap.','Paki-bill po.',
    'Pakihatid po ako rito.','Pakibuksan po ang metro.','Sa airport po.','Gaano po katagal?','Dito na lang po.','Pakihintay po sandali.','Nasaan po tayo?','Pakita po sa mapa.',
    'Magkano po ito?','Masyadong mahal.','Pwede pong tawaran?','Tumatanggap po ba kayo ng card?','Pwede ko po bang makita ito?','May ibang kulay po ba?','Pag-iisipan ko muna.',
    'Magche-check in po ako.','May reservation po ako.','Ano po ang Wi-Fi password?','Hindi gumagana ang aircon.','Walang mainit na tubig.','Pwede po bang iwan muna ang bagahe ko rito?','Anong oras po ang check-out?',
    "Tulungan n'yo po ako.",'Nasaan po ang banyo?','Masama po ang pakiramdam ko.','Kailangan ko pong pumunta sa ospital.','Nasaan po ang botika?','Pakitawag po ang pulis.','Nawala po ang wallet ko.','Gusto ko pong makipag-ugnayan sa Korean Embassy.'
]
items = [item for cat in book for item in cat['items']]
if len(items) != len(tl):
    raise SystemExit('unexpected phrasebook size')
for item, translated in zip(items, tl):
    item['tl'] = translated
s = s[:m.start(1)] + json.dumps(book, ensure_ascii=False, separators=(',', ':')) + s[m.end(1):]

s = s.replace("},vi:{'chao':'Xin chào','cam on':'Cảm ơn','xin loi':'Xin lỗi'}};", "},vi:{'chao':'Xin chào','cam on':'Cảm ơn','xin loi':'Xin lỗi'},tl:{'kumusta':'Kumusta po','salamat':'Salamat po','paumanhin':'Paumanhin po','nasaan ang banyo':'Nasaan po ang banyo?'}};")
s = s.replace('const idx={ko:{},vi:{},en:{},ja:{}};', 'const idx={ko:{},vi:{},en:{},ja:{},tl:{}};')
s = s.replace('const vals={ko:p.ko,vi:p.vi,en:p.en,ja:p.ja};', 'const vals={ko:p.ko,vi:p.vi,en:p.en,ja:p.ja,tl:p.tl};')

old_translate = "async function translate(text,from,to){const fixed=commonOverride(text,from,to);if(fixed)return fixed;if(S.engine==='offline'||navigator.onLine===false)return translateOffline(text,from,to);if(S.engine==='server'){try{const r=await translateServer(text,from,to);if(to==='ja'&&suspiciousJapanese(r.text))throw new Error('일본어 검증 실패');return r}catch(e){try{return await translateOffline(text,from,to)}catch(_){}if(from==='ja'||to==='ja')return translateFree(text,from,to);throw e}}try{return await translateFree(text,from,to)}catch(e){try{return await translateOffline(text,from,to)}catch(_){}throw e}}"
new_translate = "async function translate(text,from,to){const fixed=commonOverride(text,from,to);if(fixed)return fixed;if(S.engine==='offline'||navigator.onLine===false)return translateOffline(text,from,to);if(S.engine==='server'){try{const r=await translateServer(text,from,to);if(to==='ja'&&suspiciousJapanese(r.text))throw new Error('일본어 검증 실패');return r}catch(serverErr){try{return await translateOffline(text,from,to)}catch(_){}try{return await translateFree(text,from,to)}catch(_){}throw serverErr}}try{return await translateFree(text,from,to)}catch(e){try{return await translateOffline(text,from,to)}catch(_){}throw e}}"
if old_translate in s:
    s = s.replace(old_translate, new_translate, 1)
s = s.replace("if(lang==='vi'||lang==='en')return!RE_HAN.test(t)&&!RE_KANA.test(t)&&!RE_HANGUL.test(t);", "if(lang==='vi'||lang==='en'||lang==='tl')return!RE_HAN.test(t)&&!RE_KANA.test(t)&&!RE_HANGUL.test(t);")
s = s.replace("const MM_LOCALE={ko:'ko-KR',vi:'vi-VN',en:'en-US',ja:'ja-JP'};", "const MM_LOCALE={ko:'ko-KR',vi:'vi-VN',en:'en-US',ja:'ja-JP',tl:'tl-PH'};")
s = s.replace("const names={ko:'한국어',en:'영어',ja:'일본어',vi:'베트남어'}", "const names={ko:'한국어',en:'영어',ja:'일본어',vi:'베트남어',tl:'필리핀어'}")
s = s.replace("+'/4'+", "+'/5'+")
s = s.replace('✅ 4개 언어팩 준비 완료', '✅ 5개 언어팩 준비 완료')
s = s.replace('4개 언어팩 다운로드 (Wi‑Fi)', '5개 언어팩 다운로드 (Wi‑Fi)')
s = s.replace("d.downloaded||['ko','en','ja','vi']", "d.downloaded||['ko','en','ja','vi','tl']")
s = s.replace("p[target]||p.en||p.vi||p.ko", "p[target]||p.en||p.vi||p.tl||p.ko")
s = s.replace("koLabel=(target==='ja'&&p.ko==='베트남어를 못해요')?'일본어를 못해요':p.ko;", "koLabel=(p.ko==='베트남어를 못해요'?(target==='ja'?'일본어를 못해요':(target==='tl'?'필리핀어를 못해요':p.ko)):p.ko);")

for marker in ['BUNBUN 1.6.0', "tl:{name:'Filipino'", 'function setListeningVisual', '--dock-h:250px', 'function updateDockInset()', 'scrollBubbleIntoView(el)', "tl:'tl-PH'", "tl:'필리핀어'", "['ko','en','ja','vi','tl']"]:
    if marker not in s:
        raise SystemExit('patch verification failed: ' + marker)

p.write_text(s, encoding='utf-8')
print('BUNBUN 1.6.0 patch complete')
