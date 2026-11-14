// 장면 재생 논리: 조건, 플래그, 선택 기록. 화면(DOM)은 모른다.

export function newState() {
  return { v: 1, pos: 0, name: '', flags: {}, choices: {}, reasons: {}, diary: {}, notebook: [], causes: {} };
}

function flagOn(v) {
  return v !== undefined && v !== null && v !== false;
}

// conds: [{choice:'A'} | {question:'Q1'} | {flag:'F_X'} | {flag:'F_X', not:true} | {flag:'F_X', eq:'B'}] 모두 만족(AND)
export function condOk(conds, flags, local) {
  if (!conds) return true;
  return conds.every((c) => {
    if ('choice' in c) return local.choice === c.choice;
    if ('question' in c) return local.question === c.question;
    const v = flags[c.flag];
    if ('eq' in c) return String(v) === String(c.eq);
    return c.not ? !flagOn(v) : flagOn(v);
  });
}

export class ScenePlayer {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.i = -1;
    this.local = { choice: null, question: null };
    state.choices[scene.id] = []; // 장면을 다시 하면 그 장면의 기록은 새로 쓴다
    delete state.reasons[scene.id];
  }

  // 조건에 맞는 다음 줄. 장면이 끝나면 null
  next() {
    const { lines } = this.scene;
    while (++this.i < lines.length) {
      if (condOk(lines[this.i].if, this.state.flags, this.local)) return lines[this.i];
    }
    return null;
  }

  pick(line, key) {
    const opt = line.options.find((o) => o.key === key);
    Object.assign(this.state.flags, opt.set || {});
    if (line.type === 'question') this.local.question = key;
    else if (!line.group) this.local.choice = key; // 묶음 선택(간직 등)은 '선택=A' 조건의 대상이 아니다
    this.state.choices[this.scene.id].push({ scene: this.scene.title, type: line.type, group: line.group || null, key, text: opt.text });
  }

  reason(tag) {
    this.state.reasons[this.scene.id] = tag;
  }

  collect(sourceId) {
    if (!this.state.notebook.includes(sourceId)) this.state.notebook.push(sourceId);
  }
}
