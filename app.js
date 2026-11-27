import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = v => Array.isArray(v) ? v : String(v || '').split(/\n|,/).map(x => x.trim()).filter(Boolean);
const stamp = t => new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const ADJ = ['푸른', '반짝', '용감한', '졸린', '수줍은', '신난', '느긋한', '동그란', '상큼한', '든든한'];
const NOUN = ['말차', '감귤', '돌하르방', '동백', '한라봉', '파도', '오름', '창업가', '멘토', '유채'];
const rnick = () => ADJ[Math.random() * ADJ.length | 0] + NOUN[Math.random() * NOUN.length | 0] + (10 + Math.random() * 90 | 0);
// 작성자 표시: 이름 또는 닉네임 (방명록·사진첩 공통). 마지막 선택과 입력값을 기기에 기억해요.
function whoPicker(k) {
  const mode = store.get('whoMode') === 'nick' ? 'nick' : 'name';
  return `<div class="row who"><div class="seg" role="radiogroup" aria-label="작성자 표시"><label><input type="radio" name="${k}mode" value="name" ${mode === 'name' ? 'checked' : ''}>이름</label><label><input type="radio" name="${k}mode" value="nick" ${mode === 'nick' ? 'checked' : ''}>닉네임</label></div>
    <input class="nick" id="${k}Author" maxlength="20" aria-label="작성자"><button type="button" class="btn ghost small" id="${k}Reroll">새로 뽑기</button></div>`;
}
function bindWho(k) {
  const inp = document.getElementById(k + 'Author'), rr = document.getElementById(k + 'Reroll');
  const mode = () => app.querySelector(`[name=${k}mode]:checked`).value;
  const apply = () => {
    const m = mode(); store.set('whoMode', m);
    if (m === 'name') { inp.placeholder = '이름을 적어 주세요'; inp.value = store.get('name') || ''; inp.autocomplete = 'name'; rr.hidden = true; }
    else { inp.placeholder = '닉네임'; inp.value = store.get('nick') || rnick(); inp.autocomplete = 'off'; rr.hidden = false; }
  };
  app.querySelectorAll(`[name=${k}mode]`).forEach(r => r.onchange = apply);
  rr.onclick = () => { inp.value = rnick(); };
  apply();
  return () => { const v = inp.value.trim(); if (!v) { inp.focus(); return null; } store.set(mode(), v); return v; };
}
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

const store = {
  get(k) { try { return localStorage.getItem('mangle.' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('mangle.' + k) : localStorage.setItem('mangle.' + k, v); } catch { } },
};
const sess = {
  get(k) { try { return sessionStorage.getItem('mangle.' + k); } catch { return S.mem[k] ?? null; } },
  set(k, v) { try { v == null ? sessionStorage.removeItem('mangle.' + k) : sessionStorage.setItem('mangle.' + k, v); } catch { S.mem[k] = v; } },
};

const configured = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(SUPABASE_URL) && !SUPABASE_ANON_KEY.startsWith('YOUR');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;

const S = { mem: {}, booths: {}, ready: false, gb: [], photos: [], liked: new Set(), sort: 'new', cards: [], visits: { today: 0, total: 0 }, tab: 'home', cur: null, editing: false, sent: {}, admin: { stats: {}, issued: [] } };
const app = $('#app');
const visitor = store.get('visitor') || (() => { const v = uuid(); store.set('visitor', v); return v; })();
const route = () => decodeURIComponent(location.hash.slice(1)).replace(/[^a-z0-9-]/gi, '').toLowerCase();
const note = t => { $('#banner').hidden = !t; $('#bannerText').textContent = t || ''; };
const pinOf = id => store.get('pin.' + id);
const errMsg = e => {
  const m = (e && (e.message || e.error_description)) || '';
  if (m.includes('locked')) return '비밀번호를 여러 번 틀려서 10분 동안 잠겼어요. 잠시 후 다시 시도해 주세요.';
  if (m.includes('denied')) return '비밀번호가 맞지 않아요.';
  if (m.includes('already initialized')) return '관리자 비밀번호가 이미 만들어져 있어요.';
  if (m.includes('too short')) return '관리자 비밀번호는 8자 이상이어야 해요.';
  if (m.includes('Payload too large') || m.includes('exceeded')) return '사진 용량이 너무 커요. 5MB 이하로 올려 주세요.';
  return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
};
const toBooth = r => ({ ...(r.profile || {}), id: r.id, no: r.no || '', name: r.name, img: r.logo_url || '', fit: r.logo_fit || 'contain' });

// ---------- 현재 단계 배지 ----------
const STAGES = [['idea', '아이디어'], ['proto', '시제품'], ['live', '운영 중']];
const stageBadge = b => { const st = STAGES.find(([k]) => k === b.stage); return st ? `<span class="stage stage-${st[0]}">${st[1]}</span>` : ''; };

// ---------- 공통 그림 ----------
const fit = b => b.img && b.fit === 'fill' ? ' fill' : '';
function monogram(b, small) {
  const t = esc((b.short || (b.name || '?').replace(/^TEAM\s+/i, '')).replace(/\s/g, '').slice(0, 2).toUpperCase());
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${esc(b.name)} 로고 자리"><rect width="100" height="100" fill="#111"/><text x="50" y="${small ? 62 : 60}" text-anchor="middle" font-family="Space Grotesk, Noto Sans KR" font-weight="700" font-size="${small ? 34 : 30}" fill="#fff">${t}</text>${small ? '' : '<text x="50" y="84" text-anchor="middle" font-family="Noto Sans KR" font-size="8" fill="#999">로고 준비 중</text>'}</svg>`;
}
const imgTag = (src, alt) => src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : '';
const thumb = (b, small) => b.img ? imgTag(b.img, b.name + ' 로고') : monogram(b, small);

function room(b) {
  const sign = esc((b.short || b.name).slice(0, 14)); const L = 'stroke="#111" stroke-width="1.6" stroke-linejoin="round"';
  return `<svg viewBox="0 -20 400 280" role="img" aria-label="${esc(b.name)} 부스 미니룸">
<defs><pattern id="fl" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)"><path d="M0 0H18V18" fill="none" stroke="#d6d6d3" stroke-width="1"/></pattern></defs>
<polygon points="20,170 20,50 200,-18 200,100" fill="#f4f4f2" ${L}/><polygon points="200,100 200,-18 380,50 380,170" fill="#ebebe8" ${L}/>
<polygon points="20,170 200,100 380,170 200,240" fill="#fff" ${L}/><polygon points="20,170 200,100 380,170 200,240" fill="url(#fl)"/>
<polygon points="250,40 330,70 330,120 250,90" fill="#fff" ${L}/><line x1="290" y1="55" x2="290" y2="105" ${L}/><line x1="250" y1="65" x2="330" y2="95" ${L}/>
<g transform="matrix(.935,-.355,0,1,48,92)"><rect width="124" height="32" rx="6" fill="#111"/><text x="62" y="21" text-anchor="middle" font-family="Space Grotesk, Noto Sans KR" font-weight="700" font-size="${sign.length > 10 ? 11 : 13}" fill="#fff">${sign}</text></g>
<ellipse cx="200" cy="214" rx="80" ry="14" fill="#0000000f"/>
<polygon points="130,150 200,124 270,150 200,176" fill="#fff" ${L}/><polygon points="130,150 200,176 200,214 130,188" fill="#111" ${L}/><polygon points="200,176 270,150 270,188 200,214" fill="#3a3a3a" ${L}/>
<rect x="186" y="131" width="22" height="19" rx="4" fill="#fff" ${L}/><ellipse cx="197" cy="132" rx="11" ry="4" fill="#111"/>
<rect x="222" y="139" width="28" height="8" rx="2" fill="#fff" ${L} transform="rotate(-20 236 143)"/>
<g><ellipse cx="335" cy="192" rx="18" ry="5" fill="#0000000f"/><path d="M322 166h26l-4 25h-18z" fill="#fff" ${L}/><circle cx="328" cy="152" r="12" fill="#fff" ${L}/><circle cx="343" cy="146" r="13" fill="#fff" ${L}/><circle cx="336" cy="134" r="11" fill="#111"/></g>
<g class="minime" id="roomHost"><ellipse cx="92" cy="201" rx="14" ry="4" fill="#0000000f"/><rect x="82" y="168" width="20" height="28" rx="8" fill="#111"/><circle cx="92" cy="155" r="14" fill="#fff" ${L}/><path d="M78 153q14-18 28 0" fill="#111"/><circle cx="87" cy="157" r="1.8" fill="#111"/><circle cx="97" cy="157" r="1.8" fill="#111"/></g>
</svg>`;
}

// ---------- 미니룸 손님 (실시간 방명록) ----------
// 방 바닥 위 자리 (SVG 좌표). 최신 글이 앞자리부터 차지하고, 새 글이 오면 다들 한 칸씩 옮겨 가요.
const SLOTS = [[150, 228], [255, 226], [100, 206], [300, 196], [60, 174], [292, 150]];
const hashN = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
function avatar(seed) {
  const v = hashN(seed), L = 'stroke="#111" stroke-width="1.6" stroke-linejoin="round"';
  const hair = [
    '<path d="M4 14q8-13 16 0z" fill="#111"/>',
    '<path d="M4 18q-1-13 8-13t8 13h-3q-1-6-5-7-4 1-5 7z" fill="#111"/>',
    '<path d="M4 13l3-6 2 3 3-6 3 6 2-3 3 6z" fill="#111"/>',
    '<circle cx="12" cy="4" r="3" fill="#111"/><path d="M4 13q8-10 16 0z" fill="#111"/>',
  ][v % 4];
  return `<svg viewBox="0 0 24 42" aria-hidden="true"><ellipse cx="12" cy="40" rx="8" ry="2.2" fill="#0000001a"/><rect x="5" y="22" width="14" height="17" rx="6" fill="${(v >> 2) % 2 ? '#111' : '#fff'}" ${L}/><circle cx="12" cy="14" r="8" fill="#fff" ${L}/>${hair}<circle cx="9" cy="15.5" r="1.1" fill="#111"/><circle cx="15" cy="15.5" r="1.1" fill="#111"/></svg>`;
}
function fillRoom(fresh = []) {
  const el = $('#crowd'); if (!el) return;
  const list = S.gb.slice(0, SLOTS.length);
  $('#roomHost')?.classList.toggle('gone', list.length > 0);
  if ($('#liveCount')) $('#liveCount').textContent = S.gb.length;
  const keep = new Set(list.map(g => g.id));
  el.querySelectorAll('.guest').forEach(n => { if (!keep.has(n.dataset.id)) n.remove(); });
  list.forEach((g, i) => {
    let n = el.querySelector(`.guest[data-id="${CSS.escape(g.id)}"]`);
    if (!n) {
      n = document.createElement('div'); n.className = 'guest enter'; n.dataset.id = g.id;
      n.innerHTML = `<div class="bubble"><b></b><span></span></div>${avatar(g.nick + g.id)}`;
      n.querySelector('b').textContent = g.nick;
      n.querySelector('span').textContent = g.msg.length > 34 ? g.msg.slice(0, 34) + '…' : g.msg;
      el.appendChild(n); n.getBoundingClientRect(); requestAnimationFrame(() => n.classList.remove('enter'));
    }
    const [x, y] = SLOTS[i];
    n.style.left = (x / 400 * 100) + '%'; n.style.top = ((y + 20) / 280 * 100) + '%'; n.style.zIndex = y;
    n.classList.toggle('right', x > 230);
  });
  fresh.forEach(id => speak(id, 6000));
}
function speak(id, ms = 3200) {
  const n = $('#crowd')?.querySelector(`.guest[data-id="${CSS.escape(id)}"]`); if (!n) return;
  n.classList.add('talk'); clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('talk'), ms);
}
let chatter = null, chatIdx = 0;
function startChatter() {
  clearInterval(chatter);
  chatter = setInterval(() => {
    const g = $('#crowd')?.querySelectorAll('.guest'); if (!g || !g.length || document.visibilityState !== 'visible') return;
    chatIdx = (chatIdx + 1) % g.length; speak(g[chatIdx].dataset.id);
  }, 1800);
}

