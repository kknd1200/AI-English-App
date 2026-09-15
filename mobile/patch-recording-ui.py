from pathlib import Path

p = Path('androidapp/app/src/main/assets/index.html')
s = p.read_text(encoding='utf-8')

s = s.replace(
    '<title>BUNBUN 1.5 — 온라인 + 기기 AI 오프라인 통역기</title>',
    '<title>BUNBUN 1.5.1 — 온라인 + 기기 AI 오프라인 통역기</title>'
)

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

replacements = [
    ("nOn=true;nBtn=btn;nLang=lang;btn.classList.add('rec');setStatus('🎙️ '+LANGS[lang].name+'로 말하세요…');", "nOn=true;nBtn=btn;nLang=lang;setListeningVisual(btn,true);setStatus('🔴 음성 인식 중 · '+LANGS[lang].name+'로 말하세요…');"),
    ("function endNative(){nOn=false;if(nBtn)nBtn.classList.remove('rec');nBtn=null}", "function endNative(){nOn=false;if(nBtn)setListeningVisual(nBtn,false);nBtn=null}"),
    ("rec.continuous=false;btn.classList.add('rec');setStatus('듣는 중…');", "rec.continuous=false;setListeningVisual(btn,true);setStatus('🔴 음성 인식 중 · '+LANGS[lang].name+'로 말하세요…');"),
    ("rec=null;btn.classList.remove('rec');setStatus('');", "rec=null;setListeningVisual(btn,false);setStatus('');"),
    ("rec=null;btn.classList.remove('rec');setStatus('음성 인식 오류: '+e.error,true)", "rec=null;setListeningVisual(btn,false);setStatus('음성 인식 오류: '+e.error,true)"),
    ("rec.onend=()=>{rec=null;btn.classList.remove('rec')}", "rec.onend=()=>{rec=null;setListeningVisual(btn,false)}")
]
for old, new in replacements:
    if old in s:
        s = s.replace(old, new, 1)

if '.mic.rec{' not in s or 'function setListeningVisual' not in s or "content:'REC'" not in s:
    raise SystemExit('recording UI patch verification failed')

p.write_text(s, encoding='utf-8')
print('BUNBUN 1.5.1 recording UI patch applied')
