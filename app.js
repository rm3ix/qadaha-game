(function(){
  const STORAGE_KEY = 'qadaha_state_v2';
  const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('qadaha_channel') : null;
  const difficulties = [
    { key:'easy', label:'سهل', className:'easy' },
    { key:'medium', label:'متوسط', className:'medium' },
    { key:'hard', label:'صعب', className:'hard' }
  ];
  const defaultCards = ['خط النار','سرقة','تبديل سؤال','مضاعفة'];

  function makeQuestion(seed){ return { q:'', a:'' }; }
  function makeCategory(name='فئة جديدة'){
    return {
      id: uid(),
      name,
      easy: Array.from({length:5}, ()=>makeQuestion()),
      medium: Array.from({length:5}, ()=>makeQuestion()),
      hard: Array.from({length:5}, ()=>makeQuestion())
    };
  }
  function makeTeam(name,color){
    return { id:uid(), name, color, cards: defaultCards.map(n=>({name:n, used:false})) };
  }
  function defaultState(){
    return {
      settings: {
        title:'قدها',
        winScore:500000,
        welcomeMessage:'جاهزين؟ قدها ولا لا؟',
        winnerMessage:'الف مبروك يا أبطال'
      },
      categories:[
        makeCategory('معلومات عامة'),
        makeCategory('رياضة'),
        makeCategory('تاريخ')
      ],
      teams:[
        makeTeam('الفريق الأول','#7c3aed'),
        makeTeam('الفريق الثاني','#06b6d4'),
        makeTeam('الفريق الثالث','#f59e0b')
      ],
      transactions:[],
      stage:{
        screen:'welcome',
        categoryId:null,
        difficulty:'easy',
        questionIndex:0,
        showAnswer:false,
        timer:{duration:30,remaining:30,running:false,lastTick:null},
        soundPulse:null
      }
    };
  }
  function uid(){ return Math.random().toString(36).slice(2,10); }
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        return deepMerge(defaultState(), parsed);
      }
    }catch(e){}
    return defaultState();
  }
  function deepMerge(base, incoming){
    if(Array.isArray(base)) return incoming ?? base;
    if(typeof base !== 'object' || base===null) return incoming ?? base;
    const out = {...base};
    for(const key of Object.keys(incoming || {})){
      out[key] = deepMerge(base[key], incoming[key]);
    }
    return out;
  }
  let state = loadState();

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if(channel) channel.postMessage({type:'state', state});
  }
  function setState(updater){
    updater(state);
    saveState();
    render();
  }
  function scores(){
    const map = Object.fromEntries(state.teams.map(t=>[t.id,0]));
    state.transactions.forEach(tx=>{ if(map[tx.teamId] != null) map[tx.teamId] += Number(tx.amount || 0); });
    return map;
  }
  function leadingTeam(){
    const sc = scores();
    return [...state.teams].sort((a,b)=>(sc[b.id]||0)-(sc[a.id]||0))[0] || null;
  }
  function winnerTeam(){
    const sc = scores();
    return state.teams.find(t => (sc[t.id]||0) >= Number(state.settings.winScore || 0)) || null;
  }
  function currentCategory(){
    return state.categories.find(c=>c.id===state.stage.categoryId) || state.categories[0] || null;
  }
  function currentQuestion(){
    const category = currentCategory();
    if(!category) return null;
    const arr = category[state.stage.difficulty] || [];
    return arr[state.stage.questionIndex] || null;
  }
  function formatMoney(v){ return new Intl.NumberFormat('en-US').format(Number(v || 0)); }
  function formatTime(sec){ sec = Math.max(0, Number(sec||0)); const m = String(Math.floor(sec/60)).padStart(2,'0'); const s = String(sec%60).padStart(2,'0'); return `${m}:${s}`; }
  function difficultyMeta(key){ return difficulties.find(d=>d.key===key) || difficulties[0]; }

  function render(){
    document.title = `${state.settings.title}${location.pathname.includes('host') ? ' | لوحة التحكم' : location.pathname.includes('display') ? ' | شاشة المتسابقين' : ''}`;
    if(document.body.classList.contains('display-body')) renderDisplay();
    if(document.querySelector('.app-shell')) renderHost();
  }

  function renderHost(){
    const titleMap = {dashboard:'لوحة التحكم',questions:'إدارة الأسئلة',teams:'الفرق والكروت',settings:'الإعدادات'};
    const activeTab = document.querySelector('.nav-btn.active')?.dataset.tab || 'dashboard';
    setText('pageTitle', titleMap[activeTab]);
    populateSelects();
    renderPreview();
    renderScoreboard();
    renderTransactions();
    renderQuestionsEditor();
    renderTeamsEditor();
    setValue('gameTitleInput', state.settings.title);
    setValue('winScoreInput', state.settings.winScore);
    setValue('welcomeMessageInput', state.settings.welcomeMessage);
    setValue('winnerMessageInput', state.settings.winnerMessage);
    setText('timerReadout', formatTime(state.stage.timer.remaining));
  }

  function populateSelects(){
    const categorySelect = document.getElementById('categorySelect');
    const teamSelect = document.getElementById('teamTransactionSelect');
    if(categorySelect){
      categorySelect.innerHTML = state.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name||'بدون اسم')}</option>`).join('');
      if(!state.stage.categoryId && state.categories[0]) state.stage.categoryId = state.categories[0].id;
      categorySelect.value = state.stage.categoryId || '';
    }
    if(teamSelect){
      teamSelect.innerHTML = state.teams.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    }
    setValue('difficultySelect', state.stage.difficulty);
    setValue('questionIndexSelect', state.stage.questionIndex);
    setValue('timerDurationInput', state.stage.timer.duration);
  }

  function renderPreview(){
    const category = currentCategory();
    const question = currentQuestion();
    const diff = difficultyMeta(state.stage.difficulty);
    setText('previewCategoryTag', category?.name || 'الفئة');
    const diffTag = document.getElementById('previewDifficultyTag');
    if(diffTag){ diffTag.textContent = diff.label; diffTag.className = `tag ${diff.className}`; }
    setText('previewQuestionNumber', String(Number(state.stage.questionIndex)+1));
    setText('previewQuestionText', question?.q || 'ما فيه سؤال مكتوب هنا إلى الآن');
    setText('previewAnswerText', question?.a ? `الإجابة: ${question.a}` : 'ما فيه إجابة مكتوبة لهذا السؤال');
  }

  function renderScoreboard(){
    const wrap = document.getElementById('scoreboardGrid');
    if(!wrap) return;
    const sc = scores();
    const win = winnerTeam();
    wrap.innerHTML = state.teams.map(team=>{
      const value = sc[team.id] || 0;
      return `<div class="score-card" style="--team-color:${team.color}">
        <div class="team-name">${escapeHtml(team.name)}</div>
        <div class="team-score">${formatMoney(value)}</div>
        <div class="team-status">${win?.id===team.id ? 'فائز! 🏆' : value >= Number(state.settings.winScore) ? 'فائز! 🏆' : 'مستمر'}</div>
        <div class="cards-mini">${team.cards.map(c=>`<span class="mini-chip">${escapeHtml(c.name)}: ${c.used ? 'تم الاستخدام' : 'متاح'}</span>`).join('')}</div>
      </div>`;
    }).join('');
  }

  function renderTransactions(){
    const body = document.getElementById('transactionsTableBody');
    if(!body) return;
    const teamMap = Object.fromEntries(state.teams.map(t=>[t.id,t]));
    body.innerHTML = [...state.transactions].reverse().map(tx=>`<tr>
      <td>${escapeHtml(tx.time)}</td>
      <td>${escapeHtml(teamMap[tx.teamId]?.name || '—')}</td>
      <td>${Number(tx.amount) >= 0 ? '+' : ''}${formatMoney(tx.amount)}</td>
      <td>${escapeHtml(tx.note || '—')}</td>
      <td><button class="icon-btn" data-remove-tx="${tx.id}">حذف</button></td>
    </tr>`).join('') || `<tr><td colspan="5">لا يوجد عمليات حتى الآن</td></tr>`;
  }

  function renderQuestionsEditor(){
    const wrap = document.getElementById('questionsEditor');
    if(!wrap) return;
    wrap.innerHTML = state.categories.map((cat, cIndex)=>`<div class="category-card">
      <div class="category-head">
        <input data-cat-name="${cat.id}" type="text" value="${escapeAttr(cat.name)}" placeholder="اسم الفئة" />
        <button class="icon-btn" data-remove-cat="${cat.id}">حذف الفئة</button>
      </div>
      <div class="section-stack">
        ${difficulties.map(diff=>`<div class="diff-block">
          <h4>${diff.label}</h4>
          ${(cat[diff.key] || []).map((item, idx)=>`<div class="q-item">
            <textarea data-question="${cat.id}|${diff.key}|${idx}" placeholder="السؤال ${idx+1}">${escapeHtml(item.q || '')}</textarea>
            <textarea data-answer="${cat.id}|${diff.key}|${idx}" placeholder="الإجابة ${idx+1}">${escapeHtml(item.a || '')}</textarea>
          </div>`).join('')}
        </div>`).join('')}
      </div>
    </div>`).join('');
  }

  function renderTeamsEditor(){
    const wrap = document.getElementById('teamsEditor');
    if(!wrap) return;
    const sc = scores();
    wrap.innerHTML = state.teams.map(team=>`<div class="team-card">
      <div class="team-head">
        <div class="form-grid" style="width:100%">
          <input data-team-name="${team.id}" type="text" value="${escapeAttr(team.name)}" placeholder="اسم الفريق" />
          <input data-team-color="${team.id}" class="color-input" type="color" value="${team.color}" />
        </div>
        <button class="icon-btn" data-remove-team="${team.id}">حذف الفريق</button>
      </div>
      <div class="action-row wrap bottom-gap">
        <div class="tag">الرصيد: ${formatMoney(sc[team.id] || 0)}</div>
      </div>
      <div class="cards-grid">
        ${team.cards.map((card, idx)=>`<div class="card-toggle">
          <span>${escapeHtml(card.name)}</span>
          <div class="switch ${card.used ? 'active':''}" data-card-toggle="${team.id}|${idx}" title="${card.used ? 'تم الاستخدام' : 'متاح'}"></div>
        </div>`).join('')}
      </div>
    </div>`).join('');
  }

  function renderDisplay(){
    setText('displayGameTitle', state.settings.title);
    setText('displayWelcomeMessage', state.settings.welcomeMessage);
    setText('winnerMessage', state.settings.winnerMessage);
    setText('displayTimer', formatTime(state.stage.timer.remaining));
    const screens = ['welcome','question','scores','winner'];
    screens.forEach(scr => document.getElementById(scr+'Screen')?.classList.toggle('active', state.stage.screen === scr));

    const category = currentCategory();
    const question = currentQuestion();
    const diff = difficultyMeta(state.stage.difficulty);
    setText('displayCategory', category?.name || 'الفئة');
    const diffEl = document.getElementById('displayDifficulty');
    if(diffEl){ diffEl.textContent = diff.label; diffEl.className = `mega-tag ${diff.className}`; }
    setText('displayQuestionNumber', String(Number(state.stage.questionIndex)+1));
    setText('displayQuestionText', question?.q || 'بانتظار اختيار السؤال من لوحة التحكم');
    setText('displayAnswerText', question?.a || '');
    document.getElementById('displayAnswerWrap')?.classList.toggle('hidden', !state.stage.showAnswer);

    const dScore = document.getElementById('displayScoreboard');
    if(dScore){
      const sc = scores();
      const win = winnerTeam();
      dScore.innerHTML = state.teams.map(team=>`<div class="display-score-card" style="--team-color:${team.color}">
        <div class="display-score-name">${escapeHtml(team.name)}</div>
        <div class="display-score-value">${formatMoney(sc[team.id] || 0)}</div>
        <div class="cards-mini display-score-cards">${team.cards.map(c=>`<span class="mini-chip">${escapeHtml(c.name)}: ${c.used ? 'تم' : 'جاهز'}</span>`).join('')}</div>
        <div class="team-status" style="margin-top:14px">${win?.id===team.id ? 'فائز! 🏆' : 'مستمر'}</div>
      </div>`).join('');
    }

    const win = winnerTeam() || leadingTeam();
    setText('winnerTeamName', win ? win.name : 'بانتظار حسم الجولة');
    playPulse();
  }

  function attachEvents(){
    document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click', ()=>{
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab)?.classList.add('active');
      render();
    }));

    on('categorySelect','change', e=> setState(s=>{ s.stage.categoryId = e.target.value; }));
    on('difficultySelect','change', e=> setState(s=>{ s.stage.difficulty = e.target.value; }));
    on('questionIndexSelect','change', e=> setState(s=>{ s.stage.questionIndex = Number(e.target.value); }));
    on('timerDurationInput','change', e=> setState(s=>{ const v=clamp(Number(e.target.value)||30,5,300); s.stage.timer.duration=v; s.stage.timer.remaining=v; s.stage.timer.running=false; }));
    on('showQuestionBtn','click', ()=> setState(s=>{ s.stage.screen='question'; s.stage.showAnswer=false; }));
    on('revealAnswerBtn','click', ()=> setState(s=>{ s.stage.showAnswer=true; s.stage.screen='question'; }));
    on('hideQuestionBtn','click', ()=> setState(s=>{ s.stage.showAnswer=false; }));
    on('clearStageBtn','click', ()=> setState(s=>{ s.stage.screen='welcome'; s.stage.showAnswer=false; s.stage.timer.running=false; s.stage.timer.remaining=s.stage.timer.duration; }));
    on('startTimerBtn','click', ()=> setState(s=>{ s.stage.timer.running=true; s.stage.timer.lastTick=Date.now(); s.stage.screen='question'; }));
    on('pauseTimerBtn','click', ()=> setState(s=>{ s.stage.timer.running=false; }));
    on('resetTimerBtn','click', ()=> setState(s=>{ s.stage.timer.running=false; s.stage.timer.remaining=s.stage.timer.duration; }));
    on('correctSoundBtn','click', ()=> pulseSound('correct'));
    on('wrongSoundBtn','click', ()=> pulseSound('wrong'));
    on('tickSoundBtn','click', ()=> pulseSound('tick'));
    document.querySelectorAll('.quick-card').forEach(btn => btn.addEventListener('click', ()=> setState(s=>{ s.stage.screen = btn.dataset.stage; })));

    on('addTransactionBtn','click', ()=>{
      const teamId = val('teamTransactionSelect');
      const amount = Number(val('transactionAmount'));
      const note = val('transactionNote');
      if(!teamId || Number.isNaN(amount)) return alert('أدخل الفريق والمبلغ بشكل صحيح');
      setState(s=>{
        s.transactions.push({id:uid(), teamId, amount, note, time:new Date().toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})});
        const win = winnerTeam();
        if(win) s.stage.screen = 'winner';
      });
      setValue('transactionAmount',''); setValue('transactionNote','');
    });
    document.addEventListener('click', e=>{
      const txId = e.target?.dataset?.removeTx;
      const catId = e.target?.dataset?.removeCat;
      const teamId = e.target?.dataset?.removeTeam;
      const cardToggle = e.target?.dataset?.cardToggle;
      if(txId) setState(s=>{ s.transactions = s.transactions.filter(t=>t.id!==txId); });
      if(catId) setState(s=>{ s.categories = s.categories.filter(c=>c.id!==catId); if(s.stage.categoryId===catId) s.stage.categoryId = s.categories[0]?.id || null; });
      if(teamId) setState(s=>{ s.teams = s.teams.filter(t=>t.id!==teamId); s.transactions = s.transactions.filter(tx=>tx.teamId!==teamId); });
      if(cardToggle){
        const [tId, idx] = cardToggle.split('|');
        setState(s=>{ const team = s.teams.find(t=>t.id===tId); if(team) team.cards[Number(idx)].used = !team.cards[Number(idx)].used; });
      }
    });

    on('addCategoryBtn','click', ()=> setState(s=>{ s.categories.push(makeCategory(`فئة ${s.categories.length+1}`)); if(!s.stage.categoryId) s.stage.categoryId=s.categories[0].id; }));
    on('addTeamBtn','click', ()=> setState(s=>{ s.teams.push(makeTeam(`فريق ${s.teams.length+1}`, randomColor())); }));

    document.addEventListener('input', e=>{
      const t = e.target;
      if(t.dataset.catName){ setState(s=>{ const cat = s.categories.find(c=>c.id===t.dataset.catName); if(cat) cat.name = t.value; }); }
      if(t.dataset.question){ const [cid,diff,idx]=t.dataset.question.split('|'); setState(s=>{ const cat=s.categories.find(c=>c.id===cid); if(cat) cat[diff][Number(idx)].q=t.value; }); }
      if(t.dataset.answer){ const [cid,diff,idx]=t.dataset.answer.split('|'); setState(s=>{ const cat=s.categories.find(c=>c.id===cid); if(cat) cat[diff][Number(idx)].a=t.value; }); }
      if(t.dataset.teamName){ setState(s=>{ const team=s.teams.find(x=>x.id===t.dataset.teamName); if(team) team.name=t.value; }); }
      if(t.dataset.teamColor){ setState(s=>{ const team=s.teams.find(x=>x.id===t.dataset.teamColor); if(team) team.color=t.value; }); }
    });

    on('saveSettingsBtn','click', ()=> setState(s=>{
      s.settings.title = val('gameTitleInput') || 'قدها';
      s.settings.winScore = Number(val('winScoreInput')) || 500000;
      s.settings.welcomeMessage = val('welcomeMessageInput') || 'جاهزين؟ قدها ولا لا؟';
      s.settings.winnerMessage = val('winnerMessageInput') || 'الف مبروك يا أبطال';
    }));
    on('openDisplayBtn','click', ()=> window.open('display.html','_blank'));
    on('fullscreenDisplayBtn','click', async ()=>{ try{ await document.documentElement.requestFullscreen(); }catch(e){} });
    on('exportBtn','click', exportBackup);
    on('importInput','change', importBackup);
    on('resetBtn','click', ()=>{ if(confirm('أكيد تبي تصفر كل شيء؟')){ state = defaultState(); saveState(); render(); } });

    if(channel){ channel.onmessage = (msg)=>{ if(msg.data?.type==='state'){ state = msg.data.state; render(); } }; }
    window.addEventListener('storage', e=>{ if(e.key===STORAGE_KEY){ state = loadState(); render(); } });
  }

  function pulseSound(type){
    setState(s=>{ s.stage.soundPulse = { type, at: Date.now() }; });
    playBeep(type);
  }
  function playPulse(){
    const pulse = state.stage.soundPulse;
    if(!pulse) return;
    if(playPulse.lastAt === pulse.at) return;
    playPulse.lastAt = pulse.at;
    playBeep(pulse.type);
  }
  function playBeep(type='tick'){
    try{
      const ctx = playBeep.ctx || (playBeep.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      const map = {
        correct:[880,.18,'triangle'],
        wrong:[220,.28,'sawtooth'],
        tick:[520,.08,'square']
      };
      const [freq,duration,wave] = map[type] || map.tick;
      o.type = wave; o.frequency.value = freq;
      g.gain.setValueAtTime(.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(.18, ctx.currentTime + .01);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration);
      o.start(); o.stop(ctx.currentTime + duration);
    }catch(e){}
  }

  function runTimerLoop(){
    setInterval(()=>{
      if(!state.stage.timer.running) return;
      const now = Date.now();
      const last = state.stage.timer.lastTick || now;
      if(now - last >= 1000){
        state.stage.timer.lastTick = now;
        state.stage.timer.remaining = Math.max(0, state.stage.timer.remaining - 1);
        if(state.stage.timer.remaining > 0 && state.stage.timer.remaining <= 5) playBeep('tick');
        if(state.stage.timer.remaining === 0){
          state.stage.timer.running = false;
          pulseSound('wrong');
        }
        saveState();
        render();
      }
    }, 250);
  }

  function exportBackup(){
    const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'qadaha-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importBackup(e){
    const file = e.target.files?.[0];
    if(!file) return;
    const fr = new FileReader();
    fr.onload = ()=>{
      try{ state = deepMerge(defaultState(), JSON.parse(fr.result)); saveState(); render(); }
      catch(err){ alert('ملف النسخة الاحتياطية غير صالح'); }
    };
    fr.readAsText(file);
  }

  function setText(id, value){ const el = document.getElementById(id); if(el) el.textContent = value ?? ''; }
  function setValue(id, value){ const el = document.getElementById(id); if(el) el.value = value ?? ''; }
  function val(id){ return document.getElementById(id)?.value || ''; }
  function on(id, ev, fn){ const el = document.getElementById(id); if(el) el.addEventListener(ev, fn); }
  function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
  function clamp(v,min,max){ return Math.min(max, Math.max(min, v)); }
  function randomColor(){ return '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'); }

  attachEvents();
  runTimerLoop();
  render();
})();