// ---------- 데이터 ----------
// 부스 목록은 디렉터리·파도타기에 필요한 가벼운 정보만 불러오고 (75개 부스여도 수 KB),
// 소개글 전체는 지금 보고 있는 부스 하나만 따로 불러와요.
async function loadBooths() {
  const { data, error } = await sb.from('booths').select('id,no,name,logo_url,logo_fit,tagline:profile->>tagline,short:profile->>short,stage:profile->>stage').order('no');
  if (error) { note('부스 정보를 불러오지 못했어요. 잠시 후 새로고침해 주세요.'); return; }
  const prev = S.booths;
  S.booths = Object.fromEntries(data.map(r => [r.id, prev[r.id]?._full ? prev[r.id] : toBooth({ ...r, profile: { tagline: r.tagline || '', short: r.short || '', stage: r.stage || '' } })])); S.ready = true;
}
async function loadBooth(id) {
  const { data, error } = await sb.from('booths').select('id,no,name,profile,logo_url,logo_fit').eq('id', id).maybeSingle();
  if (!error && data) { S.booths[id] = { ...toBooth(data), _full: true }; if (route() === id) renderBooth(id); }
}
async function loadGb(id) {
  const { data, error } = await sb.from('guestbook').select('id,nick,msg,created_at').eq('booth_id', id).order('created_at', { ascending: false }).limit(200);
  if (!error && route() === id) {
    const old = new Set(S.gb.map(g => g.id));
    const fresh = S.gbLoaded === id ? data.filter(g => !old.has(g.id)).map(g => g.id) : [];
    S.gb = data; S.gbLoaded = id; fillGb(); fillRecent(); fillRoom(fresh);
  }
}
async function loadPhotos(id) {
  const { data, error } = await sb.from('photos').select('id,url,thumb_url,caption,nick,by_team,like_count,created_at').eq('booth_id', id).order('created_at', { ascending: false }).limit(120);
  if (!error && route() === id) { S.photos = data; fillStrip(); fillAlbum(); }
  const { data: mine } = await sb.rpc('my_likes', { p_booth: id, p_visitor: visitor });
  if (mine && route() === id) { S.liked = new Set(mine.map(x => typeof x === 'string' ? x : x.my_likes)); syncLikes(); }
}
async function loadVisit(id) {
  const { data } = await sb.rpc('record_visit', { p_booth: id, p_visitor: visitor });
  if (data && route() === id) { S.visits = data; if ($('#cToday')) { $('#cToday').textContent = data.today; $('#cTotal').textContent = data.total; } }
}
async function loadCards(id) {
  const pin = pinOf(id); if (!pin) return;
  const { data, error } = await sb.rpc('get_cards', { p_booth: id, p_pin: pin });
  if (error) { if (errMsg(error).includes('맞지')) { store.set('pin.' + id, null); render(); } return; }
  S.cards = data; fillCards();
}
async function upload(folder, blob, name) {
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${name || (folder === 'logos' ? route() + '-' : '') + uuid()}.${ext}`;
  const { error } = await sb.storage.from('uploads').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return sb.storage.from('uploads').getPublicUrl(path).data.publicUrl;
}
async function shrink(f, max = 1600, q = .88) {
  try {
    const bm = await createImageBitmap(f); const k = Math.min(1, max / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas'); c.width = bm.width * k | 0; c.height = bm.height * k | 0;
    const png = /png|svg/.test(f.type); const x = c.getContext('2d'); if (!png) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(bm, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(o => r(o || f), png ? 'image/png' : 'image/jpeg', q));
  } catch { return f; }
}

// ---------- PIN 입력 창 ----------
function askPin({ title, hint, check }) {
  const dlg = $('#pinDlg'), input = $('#pinInput'), err = $('#pinErr');
  $('#pinTitle').textContent = title; $('#pinHint').textContent = hint; input.value = ''; err.textContent = '';
  input.inputMode = title.includes('관리자') ? 'text' : 'numeric';
  return new Promise(resolve => {
    const done = v => { dlg.close(); $('#pinForm').onsubmit = null; resolve(v); };
    $('#pinCancel').onclick = () => done(null);
    dlg.oncancel = () => resolve(null);
    $('#pinForm').onsubmit = async e => {
      e.preventDefault(); const pin = input.value.trim(); if (!pin) return;
      $('#pinOk').disabled = true; err.textContent = '';
      try { const ok = await check(pin); if (ok) done(pin); else err.textContent = '비밀번호가 맞지 않아요.'; }
      catch (x) { err.textContent = errMsg(x); }
      $('#pinOk').disabled = false;
    };
    dlg.showModal(); input.focus();
  });
}

// ---------- 화면: 디렉터리 ----------
function renderDir() {
  const list = Object.values(S.booths).sort((a, b) => String(a.no).localeCompare(String(b.no), 'ko', { numeric: true }));
  app.innerHTML = `<div class="dirpanel">
  <div class="head"><h1>부스 디렉터리<small>부스의 QR을 찍으면 그 팀 미니홈피로 바로 연결돼요</small></h1></div>
  ${list.length ? `<ul class="dir">${list.map(b => `<li><a href="#${esc(b.id)}"><span class="th${fit(b)}">${thumb(b, 1)}</span><span><span class="bn">BOOTH ${esc(b.no || '--')} ${stageBadge(b)}</span><b>${esc(b.name)}</b><small>${esc(b.tagline || '')}</small></span></a></li>`).join('')}</ul>`
      : `<p class="empty">${S.ready ? '아직 등록된 부스가 없어요.' : '부스 목록을 불러오는 중이에요…'}</p>`}
  </div>`;
}

// ---------- 화면: 미니홈피 ----------
function renderBooth(id) {
  const b = S.booths[id];
  if (!b) { app.innerHTML = `<div class="dirpanel"><p class="empty">${S.ready ? '이 주소의 부스를 찾을 수 없어요.' : '미니홈피를 불러오는 중이에요…'}</p><a class="btn ghost" href="#" style="justify-self:start">전체 부스 보기</a></div>`; return; }
  const team = !!pinOf(id);
  const others = Object.values(S.booths).filter(o => o.id !== id).sort((a, c) => String(a.no).localeCompare(String(c.no), 'ko', { numeric: true }));
  const T = [['home', '홈'], ['brand', '소개'], ['gb', '방명록'], ['card', '명함'], ['album', '사진첩']];
  document.title = `${b.name}의 미니홈피 · 멩글아케이드`;
  app.innerHTML = `<div class="frame">
  <aside class="panel side">
    <div class="count"><div><span>TODAY</span><b id="cToday">${S.visits.today}</b></div><div><span>TOTAL</span><b id="cTotal">${S.visits.total}</b></div></div>
    <div class="photo${fit(b)}">${thumb(b)}</div>
    <div class="mood"><span>오늘의 기분</span><br>${esc(b.mood || '—')}</div>
    <p class="intro" style="margin:0;font-size:14px">${esc(b.intro || '')}</p>
    <ul class="meta">
      ${b.founders ? `<li><span>팀원</span>${esc(b.founders)}</li>` : ''}${b.founded ? `<li><span>시작</span>${esc(b.founded)}</li>` : ''}
      ${b.insta ? `<li><span>인스타</span><a href="https://instagram.com/${esc(b.insta.replace(/^@/, ''))}" target="_blank" rel="noopener">@${esc(b.insta.replace(/^@/, ''))}</a></li>` : ''}
      ${b.web ? `<li><span>웹</span><a href="${esc(/^https?:/.test(b.web) ? b.web : 'https://' + b.web)}" target="_blank" rel="noopener">${esc(b.web.replace(/^https?:\/\//, ''))}</a></li>` : ''}
    </ul>
    <div class="surf"><select id="surf" aria-label="다른 부스로 파도타기"><option value="">파도타기 → 다른 부스</option>${others.map(o => `<option value="${esc(o.id)}">${esc(o.no ? o.no + ' · ' : '')}${esc(o.name)}</option>`).join('')}</select></div>
  </aside>
  <section class="panel main">
    <div class="head"><h1>${esc(b.name)}의 미니홈피<small>${esc(b.tagline || '')}</small></h1>
      <div class="row">${b.no ? `<span class="no">BOOTH ${esc(b.no)}</span>` : ''}${stageBadge(b)}
      ${team ? `<button class="btn ghost small" id="editBtn">${S.editing ? '닫기' : '관리'}</button><button class="btn ghost small" id="logout">로그아웃</button>` : `<button class="btn ghost small" id="login">팀 로그인</button>`}</div></div>
    <div id="body" class="main"></div>
  </section>
  <nav class="tabs" role="tablist" aria-label="미니홈피 메뉴">${T.map(([k, l]) => `<button role="tab" aria-selected="${S.tab === k && !S.editing}" data-tab="${k}">${l}</button>`).join('')}</nav>
  </div>`;
  app.querySelectorAll('[data-tab]').forEach(x => x.onclick = () => { S.tab = x.dataset.tab; S.editing = false; renderBooth(id); });
  $('#surf').onchange = e => { if (e.target.value) location.hash = e.target.value; };
  $('#editBtn')?.addEventListener('click', () => { S.editing = !S.editing; renderBooth(id); });
  $('#logout')?.addEventListener('click', () => { store.set('pin.' + id, null); S.editing = false; S.cards = []; renderBooth(id); });
  $('#login')?.addEventListener('click', async () => {
    const pin = await askPin({ title: '팀 로그인', hint: `${b.name} 팀 PIN을 입력해 주세요. 이 기기에서는 로그아웃 전까지 유지돼요.`, check: async p => { const { data, error } = await sb.rpc('verify_pin', { p_booth: id, p_pin: p }); if (error) throw error; return data; } });
    if (pin) { store.set('pin.' + id, pin); renderBooth(id); if (S.tab === 'card') loadCards(id); }
  });
  S.editing && team && b._full ? renderEdit(id, b) : renderTab(id, b);
}

function renderTab(id, b) {
  const el = $('#body');
  if (S.tab === 'home') {
    el.innerHTML = `<div class="room"><span class="live"><i></i>LIVE 방명록 <b id="liveCount">${S.gb.length}</b></span>${room(b)}<div class="crowd" id="crowd"></div></div>
    <div class="box"><div class="boxhead"><h2>사진첩 <em id="phCount">${S.photos.length}</em></h2><button class="link" id="toAlbum">전체 보기 →</button></div><div class="strip" id="strip"></div></div>
    <div class="box"><h2>최근 방명록 <em id="gbCount">${S.gb.length}</em></h2><div id="recent"></div></div>`;
    $('#toAlbum').onclick = () => { S.tab = 'album'; renderBooth(id); };
    fillRecent(); fillStrip(); fillRoom(); if (S.gb[0]) setTimeout(() => speak(S.gb[0].id), 500);
  }
  if (S.tab === 'brand' && !b._full) el.innerHTML = '<p class="empty">불러오는 중…</p>';
  else if (S.tab === 'brand') {
    el.innerHTML = `${b.slogan ? `<p class="quote">“${esc(b.slogan)}”</p>` : ''}
    <div class="box"><h2>우리가 풀고 싶은 문제</h2><p>${esc(b.story || '아직 작성되지 않았어요.')}</p></div>
    ${lines(b.values).length ? `<div><h2>핵심 키워드</h2><ul class="chips">${lines(b.values).map(v => `<li>${esc(v)}</li>`).join('')}</ul></div>` : ''}
    <div class="two">${lines(b.products).length ? `<div class="box"><h2>해결 방법 · 시제품</h2><ul class="list">${lines(b.products).map(v => `<li>${esc(v)}</li>`).join('')}</ul></div>` : ''}
    ${lines(b.certs).length || b.impact ? `<div class="box"><h2>성과 · 앞으로의 계획</h2>${lines(b.certs).length ? `<ul class="chips" style="margin-bottom:10px">${lines(b.certs).map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}<p>${esc(b.impact || '')}</p></div>` : ''}</div>
    <ul class="meta">${b.regions ? `<li><span>활동 지역</span>${esc(b.regions)}</li>` : ''}${b.company ? `<li><span>소속</span>${esc(b.company)}</li>` : ''}</ul>
    ${id === 'supermatcha' ? '<p class="note">테스트용 예시 — 슈퍼말차 공식 홈페이지 브랜드 소개를 요약해 넣었어요.</p>' : ''}`;
  }
  if (S.tab === 'gb') {
    el.innerHTML = `<form class="gbform" id="gbf">
    ${whoPicker('g')}
    <textarea id="msg" maxlength="500" required aria-label="방명록 내용" placeholder="${esc(b.name)} 팀에게 응원이나 피드백을 남겨 주세요"></textarea>
    <div class="row"><button class="btn cta" id="gbBtn">방명록 남기기</button><span class="note" id="gbMsg" role="status"></span></div></form>
    <div><h2>방명록 <em id="gbCount">${S.gb.length}</em></h2><ul class="gb" id="gbList"></ul></div>`;
    const author = bindWho('g');
    $('#gbf').onsubmit = async e => {
      e.preventDefault(); const msg = $('#msg').value.trim(); if (!msg) return;
      const nick = author(); if (!nick) { $('#gbMsg').textContent = '이름이나 닉네임을 적어 주세요.'; return; }
      $('#gbBtn').disabled = true;
      const { error } = await sb.from('guestbook').insert({ booth_id: id, nick, msg });
      if (error) $('#gbMsg').textContent = errMsg(error); else { $('#msg').value = ''; $('#gbMsg').textContent = '남겼어요!'; await loadGb(id); }
      $('#gbBtn').disabled = false;
    };
    fillGb();
  }
  if (S.tab === 'card') renderCard(id, b);
  if (S.tab === 'album') renderAlbum(id, b);
}

