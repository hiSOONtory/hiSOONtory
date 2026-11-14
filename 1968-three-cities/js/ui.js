// 화면: 1968 장면, 조사, 선택·이유 태그, 사료 카드, 2026 인터뷰
import { ScenePlayer } from './engine.js';
import { sceneArt, figureArt } from './art.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
const TYPE_MS = 28;

let meta, sources, state;
let era = 'title';
let backlog = [];
let cast = [];
let advance = null; // 대사 넘김을 기다리는 동안의 처리 함수
let closeModal = null;
let recTimer = null;
const imgOk = new Map(); // 이미지 파일이 있으면 자리표시 그래픽 대신 쓴다

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'onclick') n.addEventListener('click', v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.filter((k) => k != null));
  return n;
}

function tryImage(url, onLoad) {
  if (imgOk.get(url) === false) return;
  if (imgOk.get(url)) return onLoad(url);
  const img = new Image();
  img.onload = () => { imgOk.set(url, true); onLoad(url); };
  img.onerror = () => imgOk.set(url, false);
  img.src = url;
}

export function show(screen) {
  for (const id of ['title', 'play', 'end']) $(id).hidden = id !== screen;
  if (screen !== 'play') { $('app').dataset.era = screen; era = screen; }
}

export function initUI(m, s) {
  meta = m;
  sources = s;
  const onAdvance = () => { if (advance && $('modal').hidden) advance(); };
  $('dialog').addEventListener('click', onAdvance);
  $('stage').addEventListener('click', (e) => { if (!e.target.closest('button')) onAdvance(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeModal) return closeModal();
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !e.target.closest('button, input, textarea, label')) {
      e.preventDefault();
      onAdvance();
    }
  });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal') && closeModal) closeModal(); });
  $('btn-log').addEventListener('click', showBacklog);
  $('btn-notebook').addEventListener('click', showNotebook);
  $('wave').append(...Array.from({ length: 28 }, (_, i) => el('i', { style: `animation-delay:${-(i * 137) % 900}ms` })));
}

// ───────── 모달 ─────────
function openModal(content, { closable = true, kind = '' } = {}) {
  return new Promise((resolve) => {
    const box = $('modal-box');
    box.className = kind;
    box.replaceChildren(content);
    const done = (v) => {
      $('modal').hidden = true;
      closeModal = null;
      $('dialog').focus({ preventScroll: true });
      resolve(v);
    };
    closeModal = closable ? () => done() : null;
    if (closable) box.append(el('button', { class: 'modal-close', type: 'button', onclick: () => done() }, '닫기'));
    box.done = done;
    $('modal').hidden = false;
    (box.querySelector('button') || box).focus();
  });
}

function sourceCard(id) {
  const s = typeof id === 'string' ? sources[id] : id;
  if (!s) return el('div', { class: 'card' }, `[사료 ${id} 없음]`);
  const pending = !s.text;
  return el('article', { class: 'card' + (pending ? ' pending' : '') },
    el('div', { class: 'card-kicker' }, '사료', pending ? el('b', {}, '[확인 전]') : null),
    el('p', { class: 'card-text' }, s.text || s.candidate),
    s.desc ? el('p', { class: 'card-desc' }, s.desc) : null,
    el('p', { class: 'card-cite' }, s.cite ? `출처: ${s.cite}` : pending ? '사료 후보입니다. 원문과 출처를 확인한 뒤 본문이 들어갑니다.' : ''));
}

function showSource(line) {
  const card = sourceCard(line.sourceId || { candidate: line.inline, text: '' });
  const wrap = el('div', {}, card,
    el('button', { class: 'modal-ok', type: 'button', onclick: () => $('modal-box').done() }, line.sourceId ? '사료 수첩에 넣기' : '확인'));
  return openModal(wrap, { closable: false, kind: 'source' });
}

// 쌓였다는 것만 알린다. 점수가 아니다
function toast(text) {
  document.getElementById('toast')?.remove();
  const t = el('div', { id: 'toast', role: 'status' }, text);
  $('stage').append(t);
  setTimeout(() => t.remove(), 2500);
}

