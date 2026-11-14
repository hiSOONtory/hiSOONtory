// 자리표시 그림: 판화풍 배경과 종이 오림 인물(SVG). assets/ 에 이미지 파일이 생기면 쓰이지 않는다.

function rng(seed) {
  let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// 도시별 지붕 모양으로 건물 띠 하나를 만든다
function skyline(r, city, base, minH, maxH, litRate) {
  let body = '';
  let wins = '';
  for (let x = -40; x < 1640;) {
    const w = 90 + r() * 130;
    const h = minH + r() * (maxH - minH);
    const top = base - h;
    body += `M${x} ${base}V${top}`;
    if (city === 'PR' && r() < 0.3) { // 첨탑
      const c = x + w / 2;
      body += `H${c - 20}L${c} ${top - 110 - r() * 90}L${c + 20} ${top}H${x + w}`;
    } else if (city === 'PR') { // 박공지붕
      body += `L${x + w / 2} ${top - 44}L${x + w} ${top}`;
    } else if (city === 'MX' && r() < 0.25) { // 돔
      body += `H${x + w * 0.2}A${w * 0.3} ${w * 0.3} 0 0 1 ${x + w * 0.8} ${top}H${x + w}`;
    } else if (city === 'MX') { // 평지붕과 난간
      body += `v-12h${w * 0.3}v12h${w * 0.4}v-12h${w * 0.3}v12`;
    } else { // 파리: 망사르드 지붕과 굴뚝
      const c = x + w * (0.25 + r() * 0.5);
      body += `L${x + w * 0.08} ${top - 36}H${c}v-30h16v30H${x + w * 0.92}L${x + w} ${top}`;
    }
    body += `V${base}Z`;
    for (let wy = top + 26; wy < base - 60; wy += 50) {
      for (let wx = x + 18; wx < x + w - 26; wx += 36) {
        if (r() < litRate) wins += `M${wx} ${wy}h14v26h-14z`;
      }
    }
    x += w + (r() < 0.2 ? 14 : 0);
  }
  return { body, wins };
}

export function sceneArt(id, city) {
  const r = rng(id);
  const sx = 260 + r() * 1080;
  const sy = 190 + r() * 120;
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.1;
    const b = a + Math.PI / 12;
    rays += `M${sx} ${sy}L${sx + Math.cos(a) * 2000} ${sy + Math.sin(a) * 2000}L${sx + Math.cos(b) * 2000} ${sy + Math.sin(b) * 2000}Z`;
  }
  const far = skyline(r, city, 900, 330, 560, 0);
  const near = skyline(r, city, 900, 120, 330, 0.3);
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<rect width="1600" height="900" fill="var(--paper)"/>
<path d="${rays}" fill="var(--accent)" opacity=".12"/>
<circle cx="${sx}" cy="${sy}" r="150" fill="var(--accent)"/>
<circle cx="${sx}" cy="${sy}" r="182" fill="none" stroke="var(--accent)" stroke-width="7" stroke-dasharray="1 17" stroke-linecap="round"/>
<path d="${far.body}" fill="var(--accent)" opacity=".5" transform="translate(-14 0)"/>
<path d="${far.body}" fill="none" stroke="var(--ink)" stroke-width="2.5" opacity=".7"/>
<path d="${near.body}" fill="var(--accent)" transform="translate(10 -8)"/>
<path d="${near.body}" fill="var(--ink)"/>
<path d="${near.wins}" fill="var(--paper)" opacity=".9"/>
</svg>`;
}

const HAIR = {
  short: '<path class="s-hair" d="M57 118C50 66 78 50 102 50c28 0 50 20 41 70-5-22-19-38-45-36-18 1-34 12-41 34z"/>',
  bob: '<path class="s-hair" d="M50 168C38 82 70 48 100 48c32 0 62 34 50 120h-18c10-48-4-82-32-82s-42 34-32 82z"/>',
  bun: '<path class="s-hair" d="M57 118C50 66 78 50 102 50c28 0 50 20 41 70-5-22-19-38-45-36-18 1-34 12-41 34z"/><circle class="s-hair" cx="100" cy="42" r="19"/>',
};
const STYLE = { 클레르: 'bob', 루시아: 'bob', 하나: 'bob', 엘레나: 'bun', '들뤼 부인': 'bun', '클레르(노년)': 'bun', '루시아(노년)': 'bun' };

export function figureArt(name) {
  const shape = `<path class="s-body" d="M14 300c0-68 26-96 64-104h44c38 8 64 36 64 104z"/>
<path class="s-skin" d="M84 150h32v52l-16 16-16-16z"/><ellipse class="s-skin" cx="100" cy="116" rx="41" ry="49"/>
${HAIR[STYLE[name] || 'short']}`;
  const glasses = name.includes('노년')
    ? '<path class="s-line" d="M72 120a12 12 0 1 0 24 0a12 12 0 1 0-24 0m24 0h8m0 0a12 12 0 1 0 24 0a12 12 0 1 0-24 0"/>'
    : '';
  return `<svg viewBox="0 0 200 300" aria-hidden="true"><g class="s-off" transform="translate(10 6)">${shape}</g>${shape}${glasses}</svg>`;
}
