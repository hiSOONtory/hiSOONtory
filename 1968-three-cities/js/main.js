import { newState } from './engine.js';
import { saveGame, loadGame, clearGame } from './save.js';
import { initUI, playScene, show } from './ui.js';

const $ = (id) => document.getElementById(id);

async function getJSON(name) {
  if (window.__DATA__) return window.__DATA__[name] || null; // 한 파일 미리보기판(tools/build_single.py)
  try {
    const r = await fetch(`data/${name}.json`);
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  }
}

async function boot() {
  const [meta, base, example, sources] = await Promise.all(['meta', 'scenes', 'scenes.example', 'sources'].map(getJSON));
  if (!meta || !base) {
    document.body.textContent = '데이터(data/meta.json, data/scenes.json)를 불러오지 못했습니다. README의 실행 방법을 확인해 주세요.';
    return;
  }
  initUI(meta, sources || {});
  // ?scenes=PR-4,MX-2 처럼 주면 그 장면들만 이어서 본다(검수용)
  const asked = (new URLSearchParams(location.search).get('scenes') || '').split(',').filter((id) => base.scenes[id]);
  const flow = asked.length ? asked : meta.flow.minimal;

  async function run(state) {
    const scenes = (state.example && example ? example : base).scenes;
    show('play');
    for (let i = state.pos; i < flow.length; i++) {
      state.pos = i;
      saveGame(state); // 장면 시작마다 자동 저장
      const s = scenes[flow[i]];
      await playScene(s, state, `${meta.cities[s.city].name} · ${s.id} ${s.title} (${i + 1}/${flow.length})`);
    }
    state.pos = flow.length;
    saveGame(state);
    showEnd(state, scenes);
  }

  function showEnd(state, scenes) {
    const rows = flow.map((id) => {
      const picks = (state.choices[id] || []).map((c) => `${c.key}. ${c.text}`).join(' / ') || '-';
      return `<tr><th>${id}<br><small>${scenes[id].title}</small></th><td>${picks}</td><td>${state.reasons[id] || '-'}</td></tr>`;
    });
    const flags = Object.entries(state.flags).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(', ') || '없음';
    $('end-summary').innerHTML = `<table><tr><th>장면</th><th>고른 것</th><th>이유</th></tr>${rows.join('')}</table>
      <p><b>켜진 플래그</b> ${flags}</p><p><b>사료 수첩</b> ${state.notebook.length}장 (${state.notebook.join(', ') || '-'})</p>`;
    show('end');
  }

  function showTitle() {
    const saved = loadGame();
    $('btn-continue').hidden = !saved;
    $('data-toggle').hidden = !example;
    show('title');
    $('btn-start').focus();
  }

  $('btn-start').addEventListener('click', () => {
    clearGame();
    run({ ...newState(), example: $('chk-example').checked });
  });
  $('btn-continue').addEventListener('click', () => {
    const saved = loadGame();
    if (saved) run(saved);
  });
  $('btn-home').addEventListener('click', showTitle);
  showTitle();
}

boot();