// 수첩 = 발자취(이유 도장 누적, 장면별 선택) + 모은 사료
function showNotebook() {
  const reasons = Object.values(state.reasons);
  const stamps = el('div', { class: 'trail-stamps' }, ...meta.reasonTags.map((t) => {
    const n = reasons.filter((r) => r === t).length;
    return el('div', { class: n ? '' : 'zero' }, t, el('b', {}, String(n)));
  }));
  const rows = Object.entries(state.choices).flatMap(([id, picks]) => picks
    .filter((c) => c.type === 'choice')
    .map((c) => el('tr', {}, el('th', {}, c.scene || id), el('td', {}, c.text), el('td', {}, c.group && picks.some((x) => x.type === 'choice' && !x.group) ? '' : state.reasons[id] || ''))));
  const list = el('div', { class: 'list' },
    el('h2', {}, '발자취'), stamps,
    rows.length ? el('table', { class: 'trail' }, ...rows) : el('p', { class: 'empty' }, '아직 고른 것이 없습니다. 선택과 그 이유가 여기에 쌓입니다.'),
    el('h2', {}, `모은 사료 (${state.notebook.length})`));
  if (!state.notebook.length) list.append(el('p', { class: 'empty' }, '아직 모은 사료가 없습니다.'));
  for (const id of state.notebook) list.append(sourceCard(id));
  openModal(list, { kind: 'source' });
}

function showBacklog() {
  const list = el('div', { class: 'list' }, el('h2', {}, '지난 대사'));
  if (!backlog.length) list.append(el('p', { class: 'empty' }, '이 장면에서 지나간 대사가 없습니다.'));
  for (const b of backlog) list.append(el('p', { class: 'log' }, b.name ? el('b', {}, b.name) : null, b.text));
  openModal(list);
  list.lastElementChild.scrollIntoView();
}

function showReason(line) {
  const box = el('div', { class: 'reason' }, el('h2', {}, '왜 그렇게 했나요?'),
    el('div', { class: 'tags' }, ...line.tags.map((t) => el('button', { type: 'button', onclick: () => $('modal-box').done(t) }, t))));
  return openModal(box, { closable: false });
}

// ───────── 시대 전환, 배경, 인물 ─────────
async function setEra(next, scene) {
  const app = $('app');
  const flip = (era === '1968' || era === '2026') && era !== next;
  if (flip) await rewind(era, next);
  era = next;
  app.dataset.era = next;
  app.dataset.city = scene.city;
  for (const id of ['bg', 'chars']) $(id).hidden = next !== '1968';
  $('call').hidden = next !== '2026';
  if (next === '1968') {
    setBg(scene.bg || scene.id, `${scene.id} ${scene.title}`);
    // 라디오 다이얼: 세 도시가 한 눈금 위에. 바늘은 지금 도시, 장면이 나아가면 조금씩 움직인다
    const n = Number(scene.id.split('-')[1]) || 3.5;
    $('dial').style.setProperty('--needle', `${{ PA: 16.7, PR: 50, MX: 83.3 }[scene.city] + (n - 3.5) * 3.2}%`);
    $('memo-text').textContent = `${(meta.cities[scene.city] || {}).hero || ''}의 기억 · ${scene.id}`;
  } else {
    const elder = (meta.cities[scene.city] || {}).elder || '';
    $('call-name').textContent = elder;
    $('call-face').replaceChildren(silhouette(elder));
    const t0 = Date.now();
    clearInterval(recTimer);
    const tick = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $('rec-time').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    recTimer = setInterval(tick, 1000);
  }
  if (flip) { await wait(250); $('fx').className = ''; $('fx').replaceChildren(); }
}

// 시대 전환: 구술 녹음 테이프를 되감듯 연도가 흐른다
async function rewind(from, to) {
  const a = Number(from);
  const b = Number(to);
  const year = el('b', {}, String(a));
  $('fx').replaceChildren(el('div', { class: 'reels' }, el('i'), el('i')), year, el('span', {}, b < a ? '◀◀ 기억을 되감는 중' : '▶▶ 오늘로 돌아오는 중'));
  $('fx').className = b < a ? 'rewind back' : 'rewind';
  if (reduced) { year.textContent = String(b); return wait(0); }
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    await wait(55);
    year.textContent = String(Math.round(a + ((b - a) * i) / steps));
  }
  await wait(350);
}