function fillRecent() {
  const el = $('#recent'); if (!el) return; $('#gbCount').textContent = S.gb.length;
  el.innerHTML = S.gb.length ? `<ul class="list" style="list-style:none;padding:0">${S.gb.slice(0, 3).map(g => `<li><b>${esc(g.nick)}</b> ${esc(g.msg.length > 40 ? g.msg.slice(0, 40) + '…' : g.msg)}</li>`).join('')}</ul>` : '<p class="empty">첫 방명록을 남겨 주세요.</p>';
}
function fillGb() {
  const el = $('#gbList'); if (!el) return; $('#gbCount').textContent = S.gb.length; const n = S.gb.length; const id = route(); const team = !!pinOf(id);
  el.innerHTML = n ? S.gb.map((g, i) => `<li><div class="bar"><span class="n">No.${n - i}</span> <b>${esc(g.nick)}</b> ${stamp(g.created_at)}${team ? `<button class="x" data-hide="${esc(g.id)}">숨기기</button>` : ''}</div><p>${esc(g.msg)}</p></li>`).join('') : '<li class="empty" style="border:0">아직 방명록이 없어요.</li>';
  el.querySelectorAll('[data-hide]').forEach(x => x.onclick = async () => {
    x.disabled = true;
    const { error } = await sb.rpc('set_guestbook_hidden', { p_booth: id, p_pin: pinOf(id), p_id: x.dataset.hide, p_hidden: true });
    if (error) { x.disabled = false; note(errMsg(error)); } else loadGb(id);
  });
}

