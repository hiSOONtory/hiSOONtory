# 1968, 세 도시의 학생 — 게임 틀

고등학교 「역사로 탐구하는 현대 세계」용 선택형 비주얼 노벨. 기준 문서는 `source/1968_게임틀_인계서.md`와 `source/1968_스토리보드.md`.

**지금 단계: 최소판** (인계서 12장). `PA-I → PA-2 → PA-O`가 돌아간다.

## 실행

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000/` 을 연다. 서버 없이 보려면 `dist/1968-preview.html`을 더블클릭한다(한 파일 묶음).

## 대사 넣기 (엑셀 → 게임)

```bash
pip install openpyxl
```

```bash
python3 tools/xlsx2json.py 내가_쓴_양식.xlsx
```

```bash
python3 tools/build_single.py
```

- 첫 명령이 `data/scenes.json`, `data/sources.json`을 만들고 장면별 줄 수, 대사 없는 장면, 조건·플래그 경고, 50자 넘는 대사창, 15자 넘는 선택지를 출력한다.
- 파일 이름을 생략하면 `source/1968_대사작성양식.xlsx`를 읽는다.
- 내용(F열)이 빈 줄 가운데 유형(C열)이 적힌 줄은 `[PA-2 ① 진입: 대사 예정]` 꼴의 자리표시로 채운다. `--no-placeholder`를 붙이면 쓴 대사만 나온다.
- `--example`은 '예시' 시트를 PA-2 자리에 넣은 `data/scenes.example.json`을 만든다(타이틀의 체크박스로 볼 수 있다).

## 양식을 읽는 규칙 (인계서 5장에 더한 것)

| 양식의 모습 | 변환기의 처리 |
|---|---|
| 질문 줄 사이에 답 줄(`질문=Q1`)이 끼어 있음 | 질문끼리 한 묶음으로 모으고 답은 그 뒤에 둔다. 한 인터뷰에서 질문을 두 번 받으려면 사이에 조건 없는 줄을 하나 둔다 |
| `질문=A`, `질문=B` (X-O 장면) | `질문=Q1`, `질문=Q2`와 같게 읽는다 |
| `간직할 물건: 표지판 / 신문 / 라디오` + 플래그 `KEEP_PR` | 별도 선택 화면으로 풀고 `KEEP_PR=A/B/C`로 저장한다. 물건별 대사는 조건에 `KEEP_PR=A`처럼 쓴다 |
| `선택=간직`, `선택=선택` | 그 묶음 선택을 마친 뒤에 무엇을 골랐든 나오는 줄 |
| MX-2 `요구 하나를 고른다(6개 중)` + `F_DEMAND` | `data/meta.json`의 여섯 요구로 풀고 `F_DEMAND=1~6`으로 저장한다 |
| 조사 줄의 E열이 비어 있음 | `data/meta.json`의 지점 이름(스토리보드 기준)을 순서대로 쓴다 |
| 사료 줄 | `사료목록` 시트에서 같은 장면ID의 사료를 순서대로 연결한다. 번역문이 비면 후보 문구에 `[확인 전]`을 붙여 보여 준다 |

## 그림 바꿔 끼우기

`assets/bg/<장면ID>.webp`, `assets/char/<이름>.webp` 파일을 넣으면 자리표시 그래픽 대신 쓴다. 예: `assets/bg/PA-2.webp`, `assets/char/마르크.webp`.

## 폴더

```
index.html  css/style.css
js/engine.js   장면 재생·조건·플래그
js/ui.js       화면
js/save.js     자동 저장
js/main.js     흐름
data/meta.json 흐름·선택지 묶음·조사 지점(직접 고치는 파일)
data/scenes.json, sources.json   변환기 출력(직접 고치지 않는다)
tools/xlsx2json.py, build_single.py
source/        인계서, 스토리보드, 대사 양식 원본
```

## 아직 없는 것

전체 흐름(FR-0, 허브, 나머지 도시, FR-X·C·E), 일기·원인 분류·결과지 화면, 이어하기 코드, 설정(글자 속도·크기), 효과음, 교사 모드, `?mode=short`, 공통 문구용 보조 엑셀.
