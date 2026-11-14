// 자동 저장(localStorage). 막힌 환경에서도 게임은 계속 돌아가야 하므로 모두 try/catch.
const KEY = '1968-three-cities-save-v1';

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) { /* 저장 불가 환경: 무시 */ }
}

export function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.v === 1 ? s : null;
  } catch (e) {
    return null;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* 무시 */ }
}