function renderCard(id, b) {
  const el = $('#body'); const team = !!pinOf(id);
  el.innerHTML = `<div><h2>명함 남기기</h2><p class="note">남긴 명함은 ${esc(b.name)} 팀만 볼 수 있어요. 사진만 올려도, 정보만 적어도 돼요.</p></div>
  ${S.sent[id] ? `<div class="ok"><b>명함이 전달됐어요.</b> 고마워요! 더 남기고 싶은 내용이 있으면 한 번 더 보내도 돼요.</div>` : ''}
  <form class="cardform" id="cf">
    <label class="drop"><span id="dropTxt"><b>명함 사진 올리기</b><br><span class="note">눌러서 촬영하거나 사진을 골라 주세요</span></span><img id="prev" alt="올린 명함 미리보기" hidden><input type="file" id="file" accept="image/*"></label>
    <div class="grid2"><label class="field"><span>이름 *</span><input id="cName" required maxlength="40" autocomplete="name"></label><label class="field"><span>소속</span><input id="cOrg" maxlength="60" autocomplete="organization"></label>
    <label class="field"><span>직함</span><input id="cRole" maxlength="40" autocomplete="organization-title"></label><label class="field"><span>연락처</span><input id="cTel" inputmode="tel" maxlength="30" autocomplete="tel"></label></div>
    <label class="field"><span>이메일</span><input id="cMail" type="email" maxlength="80" autocomplete="email"></label>
    <label class="field"><span>남길 말</span><textarea id="cMemo" maxlength="300" placeholder="협업 제안, 관심 있는 부분 등"></textarea></label>
    <label class="check"><input type="checkbox" id="agree" required>입력한 정보와 명함 사진을 ${esc(b.name)} 팀이 열람하고 연락에 쓰는 데 동의해요. (행사 종료 후 운영사가 일괄 삭제해요)</label>
    <div class="row"><button class="btn cta" id="cBtn">명함 보내기</button><span class="note" id="cMsg" role="status"></span></div></form>
  ${team ? `<div><h2>받은 명함함 <em id="cardCount">${S.cards.length}</em></h2><p class="note" style="margin-bottom:10px">팀 로그인한 기기에서만 보여요.</p><div class="cards" id="cardList"></div></div>` : ''}`;
  let blob = null;
  $('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; blob = await shrink(f); $('#prev').src = URL.createObjectURL(blob); $('#prev').hidden = false; $('#dropTxt').hidden = true; };
  $('#cf').onsubmit = async e => {
    e.preventDefault(); const v = k => $(k).value.trim(); $('#cBtn').disabled = true; $('#cMsg').textContent = '보내는 중…';
    try {
      const img_url = blob ? await upload('cards', blob) : '';
      const { error } = await sb.from('cards').insert({ booth_id: id, name: v('#cName'), org: v('#cOrg'), role: v('#cRole'), tel: v('#cTel'), mail: v('#cMail'), memo: v('#cMemo'), img_url, agreed: $('#agree').checked });
      if (error) throw error;
      S.sent[id] = true; renderBooth(id); if (team) loadCards(id);
    } catch (err) { $('#cMsg').textContent = errMsg(err); $('#cBtn').disabled = false; }
  };
  fillCards();
  if (team) loadCards(id);
}
function fillCards() {
  const el = $('#cardList'); if (!el) return; $('#cardCount').textContent = S.cards.length;
  el.innerHTML = S.cards.length ? S.cards.map(c => `<article>${c.img_url ? `<a href="${esc(c.img_url)}" target="_blank" rel="noopener">${imgTag(c.img_url, c.name + ' 명함')}</a>` : ''}<div><b>${esc(c.name)}</b> ${esc(c.role)}<br>${esc(c.org)}<br>${esc(c.tel)} ${esc(c.mail)}${c.memo ? `<p class="note" style="margin-top:6px">${esc(c.memo)}</p>` : ''}<p class="note">${stamp(c.created_at)}</p></div></article>`).join('') : '<p class="empty">아직 받은 명함이 없어요.</p>';
}

// ---------- 사진첩 ----------
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.6-4.5-9.6-9.1C1 8.1 3.1 4.6 6.6 4.6c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.5 0 5.6 3.5 4.2 6.8-2 4.6-9.6 9.1-9.6 9.1z"/></svg>';
function likeBtn(p, cls = '') {
  const on = S.liked.has(p.id);
  return `<button class="like ${cls}${on ? ' on' : ''}" data-like="${esc(p.id)}" aria-pressed="${on}" aria-label="좋아요">${HEART}<span>${p.like_count || 0}</span></button>`;
}
function syncLikes() {
  document.querySelectorAll('[data-like]').forEach(b => {
    const p = S.photos.find(x => x.id === b.dataset.like); if (!p) return;
    const on = S.liked.has(p.id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.querySelector('span').textContent = p.like_count || 0;
  });
  document.querySelectorAll('[data-likes]').forEach(b => { const p = S.photos.find(x => x.id === b.dataset.likes); if (p) { b.classList.toggle('on', S.liked.has(p.id)); b.querySelector('span').textContent = p.like_count || 0; } });
}
async function toggleLike(pid, onlyLike = false) {
  const p = S.photos.find(x => x.id === pid); if (!p) return;
  const was = S.liked.has(pid); if (onlyLike && was) return;
  was ? S.liked.delete(pid) : S.liked.add(pid); p.like_count = Math.max(0, (p.like_count || 0) + (was ? -1 : 1)); syncLikes();
  const { data, error } = await sb.rpc('toggle_like', { p_photo: pid, p_visitor: visitor });
  if (error) { was ? S.liked.add(pid) : S.liked.delete(pid); p.like_count = Math.max(0, (p.like_count || 0) + (was ? 1 : -1)); syncLikes(); return; }
  data.liked ? S.liked.add(pid) : S.liked.delete(pid); p.like_count = data.count; syncLikes();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-like]'); if (b) { e.preventDefault(); e.stopPropagation(); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); toggleLike(b.dataset.like); } });
const sorted = () => S.sort === 'top' ? [...S.photos].sort((a, b) => (b.like_count || 0) - (a.like_count || 0) || b.created_at.localeCompare(a.created_at)) : S.photos;

function photoMeta(p) { return `${p.by_team ? '<span class="team">TEAM</span> ' : ''}<b>${esc(p.nick)}</b> · ${stamp(p.created_at)}`; }
function fillStrip() {
  const el = $('#strip'); if (!el) return; if ($('#phCount')) $('#phCount').textContent = S.photos.length;
  el.innerHTML = S.photos.length ? S.photos.slice(0, 12).map((p, i) => `<button class="shot" data-open="${i}" aria-label="사진 크게 보기${p.caption ? ': ' + esc(p.caption) : ''}">${imgTag(p.thumb_url || p.url, p.caption || '부스 사진')}<em class="lc${S.liked.has(p.id) ? ' on' : ''}" data-likes="${esc(p.id)}">${HEART}<span>${p.like_count || 0}</span></em>${p.caption ? `<span>${esc(p.caption)}</span>` : ''}</button>`).join('')
    : '<p class="empty">아직 사진이 없어요. 사진첩 탭에서 첫 사진을 올려 주세요.</p>';
  el.querySelectorAll('[data-open]').forEach(x => x.onclick = () => openPhoto(+x.dataset.open, S.photos));
}
function renderAlbum(id, b) {
  const el = $('#body'); const team = !!pinOf(id);
  el.innerHTML = `<form class="gbform" id="pf">
    <div><h2>사진 올리기</h2><p class="note">부스에서 찍은 사진을 남겨 주세요. 한 번에 5장까지 올릴 수 있어요.</p></div>
    <label class="drop"><span id="pDropTxt"><b>사진 고르기</b><br><span class="note">눌러서 촬영하거나 사진을 골라 주세요</span></span><span class="pprev" id="pPrev" hidden></span><input type="file" id="pFile" accept="image/*" multiple></label>
    <input class="nick" id="pCap" maxlength="80" placeholder="사진 설명 (선택)" aria-label="사진 설명" style="width:100%">
    ${team ? `<label class="check"><input type="checkbox" id="asTeam" checked>팀 사진으로 올리기 (TEAM 표시)</label>` : ''}
    <div id="pWho">${whoPicker('p')}</div>
    <div class="row"><button class="btn cta" id="pBtn">사진 올리기</button><span class="note" id="pMsg" role="status"></span></div></form>
    <div><div class="boxhead"><h2>사진첩 <em id="phCount2">${S.photos.length}</em></h2>
    <div class="seg small" role="radiogroup" aria-label="정렬"><label><input type="radio" name="psort" value="new" ${S.sort === 'new' ? 'checked' : ''}>최신순</label><label><input type="radio" name="psort" value="top" ${S.sort === 'top' ? 'checked' : ''}>인기순</label></div></div>
    <div class="album" id="album"></div></div>`;
  app.querySelectorAll('[name=psort]').forEach(r => r.onchange = () => { S.sort = r.value; fillAlbum(); });
  let files = [];
  const syncWho = () => { const t = $('#asTeam')?.checked; $('#pWho').hidden = !!t; };
  $('#asTeam')?.addEventListener('change', syncWho); syncWho();
  const author = bindWho('p');
  $('#pFile').onchange = async e => {
    files = [...e.target.files].slice(0, 5); if (!files.length) return;
    $('#pPrev').innerHTML = files.map(f => `<img src="${URL.createObjectURL(f)}" alt="">`).join(''); $('#pPrev').hidden = false; $('#pDropTxt').hidden = true;
    if (e.target.files.length > 5) $('#pMsg').textContent = '앞의 5장만 올라가요.';
  };
  $('#pf').onsubmit = async e => {
    e.preventDefault(); if (!files.length) { $('#pMsg').textContent = '사진을 먼저 골라 주세요.'; return; }
    const caption = $('#pCap').value.trim(); const asTeam = !!$('#asTeam')?.checked;
    const nick = asTeam ? '' : author(); if (!asTeam && !nick) { $('#pMsg').textContent = '이름이나 닉네임을 적어 주세요.'; return; }
    $('#pBtn').disabled = true;
    try {
      for (let i = 0; i < files.length; i++) {
        $('#pMsg').textContent = `올리는 중… ${i + 1}/${files.length}`;
        // 원본은 크게 보기용(최대 1600px), 목록·홈 화면에는 작은 썸네일(480px)을 써서 데이터 전송량을 아껴요.
        const key = uuid();
        const url = await upload('photos', await shrink(files[i]), key);
        const thumb_url = await upload('photos', await shrink(files[i], 480, .78), key + '_t');
        const { error } = asTeam ? await sb.rpc('add_team_photo', { p_booth: id, p_pin: pinOf(id), p_url: url, p_thumb: thumb_url, p_caption: caption })
          : await sb.from('photos').insert({ booth_id: id, url, thumb_url, caption, nick });
        if (error) throw error;
      }
      files = []; $('#pFile').value = ''; $('#pCap').value = ''; $('#pPrev').hidden = true; $('#pDropTxt').hidden = false; $('#pMsg').textContent = '올렸어요!';
      await loadPhotos(id);
    } catch (err) { $('#pMsg').textContent = errMsg(err); }
    $('#pBtn').disabled = false;
  };
  fillAlbum();
}
function fillAlbum() {
  const el = $('#album'); if (!el) return; const id = route(); const team = !!pinOf(id);
  if ($('#phCount2')) $('#phCount2').textContent = S.photos.length;
  const list = sorted();
  el.innerHTML = list.length ? list.map((p, i) => `<figure><div class="ph"><button class="shot" data-open="${i}" aria-label="사진 크게 보기">${imgTag(p.thumb_url || p.url, p.caption || '부스 사진')}</button>${likeBtn(p, 'over')}</div>
    <figcaption>${p.caption ? `<span>${esc(p.caption)}</span>` : ''}<small>${photoMeta(p)}</small>${team ? `<button class="x" data-phide="${esc(p.id)}">숨기기</button>` : ''}</figcaption></figure>`).join('')
    : '<p class="empty">아직 사진이 없어요.</p>';
  el.querySelectorAll('[data-open]').forEach(x => x.onclick = () => openPhoto(+x.dataset.open, list));
  el.querySelectorAll('[data-phide]').forEach(x => x.onclick = async () => {
    if (x.dataset.armed !== '1') { x.dataset.armed = '1'; x.textContent = '한 번 더 누르면 숨김'; return; }
    x.disabled = true; const { error } = await sb.rpc('set_photo_hidden', { p_booth: id, p_pin: pinOf(id), p_id: x.dataset.phide, p_hidden: true });
    if (error) { x.disabled = false; note(errMsg(error)); } else loadPhotos(id);
  });
}
let lbIdx = 0, lbList = [];
function openPhoto(i, list = lbList) {
  const dlg = $('#lightbox'); lbList = list; if (!lbList.length) return;
  lbIdx = (i + lbList.length) % lbList.length; const p = lbList[lbIdx];
  $('#lbImg').src = p.url; $('#lbImg').alt = p.caption || '부스 사진'; $('#lbImg').dataset.pid = p.id;
  $('#lbLike').innerHTML = likeBtn(p, 'over big');
  $('#lbCap').innerHTML = `${p.caption ? `<p>${esc(p.caption)}</p>` : ''}<small>${photoMeta(p)} · ${lbIdx + 1}/${lbList.length}</small>`;
  // 열릴 때 첫 버튼에 자동 포커스가 가면서 생기던 검은 테두리를 막아요
  if (!dlg.open) { dlg.showModal(); dlg.focus(); }
}
// 인스타그램처럼 사진을 두 번 탭하면 좋아요
{ let last = 0;
  const burst = () => { const h = $('#lbHeart'); h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); };
  $('#lbImg').addEventListener('dblclick', () => { burst(); toggleLike($('#lbImg').dataset.pid, true); });
  $('#lbImg').addEventListener('touchend', e => { const now = Date.now(); if (now - last < 300) { e.preventDefault(); burst(); toggleLike($('#lbImg').dataset.pid, true); last = 0; } else last = now; });
}
$('#lbPrev').onclick = () => openPhoto(lbIdx - 1);  // 같은 목록 안에서 이동
$('#lbNext').onclick = () => openPhoto(lbIdx + 1);
$('#lbClose').onclick = () => $('#lightbox').close();
$('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') $('#lightbox').close(); });
$('#lightbox').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') openPhoto(lbIdx - 1); if (e.key === 'ArrowRight') openPhoto(lbIdx + 1); });

