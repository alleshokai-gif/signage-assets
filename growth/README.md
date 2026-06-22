# 成長曲線 GitHub Pages版

`google.script.run` を使わず、GitHub Pages の静的ページから GAS Web App を `fetch(GAS_API_URL)` で呼び出す構成です。

## 配置

```text
growth/
├─ index.html
├─ assets/
│  ├─ css/
│  │  └─ style.css
│  └─ js/
│     └─ app.js
└─ README.md
```

公開URL:

```text
https://alleshokai-gif.github.io/signage-assets/growth/
```

## 設定

`assets/js/app.js` 冒頭の `GAS_API_URL` を、GAS Web App の `/exec` URL に差し替えます。

```js
const GAS_API_URL = "https://script.google.com/macros/s/XXXX/exec";
```

## GAS APIの想定レスポンス

推奨形式:

```json
{
  "children": [
    {
      "id": "child-1",
      "name": "太郎",
      "sex": "male",
      "birthDate": "2020-04-01",
      "measurements": [
        {
          "date": "2025-04-01",
          "ageMonths": 60,
          "height": 108.2,
          "weight": 18.4,
          "heightSds": 0.12,
          "weightSds": -0.08
        }
      ]
    }
  ],
  "sds": {
    "height": [
      {
        "sds": 0,
        "points": [
          { "ageMonths": 60, "value": 107.5 }
        ]
      }
    ],
    "weight": [
      {
        "sds": 0,
        "points": [
          { "ageMonths": 60, "value": 18.2 }
        ]
      }
    ]
  }
}
```

`records` のフラット配列も受け付けます。例:

```json
{
  "records": [
    {
      "childId": "child-1",
      "childName": "太郎",
      "birthDate": "2020-04-01",
      "date": "2025-04-01",
      "height": 108.2,
      "weight": 18.4
    }
  ]
}
```

## ローカル確認

ブラウザで直接 `growth/index.html` を開くか、リポジトリ直下で簡易サーバーを起動します。

```powershell
python -m http.server 8000
```

その後、以下を開きます。

```text
http://localhost:8000/growth/
```

確認項目:

- 子供選択が表示される
- 身長、体重、身長＋体重の切り替えができる
- SDS曲線がAPIレスポンスに含まれる場合、グラフ上に表示される
- API取得に失敗した場合、エラーメッセージが表示される
- スマホ幅で操作パネルとグラフが崩れない