function setBg(id, label) {
  const bg = $('bg');
  bg.style.backgroundImage = '';
  $('bg-art').innerHTML = sceneArt(id, id.split('-')[0]);
  $('bg-label').textContent = `배경 자리표시 · ${label || id}`;
  $('bg-label').hidden = false;
  tryImage(`assets/bg/${encodeURIComponent(id)}.webp`, (url) => {
    bg.style.backgroundImage = `url("${url}")`;
    $('bg-art').replaceChildren();
    $('bg-label').hidden = true;
  });
}

function silhouette(name) {
  const box = el('div', { class: 'sil' });
  box.innerHTML = figureArt(name);
  tryImage(`assets/char/${encodeURIComponent(name)}.webp`, (url) => box.replaceChildren(el('img', { src: url, alt: '' })));
  return box;
}

function renderCast() {
  $('chars').replaceChildren(...cast.map((n) => el('div', { class: 'char', 'data-name': n }, silhouette(n), el('span', {}, n))));
}

function setSpeaking(name) {
  if (era === '2026') {
    $('call-video').classList.toggle('speaking', !!name && name !== '플레이어');
    return;
  }
  if (name && name !== '플레이어' && !cast.includes(name)) {
    cast.push(name);
    if (cast.length > 2) cast.shift();
    renderCast();
  }
  for (const c of $('chars').children) c.classList.toggle('speaking', c.dataset.name === name);
}

function direction(text) {
  const t = text.trim();
  let m;
  if (t === '암전') $('fx').className = 'dark';
  else if (t === '밝아짐') $('fx').className = '';
  else if (t === '화면 흔들림') {
    if (reduced) return;
    $('stage').classList.add('shake');
    setTimeout(() => $('stage').classList.remove('shake'), 450);
  } else if ((m = t.match(/^배경:\s*(.+)$/))) setBg(m[1].trim());
  else if ((m = t.match(/^인물:\s*(.+?)\s*(등장|퇴장)$/))) {
    cast = cast.filter((n) => n !== m[1]);
    if (m[2] === '등장') cast = [...cast, m[1]].slice(-2);
    renderCast();
  }
  // '효과음: …' 과 그 밖의 지시는 맞는 음원·처리가 없으면 조용히 건너뛴다
}

// 장면 첫머리의 포스터식 타이틀 카드. 2초 뒤 또는 누르면 넘어간다
function titleCard(scene, caption) {
  return new Promise((resolve) => {
    const [date, place] = caption.split(' · ');
    const card = $('titlecard');
    card.replaceChildren(el('p', { class: 'tc-date' }, date), el('p', { class: 'tc-place' }, place || ''), el('p', { class: 'tc-title' }, scene.title));
    card.hidden = false;
    const done = () => { card.hidden = true; advance = null; resolve(); };
    advance = done;
    card.onclick = done;
    setTimeout(() => { if (!card.hidden && advance === done) done(); }, reduced ? 1200 : 2400);
  });
}

// ───────── 대사창 ─────────
function setDialog(kind, name, text, ph) {
  const d = $('dialog');
  d.dataset.kind = kind;
  d.classList.toggle('ph', !!ph);
  $('speaker').textContent = name;
  $('speaker').hidden = !name;
  $('text').textContent = text;
}

function showText(line) {
  return new Promise((resolve) => {
    const kind = line.type === 'say' ? 'say' : line.type === 'thought' ? 'thought' : 'narration';
    const name = kind === 'say' ? line.speaker || '[화자 미정]' : kind === 'thought' ? `${line.speaker || ''} 속마음`.trim() : line.speaker || '';
    setSpeaking(kind === 'say' ? line.speaker : null);
    setDialog(kind, name, '', line.ph);
    backlog.push({ name, text: line.text });
    const chars = [...line.text];
    let n = 0;
    let timer = null;
    $('more').hidden = true;
    const finish = () => {
      clearInterval(timer);
      timer = null;
      $('text').textContent = line.text;
      $('more').hidden = false;
    };
    advance = () => {
      if (timer) return finish(); // 글자가 나오는 중이면 한 번에 완성
      advance = null;
      resolve();
    };
    if (reduced) finish();
    else timer = setInterval(() => { $('text').textContent += chars[n++]; if (n >= chars.length) finish(); }, TYPE_MS);
  });
}