// [키, 항목 이름, 여러 줄 여부, 예시]  — 키는 그대로 두고 이름만 창업 행사에 맞게 (브랜드·개인 참가자 모두 쓸 수 있게)
const FIELDS = [['기본', [['name', '부스 이름 (팀명·브랜드명·프로젝트명)', 0, '예: 귤밭매칭 (가칭)'], ['short', '미니룸 간판 문구 (짧게, 영문 추천)', 0, '예: GYULBAT'], ['tagline', '한 줄 소개', 0, '예: 제주 감귤 농가와 일손을 잇는 매칭 서비스'], ['mood', '오늘의 기분', 0, '예: 첫 피드백 기다리는 중!'], ['intro', '짧은 자기소개', 0, '예: 제주대 경영학과 3학년, 농가 출신 창업 준비생이에요']]],
['아이디어', [['slogan', '슬로건 (선택)', 0, ''], ['story', '우리가 풀고 싶은 문제', 1, '어떤 사람이 어떤 불편을 겪고 있는지 적어 주세요'], ['values', '핵심 키워드 (쉼표로 구분)', 0, '예: 지역상생, 일손부족, 매칭'], ['products', '해결 방법 · 시제품 (한 줄에 하나)', 1, '예: 농가-구직자 매칭 앱 (시제품 개발 중)'], ['certs', '성과·수상·인증 (쉼표로 구분, 선택)', 0, '예: 2025 제주 창업경진대회 장려상'], ['impact', '앞으로의 계획 (선택)', 1, '예: 내년 감귤 수확철 시범 운영']]],
['정보', [['founders', '대표·팀원', 0, '예: 홍길동, 김제주'], ['founded', '시작 시기', 0, '예: 2025.03'], ['regions', '활동 지역', 0, '예: 제주시'], ['company', '소속 (선택)', 0, '예: 제주대학교 창업동아리'], ['insta', '인스타 아이디 (@ 없이)', 0, ''], ['web', '웹사이트 (선택)', 0, '']]]];
const PROFILE_KEYS = [...FIELDS.flatMap(([, fs]) => fs.map(f => f[0])).filter(k => k !== 'name'), 'stage'];

