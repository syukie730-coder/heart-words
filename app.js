(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const PREFIX = 'heart-words:v1:entry:';
  const DRAFT = 'heart-words:v1:draft';
  const fields = ['date', 'words', 'speaker', 'thoughts'];
  let entries = [], timer, dirty = false, blocked = false, formLoaded = false, editingId = null, currentId = null, lastDeleted = null, undoTimer;
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
  function validFields(data) { return data && fields.every(f => typeof data[f] === 'string') && validDate(data.date); }
  function formatDate(value) { const [y,m,d] = value.split('-').map(Number); return `${y}年${m}月${d}日`; }
  function notice(text = '', error = false) { $('notice').hidden = !text; $('notice').textContent = text; $('notice').classList.toggle('error', error); }
  function values() { return Object.fromEntries(fields.map(f => [f,$(f).value])); }
  function saveDraft() {
    clearTimeout(timer);
    if (!dirty || blocked || editingId) return;
    try { localStorage.setItem(DRAFT, JSON.stringify(values())); dirty = false; $('draft-status').textContent = '書きかけも、この端末に保存されています。'; }
    catch { $('draft-status').textContent = '書きかけを保存できません。画面を閉じずに、文章を控えてください。'; }
  }
  function loadEntries() {
    entries = [];
    let unreadable = 0;
    try {
      for (let i=0; i<localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        try {
          const item = JSON.parse(localStorage.getItem(key));
          if (!validFields(item) || typeof item.id !== 'string' || key !== PREFIX + item.id || typeof item.createdAt !== 'string') throw new Error('invalid');
          entries.push(item);
        } catch { unreadable++; }
      }
      entries.sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      if (unreadable) notice('一部の記録を読み込めませんでした。保存済みのデータは変更していません。', true);
    } catch { notice('記録を読み込めません。このブラウザで保存が許可されているか確認してください。', true); }
  }
  function renderList() {
    loadEntries();
    $('count').textContent = `${entries.length}件`;
    $('empty').hidden = entries.length > 0;
    $('entries').replaceChildren();
    for (const item of entries) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'entry-card';
      const date = document.createElement('time'); date.dateTime = item.date; date.textContent = formatDate(item.date);
      const words = document.createElement('span'); words.className = 'card-words'; words.textContent = item.words;
      const bottom = document.createElement('span'); bottom.className = 'card-bottom';
      const speaker = document.createElement('span'); speaker.className = 'card-speaker'; speaker.textContent = item.speaker || '誰の言葉かは未記入';
      const open = document.createElement('span'); open.className = 'card-open'; open.textContent = '読む 〉';
      bottom.append(speaker,open); card.append(date,words,bottom);
      card.addEventListener('click',()=> { location.hash = `entry/${encodeURIComponent(item.id)}`; });
      $('entries').append(card);
    }
    try { $('add').textContent = localStorage.getItem(DRAFT) ? '書きかけの言葉を続ける' : '＋ 言葉を残す'; } catch { /* Reading error already visible. */ }
  }
  function setFormTexts(editing) {
    $('form-heading').textContent = editing ? '言葉を直す' : '心に残った言葉を残す';
    $('save').textContent = editing ? '直した内容を保存する' : 'この言葉を保存する';
  }
  function findEntry(id) { loadEntries(); return entries.find(e => e.id === id); }
  function hashId(hash, prefix) { try { return decodeURIComponent(hash.slice(prefix.length)); } catch { return ''; } }
  function loadEdit(item) {
    editingId = item.id; blocked = false; dirty = false; formLoaded = false; clearTimeout(timer);
    for (const field of fields) { $(field).value = item[field]; $(field).disabled = false; $(field).setCustomValidity(''); }
    $('save').disabled = false;
    setFormTexts(true);
    $('draft-status').textContent = '直したら、下の保存ボタンを押してください。';
  }
  function loadForm() {
    if (formLoaded) return;
    setFormTexts(false);
    blocked = false;
    let draft = null;
    try {
      const raw = localStorage.getItem(DRAFT);
      if (raw) { draft = JSON.parse(raw); if (!draft || !fields.every(f => typeof draft[f] === 'string')) throw new Error('invalid draft'); }
    } catch { blocked = true; notice('書きかけを読み込めませんでした。上書きを防ぐため、入力を止めています。', true); }
    for (const field of fields) { $(field).value = draft ? draft[field] : field === 'date' ? today() : ''; $(field).disabled = blocked; }
    $('save').disabled = blocked;
    $('draft-status').textContent = draft ? '書きかけの言葉を開きました。' : '日付と言葉だけでも残せます。';
    formLoaded = true;
  }
  function route(focus = true) {
    if (document.body.dataset.view === 'form') saveDraft();
    const hash = location.hash.slice(1);
    if (editingId && !hash.startsWith('edit/')) { editingId = null; dirty = false; formLoaded = false; clearTimeout(timer); }
    let view = hash === 'new' || hash.startsWith('edit/') ? 'form' : hash.startsWith('entry/') ? 'detail' : 'list';
    if (hash.startsWith('edit/')) {
      const item = findEntry(hashId(hash,'edit/'));
      if (!item) { view = 'list'; editingId = null; notice('この記録が見つかりませんでした。一覧から選び直してください。',true); }
      else if (editingId !== item.id) loadEdit(item);
    }
    else if (view === 'form') loadForm();
    else if (view === 'detail') {
      const item = findEntry(hashId(hash,'entry/'));
      currentId = item ? item.id : null;
      if (!item) { view = 'list'; notice('この記録が見つかりませんでした。一覧から選び直してください。',true); }
      else { $('read-date').textContent = formatDate(item.date); for (const f of ['words','speaker','thoughts']) $(`read-${f}`).textContent = item[f] || 'まだ書いていません'; }
    }
    if (view === 'list') renderList();
    for (const v of ['list','form','detail']) $(`${v}-view`).hidden = view !== v;
    document.body.dataset.view = view;
    document.title = `${view === 'form' ? '言葉を残す' : view === 'detail' ? '言葉を読む' : 'わたしの言葉'}｜心に残る言葉`;
    window.scrollTo(0,0);
    if (focus) $(`${view === 'form' ? 'form' : view === 'detail' ? 'detail' : 'list'}-heading`).focus({preventScroll:true});
  }
  function add() { notice(); location.hash = 'new'; }
  $('add').addEventListener('click',add);
  document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click',add));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click',()=> { notice(); location.hash = editingId && document.body.dataset.view === 'form' ? `entry/${encodeURIComponent(editingId)}` : ''; }));
  for (const field of fields) $(field).addEventListener('input',()=> { $(field).setCustomValidity(''); dirty = true; if (editingId) return; $('draft-status').textContent = '書きかけを保存しています…'; clearTimeout(timer); timer = setTimeout(saveDraft,350); });
  $('edit').addEventListener('click',()=> { if (!currentId) return; notice(); location.hash = `edit/${encodeURIComponent(currentId)}`; });
  function hideUndo() { clearTimeout(undoTimer); $('undo').hidden = true; lastDeleted = null; }
  $('delete').addEventListener('click',()=> {
    const item = currentId && findEntry(currentId);
    if (!item) return;
    const preview = item.words.length > 30 ? item.words.slice(0,30) + '…' : item.words;
    if (!confirm(`本当に消しますか？\n\n「${preview}」`)) return;
    try { localStorage.removeItem(PREFIX+item.id); }
    catch { notice('消せませんでした。もう一度お試しください。',true); return; }
    hideUndo();
    lastDeleted = item;
    notice();
    location.hash = '';
    $('undo').hidden = false;
    undoTimer = setTimeout(hideUndo,8000);
  });
  $('undo-button').addEventListener('click',()=> {
    const item = lastDeleted;
    if (!item) return;
    try { localStorage.setItem(PREFIX+item.id,JSON.stringify(item)); }
    catch { notice('元に戻せませんでした。もう一度「元に戻す」を押してください。',true); return; }
    hideUndo();
    notice('元に戻しました。');
    location.hash = `entry/${encodeURIComponent(item.id)}`;
  });
  $('entry-form').addEventListener('submit',event => {
    event.preventDefault(); if (blocked) return;
    const data = values();
    if (!data.words.trim()) { $('words').setCustomValidity('心に残った言葉を入力してください。'); $('words').reportValidity(); return; }
    if (!validDate(data.date)) { $('date').setCustomValidity('日付を選んでください。'); $('date').reportValidity(); return; }
    $('save').disabled = true; clearTimeout(timer);
    if (editingId) {
      const old = findEntry(editingId);
      if (!old) { $('save').disabled = false; notice('元の記録が見つかりませんでした。',true); return; }
      const updated = {...old, ...data, updatedAt:new Date().toISOString()};
      try { localStorage.setItem(PREFIX+old.id,JSON.stringify(updated)); }
      catch { $('save').disabled = false; notice('保存できませんでした。直した文章は残っています。もう一度保存してください。',true); return; }
      editingId = null; dirty = false; formLoaded = false;
      notice('直した内容を保存しました。');
      location.hash = `entry/${encodeURIComponent(old.id)}`;
      return;
    }
    const item = {...data, id:crypto.randomUUID(), createdAt:new Date().toISOString()};
    try { localStorage.setItem(PREFIX+item.id,JSON.stringify(item)); }
    catch { $('save').disabled = false; notice('保存できませんでした。入力した文章は残っています。画面を閉じずに、もう一度保存してください。',true); return; }
    dirty = false;
    try { localStorage.removeItem(DRAFT); } catch { /* The complete entry has already been saved. */ }
    formLoaded = false;
    notice('大切な言葉を保存しました。');
    location.hash = `entry/${encodeURIComponent(item.id)}`;
  });
  window.addEventListener('hashchange',()=>route());
  document.addEventListener('visibilitychange',()=> { if (document.hidden) saveDraft(); });
  window.addEventListener('pagehide',saveDraft);
  window.addEventListener('beforeunload',event=> { saveDraft(); if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage',event=> { if (event.key?.startsWith(PREFIX) && document.body.dataset.view !== 'form') route(false); });
  route(false);
  if (document.modelContext?.registerTool) {
    try {
      Promise.resolve(document.modelContext.registerTool({
        name:'read_heart_words', title:'保存した言葉を読む',
        description:'この端末の「心に残る言葉」に保存されている記録を読みます。idを指定すると1件、指定しないと全件を返します。変更はしません。',
        inputSchema:{type:'object',properties:{id:{type:'string',minLength:1}},additionalProperties:false},
        annotations:{readOnlyHint:true,untrustedContentHint:true},
        execute(input) {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k=>k !== 'id') || ('id' in input && (typeof input.id !== 'string' || !input.id))) throw new Error('idは空ではない文字列で指定してください。');
          const result=[];
          for (let i=0;i<localStorage.length;i++) { const key=localStorage.key(i); if (!key?.startsWith(PREFIX)) continue; const item=JSON.parse(localStorage.getItem(key)); if (!validFields(item) || key !== PREFIX+item.id) throw new Error('記録を読み込めません。'); result.push(item); }
          if (input.id) { const item=result.find(e=>e.id===input.id); if (!item) throw new Error('記録が見つかりません。'); return item; }
          return result.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
        }
      })).catch(()=>{});
    } catch { /* Optional browser integration. */ }
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(()=> {});
})();