// ───────── 선택, 조사 ─────────
function showOptions(line) {
  return new Promise((resolve) => {
    const box = era === '2026' ? $('questions') : $('choices');
    $('more').hidden = true;
    setSpeaking(null);
    const buttons = line.options.map((o) => el('button', {
      type: 'button',
      onclick: () => { box.replaceChildren(); if (box.id === 'choices') box.hidden = true; resolve(o.key); },
    }, era === '2026' ? null : el('b', {}, o.key), el('span', {}, o.text)));
    box.className = line.options.length > 4 ? 'many' : '';
    box.replaceChildren(...(line.prompt ? [el('p', { class: 'prompt' }, line.prompt)] : []), ...buttons);
    box.hidden = false;
    buttons[0].focus();
  });
}

function showInspect(line) {
  return new Promise((resolve) => {
    const box = $('inspect');
    const seen = new Set();
    const n = line.spots.length;
    const head = el('p', { class: 'inspect-head' });
    const next = el('button', { class: 'inspect-next', type: 'button', onclick: () => { box.hidden = true; box.replaceChildren(); $('chars').hidden = false; resolve(); } }, '다음');
    const update = () => {
      head.textContent = `조사할 곳을 눌러 보세요 (${seen.size}/${n})`;
      next.classList.toggle('ready', seen.size === n);
    };
    const spots = line.spots.map((s, i) => {
      const x = n === 1 ? 50 : 14 + (72 * i) / (n - 1);
      const b = el('button', {
        class: 'spot', type: 'button', style: `left:${x}%;top:${i % 2 ? 34 : 58}%`,
        onclick: () => {
          seen.add(i);
          b.classList.add('seen');
          setDialog('narration', s.name, s.text, s.ph);
          backlog.push({ name: s.name, text: s.text });
          update();
        },
      }, el('i'), el('span', {}, s.name));
      return b;
    });
    const panels = line.layout === 'compare'
      ? el('div', { class: 'compare' }, el('div', {}, line.left || ''), el('div', {}, line.right || ''))
      : null;
    box.replaceChildren(...(panels ? [panels] : []), head, ...spots, next);
    $('chars').hidden = true;
    setDialog('narration', '', '', false);
    $('more').hidden = true;
    update();
    box.hidden = false;
    spots[0].focus();
  });
}

// ───────── 장면 재생 ─────────
export async function playScene(scene, st, progress, index = 0, total = 1) {
  state = st;
  const p = new ScenePlayer(scene, state);
  backlog = [];
  cast = [];
  renderCast();
  setDialog('narration', '', '', false);
  $('more').hidden = true;
  $('caption').textContent = '';
  $('progress').textContent = progress;
  $('pips').replaceChildren(...Array.from({ length: total }, (_, i) => el('i', { class: i < index ? 'done' : i === index ? 'now' : '' })));
  $('pips').title = progress;
  $('nb-count').textContent = state.notebook.length;
  $('inspect').hidden = true;
  $('choices').hidden = true;
  $('questions').replaceChildren();
  await setEra(scene.kind === 'interview' ? '2026' : '1968', scene);
  $('dialog').focus({ preventScroll: true });

  let line;
  let carded = false;
  while ((line = p.next())) {
    switch (line.type) {
      case 'caption':
        $('caption').textContent = line.text;
        if (era === '1968' && !carded) { carded = true; await titleCard(scene, line.text); }
        break;
      case 'narration': case 'say': case 'thought': case 'result': await showText(line); break;
      case 'inspect': await showInspect(line); break;
      case 'source':
        if (line.sourceId) p.collect(line.sourceId);
        await showSource(line);
        $('nb-count').textContent = state.notebook.length;
        if (line.sourceId) toast('수첩에 사료 한 장이 들어갔습니다');
        break;
      case 'choice': case 'question': p.pick(line, await showOptions(line)); break;
      case 'reason': {
        const tag = await showReason(line);
        p.reason(tag);
        toast(`‘${tag}’ 도장이 발자취에 찍혔습니다`);
        break;
      }
      case 'direction': direction(line.text); break;
      default: break; // 일기 등 아직 화면이 없는 유형
    }
  }
  clearInterval(recTimer);
  $('fx').className = '';
}