function renderEdit(id, b) {
  const el = $('#body');
  el.innerHTML = `<form class="edit" id="ef"><p class="note">저장하면 미니홈피에 바로 반영돼요. 부스 번호는 운영사가 관리해요.</p>
  <fieldset><legend>로고 (프로필 사진)</legend><div class="row"><div class="logoPrev${fit(b)}" id="lp">${thumb(b, 1)}</div><div style="flex:1 1 180px;display:grid;gap:8px"><input type="file" id="pimg" accept="image/png,image/jpeg,image/webp" aria-label="로고 파일">
  <label class="check"><input type="checkbox" id="fit" ${b.fit === 'fill' ? 'checked' : ''}>로고에 배경색이 있으면 칸을 가득 채우기</label>
  <p class="note">정사각형 PNG를 권장해요. 배경이 투명하거나 흰 로고는 흰 바탕 위에 여백을 두고 보여요.</p></div></div></fieldset>
  <fieldset><legend>현재 단계</legend><div class="seg" role="radiogroup" aria-label="현재 단계">${STAGES.map(([k, l]) => `<label><input type="radio" name="stage" value="${k}" ${b.stage === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
  <p class="note">부스 이름 옆에 배지로 보여요. 아이디어만 있어도 괜찮아요.</p></fieldset>
  ${FIELDS.map(([g, fs]) => `<fieldset><legend>${g}</legend>${fs.map(([k, l, ta, ex]) => {
    const val = Array.isArray(b[k]) ? b[k].join(k === 'products' ? '\n' : ', ') : (b[k] || '');
    return `<label class="field"><span>${l}</span>${ta ? `<textarea data-k="${k}" placeholder="${esc(ex)}">${esc(val)}</textarea>` : `<input data-k="${k}" value="${esc(val)}" placeholder="${esc(ex)}" ${k === 'name' ? 'required maxlength="40"' : ''}>`}</label>`;
  }).join('')}</fieldset>`).join('')}
  <div class="row"><button class="btn cta" id="saveBtn">저장</button><button type="button" class="btn ghost" id="cancel">취소</button><span class="note" id="eMsg" role="status"></span></div></form>`;
  let logo = null;
  $('#pimg').onchange = async e => { const f = e.target.files[0]; if (!f) return; logo = await shrink(f, 800); $('#lp').innerHTML = `<img src="${URL.createObjectURL(logo)}" alt="새 로고 미리보기">`; };
  $('#fit').onchange = e => $('#lp').classList.toggle('fill', e.target.checked);
  $('#cancel').onclick = () => { S.editing = false; renderBooth(id); };
  $('#ef').onsubmit = async e => {
    e.preventDefault(); const vals = {};
    app.querySelectorAll('[data-k]').forEach(x => { const k = x.dataset.k; vals[k] = ['values', 'products', 'certs'].includes(k) ? lines(x.value) : x.value.trim(); });
    vals.insta = (vals.insta || '').replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
    vals.stage = app.querySelector('[name=stage]:checked')?.value || '';
    const profile = Object.fromEntries(PROFILE_KEYS.map(k => [k, vals[k]]));
    $('#saveBtn').disabled = true; $('#eMsg').textContent = '저장 중…';
    try {
      const logoUrl = logo ? await upload('logos', logo) : b.img;
      const { error } = await sb.rpc('update_booth', { p_booth: id, p_pin: pinOf(id), p_name: vals.name || b.name, p_profile: profile, p_logo_url: logoUrl, p_logo_fit: $('#fit').checked ? 'fill' : 'contain' });
      if (error) throw error;
      await loadBooth(id); S.editing = false; renderBooth(id);
    } catch (err) { $('#eMsg').textContent = errMsg(err); $('#saveBtn').disabled = false; }
  };
}

// ---------- 화면: 운영사 관리자 ----------
const adminPin = () => sess.get('admin');
async function renderAdmin() {
  document.title = '관리자 · 멩글아케이드';
  const { data: st } = await sb.rpc('admin_status');
  if (st && !st.initialized) {
    app.innerHTML = `<div class="dirpanel"><div class="head"><h1>관리자 비밀번호 만들기<small>처음 한 번만 설정해요. 8자 이상, 다른 사람이 짐작하기 어렵게 정해 주세요.</small></h1></div>
    <form class="gbform" id="initF"><input class="nick" id="initPin" type="password" minlength="8" required aria-label="새 관리자 비밀번호" placeholder="새 관리자 비밀번호"><input class="nick" id="initPin2" type="password" minlength="8" required aria-label="비밀번호 확인" placeholder="한 번 더 입력">
    <div class="row"><button class="btn">만들기</button><span class="err" id="initErr" role="alert"></span></div></form></div>`;
    $('#initF').onsubmit = async e => {
      e.preventDefault(); const p = $('#initPin').value; if (p !== $('#initPin2').value) { $('#initErr').textContent = '두 비밀번호가 달라요.'; return; }
      const { error } = await sb.rpc('admin_init', { p_pin: p }); if (error) { $('#initErr').textContent = errMsg(error); return; }
      sess.set('admin', p); renderAdmin();
    };
    return;
  }
  if (!adminPin()) {
    app.innerHTML = `<div class="dirpanel"><div class="head"><h1>운영사 관리자<small>관리자 비밀번호로 로그인해요.</small></h1></div><button class="btn" id="aLogin" style="justify-self:start">로그인</button></div>`;
    $('#aLogin').onclick = async () => {
      const p = await askPin({ title: '관리자 로그인', hint: '관리자 비밀번호를 입력해 주세요. 브라우저 탭을 닫으면 로그아웃돼요.', check: async x => { const { data, error } = await sb.rpc('admin_login', { p_pin: x }); if (error) throw error; return data; } });
      if (p) { sess.set('admin', p); renderAdmin(); }
    };
    return;
  }
  await loadBooths();
  const { data: stats, error } = await sb.rpc('admin_stats', { p_admin: adminPin() });
  if (error) { sess.set('admin', null); note(errMsg(error)); renderAdmin(); return; }
  S.admin.stats = Object.fromEntries((stats || []).map(r => [r.booth_id, r]));
  const list = Object.values(S.booths).sort((a, b) => String(a.no).localeCompare(String(b.no), 'ko', { numeric: true }));
  const base = location.origin + location.pathname;
  app.innerHTML = `<div class="dirpanel adm">
  <div class="head"><h1>운영사 관리자<small>부스 ${list.length}개 등록됨 · 최대 75팀</small></h1><div class="row"><button class="btn" id="printQr">QR 일괄 인쇄</button><button class="btn ghost" id="aOut">로그아웃</button></div></div>
  ${S.admin.issued.length ? `<div class="newpins"><h2>새로 발급된 팀 PIN</h2><p class="note">PIN은 지금만 보여요. 복사해서 팀별로 따로 전달해 주세요. 잃어버리면 'PIN 재발급'으로 새로 만들 수 있어요.</p>
    <div class="scroll"><table class="tbl"><thead><tr><th>번호</th><th>팀</th><th>주소</th><th>PIN</th></tr></thead><tbody>${S.admin.issued.map(r => `<tr><td>${esc(r.no)}</td><td>${esc(r.name)}</td><td>#${esc(r.id)}</td><td><code>${esc(r.pin)}</code></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button class="btn small" id="copyPins">표 복사 (엑셀에 붙여넣기)</button><button class="btn ghost small" id="clearPins">목록 닫기</button></div></div>` : ''}
  <section><h2>부스 일괄 등록</h2><p class="note">한 줄에 한 팀씩 <b>부스번호, 주소(영문 소문자·숫자·하이픈), 팀 이름</b> 순서로 적어요. 이미 있는 주소는 번호·이름만 바뀌고 PIN은 그대로예요.</p>
    <textarea class="mono" id="bulk" placeholder="01, team-01, 감귤랩&#10;02, team-02, 오름스튜디오&#10;07, supermatcha, 슈퍼말차"></textarea>
    <div class="row"><button class="btn" id="bulkBtn">등록하기</button><span class="note" id="bulkMsg" role="status"></span></div></section>
  <section><h2>부스 목록</h2>
    ${list.length ? `<div class="scroll"><table class="tbl stack"><thead><tr><th>번호</th><th>팀</th><th>QR 주소</th><th class="num">방문</th><th class="num">방명록</th><th class="num">명함</th><th class="num">사진</th><th></th></tr></thead><tbody>
    ${list.map(b => { const s = S.admin.stats[b.id] || {}; return `<tr><td>${esc(b.no || '--')}</td><td><b>${esc(b.name)}</b></td><td><a href="#${esc(b.id)}">${esc(base)}#${esc(b.id)}</a></td><td class="num">${s.visitors ?? 0}</td><td class="num">${s.guestbook ?? 0}</td><td class="num">${s.cards ?? 0}</td><td class="num">${s.photos ?? 0}</td>
      <td><div class="acts"><button class="btn ghost small" data-reset="${esc(b.id)}">PIN 재발급</button><button class="btn ghost small" data-del="${esc(b.id)}">삭제</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">아직 등록된 부스가 없어요.</p>'}
  </section>
  <section><h2>참고</h2><p class="note">관리자 비밀번호는 모든 부스의 팀 PIN 대신 쓸 수 있어요. 각 부스 미니홈피의 '팀 로그인'에 관리자 비밀번호를 넣으면 그 부스의 내용 수정, 받은 명함 보기, 방명록 숨기기를 할 수 있어요.</p></section>
  </div>`;
  $('#aOut').onclick = () => { sess.set('admin', null); S.admin.issued = []; renderAdmin(); };
  $('#printQr').onclick = () => printQr(list, base);
  $('#copyPins')?.addEventListener('click', async () => {
    const tsv = ['번호\t팀\t주소\tPIN', ...S.admin.issued.map(r => `${r.no}\t${r.name}\t${base}#${r.id}\t${r.pin}`)].join('\n');
    try { await navigator.clipboard.writeText(tsv); $('#copyPins').textContent = '복사했어요'; } catch { note('복사하지 못했어요. 표를 드래그해서 복사해 주세요.'); }
  });
  $('#clearPins')?.addEventListener('click', () => { S.admin.issued = []; renderAdmin(); });
  $('#bulkBtn').onclick = async () => {
    const rows = $('#bulk').value.split('\n').map(l => l.split(/[,\t]/).map(x => x.trim())).filter(r => r.length >= 2 && r[1]);
    const bad = rows.filter(r => !/^[a-z0-9-]{2,30}$/.test(r[1].toLowerCase()));
    if (!rows.length) { $('#bulkMsg').textContent = '등록할 줄이 없어요.'; return; }
    if (bad.length) { $('#bulkMsg').textContent = `주소 형식이 맞지 않아요: ${bad.map(r => r[1]).join(', ')}`; return; }
    $('#bulkBtn').disabled = true; let done = 0;
    for (const [no, id, ...rest] of rows) {
      const name = rest.join(', ') || '새 부스';
      const { data, error } = await sb.rpc('admin_upsert_booth', { p_admin: adminPin(), p_id: id.toLowerCase(), p_no: no, p_name: name });
      if (error) { $('#bulkMsg').textContent = `${id}: ${errMsg(error)}`; break; }
      if (data) S.admin.issued.push({ no, id: id.toLowerCase(), name, pin: data });
      done++; $('#bulkMsg').textContent = `${done}/${rows.length} 등록 중…`;
    }
    $('#bulkBtn').disabled = false; if (done === rows.length) renderAdmin();
  };
  app.querySelectorAll('[data-reset]').forEach(x => x.onclick = async () => {
    if (x.dataset.armed !== '1') { x.dataset.armed = '1'; x.textContent = '한 번 더 누르면 재발급'; return; }
    const id = x.dataset.reset; const { data, error } = await sb.rpc('admin_reset_pin', { p_admin: adminPin(), p_booth: id });
    if (error) { note(errMsg(error)); return; }
    const b = S.booths[id]; S.admin.issued.push({ no: b.no, id, name: b.name, pin: data }); renderAdmin();
  });
  app.querySelectorAll('[data-del]').forEach(x => x.onclick = async () => {
    if (x.dataset.armed !== '1') { x.dataset.armed = '1'; x.textContent = '방명록·명함까지 삭제돼요. 한 번 더 누르기'; return; }
    const { error } = await sb.rpc('admin_delete_booth', { p_admin: adminPin(), p_booth: x.dataset.del });
    if (error) note(errMsg(error)); else renderAdmin();
  });
}

function printQr(list, base) {
  if (!window.qrcode) { note('QR 생성기를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.'); return; }
  $('#qrsheet').innerHTML = list.map(b => {
    const url = `${base}#${b.id}`; const q = qrcode(0, 'M'); q.addData(url); q.make();
    return `<div class="qrcard"><span class="bn">MANGLE ARCADE · BOOTH ${esc(b.no || '--')}</span>${q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}<b>${esc(b.name)}</b><span style="font-size:12px">QR을 찍고 방명록과 명함을 남겨 주세요</span><small>${esc(url)}</small></div>`;
  }).join('');
  window.print();
}

// ---------- 라우팅 ----------
let gbTimer = null, live = null;
function stopLive() { clearInterval(gbTimer); clearInterval(chatter); if (live) { sb.removeChannel(live); live = null; } }
function startLive(id) {
  stopLive();
  // 새 방명록이 들어오면 바로 다시 불러와요 (Supabase Realtime). 연결이 안 되는 환경을 위해 20초 새로고침도 함께 둬요.
  live = channel(id);
  gbTimer = setInterval(() => { if (document.visibilityState === 'visible' && route() === id) { loadGb(id); loadPhotos(id); } }, 20000);
  startChatter();
}
function channel(id) {
  return sb.channel('gb-' + id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guestbook', filter: 'booth_id=eq.' + id }, () => loadGb(id))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter: 'booth_id=eq.' + id }, () => loadPhotos(id))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'photos', filter: 'booth_id=eq.' + id }, ({ new: n }) => {
      const p = S.photos.find(x => x.id === n.id); if (!p) return;
      if (n.hidden) { loadPhotos(id); return; } p.like_count = n.like_count; syncLikes();
    })
    .subscribe();
}
// 휴대폰 화면이 꺼지거나 다른 앱으로 가면 실시간 연결을 끊어서, 동시 접속 한도를 아껴요
document.addEventListener('visibilitychange', () => {
  const id = route(); if (!sb || !id || id === 'admin' || id !== S.cur) return;
  if (document.visibilityState === 'hidden') { if (live) { sb.removeChannel(live); live = null; } }
  else if (!live) { live = channel(id); loadGb(id); loadPhotos(id); }
});
async function render() {
  const id = route();
  if (!sb) { app.innerHTML = `<div class="dirpanel"><div class="head"><h1>설정이 필요해요<small>config.js 에 Supabase 주소와 anon 키를 넣어 주세요.</small></h1></div></div>`; return; }
  if (id === 'admin') { stopLive(); renderAdmin(); return; }
  document.title = '멩글아케이드 부스 미니홈피';
  if (!id) { stopLive(); renderDir(); return; }
  if (id !== S.cur) {
    S.cur = id; S.tab = 'home'; S.editing = false; S.gb = []; S.gbLoaded = null; S.photos = []; S.liked = new Set(); S.cards = []; S.visits = { today: 0, total: 0 };
    renderBooth(id); loadBooth(id); loadGb(id); loadPhotos(id); loadVisit(id); startLive(id);
  } else renderBooth(id);
}
addEventListener('hashchange', () => { if (route() !== S.cur) S.cur = null; render(); });

(async () => {
  if (sb) await loadBooths();
  render();
})();
