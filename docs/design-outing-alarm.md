# Signage Alert / Timer Input System Design

家庭内アラート/タイマー入力システム設計。

この文書は、当初の「お出かけアラート」専用設計を、キッチンタイマーや自由リマインダーにも拡張できる汎用設計へ改訂したものです。ファイル名は既存の `design-outing-alarm.md` のまま維持します。

## 1. Overview

アラート設定システムは、親がWeb画面から一時アラートを登録し、家庭用Signage Radioで指定時刻または相対タイマー完了時に通知するための仕組みです。

扱うユースケース:

- お出かけアラート: 出発時刻の5分前と出発時刻に通知する。
- キッチンタイマー: 3分後、5分後などに通知する。
- 自由リマインダー: 任意時刻に任意メッセージを通知する。

基本方針:

- 親がWeb画面から一時アラートを登録する。
- 出発時刻指定型と、3分後・5分後などの相対タイマー型を扱える。
- 既存の `items[]` 再生方式に乗せる。
- 既存の定時Radioとは別 `reason` として扱う。
- MVPではずんだもんWAVを優先する。
- WAVがない場合のみTTS fallbackを使う。
- 将来カテゴリ追加できる設計にする。

UI上の名称:

```text
アラート設定
```

内部概念:

```text
category
mode
kind
```

例:

```text
category = outing / kitchen / custom
mode     = gakudo / school / ramen3 / ramen5 / timer3 / timer5 / custom
kind     = five_min / depart / done / custom
```

音声優先順位:

```text
1. WAV key指定
2. WAVがない場合のみTTS fallback
3. 将来、VOICEVOX動的生成を検討
```

WAV key例:

```text
ZUNDA_OUTING_5MIN
ZUNDA_OUTING_NOW
ZUNDA_TIMER_RAMEN_DONE
ZUNDA_TIMER_DONE
```

## 2. Directory Plan

Frontend:

```text
signage-assets/
├─ index.html
├─ admin/
│  └─ alert/
│     ├─ index.html
│     ├─ alert.js
│     └─ alert.css
└─ docs/
   └─ design-outing-alarm.md
```

GAS:

```text
signage-main-api/
├─ Code.js
├─ TTS.js
└─ Alert.js   // 新設候補
```

`admin/alert/` は管理画面群の一部として扱います。`Alert.js` は保存、一覧、削除、チェック処理を分離する候補です。MVPでは `Code.js` に最小実装してから、安定後に `Alert.js` へ分離してもよいです。

## 3. Flow

```text
admin/alert/index.html
  ↓ setAlert API
GAS
  ↓
Alert_Config
  ↓
index.html alert_check polling
  ↓
GAS getAlertItemsForNow_
  ↓
items[]
  ↓
playRadioQueue(items)
```

Mermaid:

```mermaid
flowchart TD
  Admin["admin/alert/index.html"] -->|setAlert| GasSet["GAS setAlert"]
  GasSet --> Sheet["Alert_Config"]
  Portal["index.html"] -->|poll: reason=alert_check| GasCheck["GAS getAlertItemsForNow_"]
  GasCheck --> Sheet
  GasCheck -->|items[]| Portal
  Portal --> Player["playRadioQueue(items)"]
```

## 4. Frontend Design

### admin/alert/

入力画面の項目案:

| 項目 | 内容 |
|---|---|
| カテゴリ | `outing`, `kitchen`, `custom`。 |
| モード | カテゴリに応じたテンプレート種別。 |
| 日付 | 絶対時刻指定型で使用。初期値は今日。 |
| 時刻指定 / 相対タイマー | 絶対時刻か、現在からの相対分数かを切り替える。 |
| 出発時刻 | `HH:MM`。主に `category=outing` で使用。 |
| タイマー分数 | `3`, `5` など。主に `category=kitchen` で使用。 |
| 5分前通知 ON/OFF | `outing` で5分前行を作るかどうか。 |
| 対象 | 誰向けのアラートか。例: 次女、長女、家族。 |
| テンプレート | 表示用テンプレート。 |
| 自由メッセージ | TTS fallback用の補足文。 |
| 保存 | `setAlert` を呼ぶ。 |
| 今日の予約削除 | `clearAlerts` を呼ぶ。 |
| 現在の予約一覧 | `listAlerts` の結果を表示する。 |

カテゴリ例:

```text
outing    お出かけ
kitchen   キッチンタイマー
custom    自由
```

モード例:

```text
gakudo    学童出発
school    学校出発
lesson    習い事
ramen3    ラーメン3分
ramen5    ラーメン5分
timer3    3分タイマー
timer5    5分タイマー
custom    自由
```

### index.html

既存 `index.html` 側の追加設計:

- 30秒ごと、または60秒ごとに `requestRadioItems('alert_check')` を呼ぶ。
- `items[]` があれば既存 `playRadioQueue(items)` へ渡す。
- `clock_0655`, `clock_0720`, `clock_0740`, `clock_1830`, `clock_2100` とは別系統にする。
- 既存の時刻発火ロジックには混ぜず、alert polling用の独立timerを持つ。
- `isSpeaking` や既存再生中フラグと干渉しないよう、既存 `playRadioQueue` の排他仕様を確認してから接続する。
- アラート再生済み管理はGAS側 `played_at` を正とする。
- フロントの `localStorage` は補助ログや一時的な再試行抑制に留める。

推奨polling:

```text
setInterval(checkAlert, 30 * 1000)
```

30秒pollingなら `HH:MM:00` に完全一致しなくても拾いやすくなります。GAS側は `fire_datetime <= now` かつ未再生を対象にします。

## 5. GAS API Design

API名は汎用 `alert` 名称に寄せます。

```text
?action=setAlert
?action=listAlerts
?action=clearAlerts
?reason=alert_check
```

旧案の `setAlarm/listAlarms/clearAlarms/alarm_check` は廃止し、汎用 `alert` 名称へ寄せます。

既存 `SIGNAGE_API_TOKEN` を使い、全APIで `token` を必須にします。

### setAlert

絶対時刻指定型:

```text
?action=setAlert
category=outing
mode=gakudo
date=YYYY-MM-DD
time=08:00
notify5min=true
target=次女
message=...
token=...
```

相対タイマー型:

```text
?action=setAlert
category=kitchen
mode=ramen3
durationMin=3
target=家族
message=...
token=...
```

仕様:

- `category=outing` は `time` を基準に作成する。
- `category=kitchen` は 現在時刻 + `durationMin` を基準に作成する。
- `notify5min=true` の場合、5分前行も作成する。
- kitchen系は通常 `done` 1行のみ作成する。
- `mode` に応じて既定WAV keyを決める。
- WAV keyが未定義の場合のみTTS fallback本文を使う。

作成例:

```text
outing + time=08:00 + notify5min=true
  -> 07:55 kind=five_min
  -> 08:00 kind=depart

kitchen + durationMin=3
  -> now+3min kind=done
```

レスポンス例:

```json
{
  "ok": true,
  "type": "alert",
  "action": "setAlert",
  "created": 2,
  "alerts": []
}
```

### listAlerts

```text
?action=listAlerts&date=YYYY-MM-DD
```

用途:

- 指定日の予約一覧を返す。

レスポンス例:

```json
{
  "ok": true,
  "type": "alert",
  "action": "listAlerts",
  "date": "2026-07-06",
  "alerts": []
}
```

### clearAlerts

```text
?action=clearAlerts&date=YYYY-MM-DD
```

用途:

- 指定日の未再生アラートを削除または無効化する。

推奨:

- MVPでは物理削除ではなく `enabled=false` にする。
- `played_at` 済みの履歴は残す。

### alert_check

```text
?reason=alert_check
```

用途:

- `index.html` から定期的に呼ばれる。
- 現在時刻に再生対象のアラートがあれば `items[]` を返す。
- 再生対象がなければ `items: []` を返す。

実装候補:

```js
function getAlertItemsForNow_(now) {
  // Alert_Configから
  // enabled=true
  // fire_datetime<=now
  // played_at empty
  // expires_at empty or expires_at>=now
  // を取得し、priority順でitems[]化する。
}
```

## 6. Spreadsheet Design

Sheet:

```text
Alert_Config
```

列案:

```text
id
enabled
status
category
mode
scenario
kind
date
fire_time
fire_datetime
base_datetime
duration_min
target
label
message
item_type
key
speaker
priority
played_at
expires_at
created_at
created_by
source
```

| Column | Meaning |
|---|---|
| `id` | 一意ID。例: UUIDまたは `YYYYMMDD-HHMM-random`。 |
| `enabled` | 有効フラグ。`true/false` または `1/0`。 |
| `status` | 状態。`waiting`, `played`, `expired`, `disabled`, `error`。 |
| `category` | 種別。`outing`, `kitchen`, `custom`。 |
| `mode` | 詳細モード。`gakudo`, `school`, `ramen3`, `timer3` など。 |
| `scenario` | 将来拡張用のシナリオ名。例: `ramen`, `timer`, `gakudo`。MVPでは `mode` と同じでもよい。 |
| `kind` | 発火種類。`five_min`, `depart`, `done`, `custom`。 |
| `date` | アラート対象日。`YYYY-MM-DD`。 |
| `fire_time` | 発火時刻。`HH:MM`。 |
| `fire_datetime` | 実際の発火日時。絶対比較用。 |
| `base_datetime` | 出発時刻またはタイマー開始基準時刻。 |
| `duration_min` | 相対タイマーの分数。例: `3`, `5`。 |
| `target` | 対象者。例: 次女、長女、家族。 |
| `label` | 表示名。例: 学童出発 5分前、ラーメン3分。 |
| `message` | TTS fallback本文または補足メッセージ。 |
| `item_type` | `wav` または `tts`。MVPでは `wav` 優先。 |
| `key` | `item_type=wav` の場合のWAV key。 |
| `speaker` | `item_type=tts` の場合のspeaker。例: `zunda`。 |
| `priority` | 同時刻競合時の優先度。 |
| `played_at` | 再生済み時刻。空なら未再生。 |
| `expires_at` | 期限切れ時刻。古い未再生アラートを返さないために使う。 |
| `created_at` | 作成時刻。 |
| `created_by` | 作成者識別。MVPでは固定値でも可。 |
| `source` | 作成元。例: `admin/alert`, `manual`, `import`。 |

`status` のMVP運用:

```text
作成時: waiting
alert_checkで返却時: played
clearAlerts時: disabled
期限切れ: expired
```

`scenario` の考え方:

```text
category = kitchen
scenario = ramen
duration_min = 3
kind = done
```

`mode=ramen3`, `mode=ramen5` のようにUI選択値が増えすぎる場合でも、内部では `scenario=ramen` と `duration_min=3/5` に分けて扱えます。MVPでは `mode` と `scenario` が同じでも構いません。

`base_datetime` の考え方:

- `category=outing`: 出発時刻。
- `category=kitchen`: タイマー開始時刻。
- `category=custom`: 任意基準時刻。

`fire_datetime` の考え方:

- `outing` の `five_min`: `base_datetime - 5min`。
- `outing` の `depart`: `base_datetime`。
- `kitchen` の `done`: `base_datetime + durationMin`。
- `custom`: 指定時刻。

## 7. Template / WAV Mapping

MVPではWAV keyを優先します。WAV keyが未定義、または資産が存在しない場合のみTTS fallback本文を使います。

| category | mode | kind | WAV key | TTS fallback |
|---|---|---|---|---|
| `outing` | `gakudo` | `five_min` | `ZUNDA_OUTING_5MIN` | そろそろ学童に行く準備なのだ。水筒と鍵を確認するのだ。 |
| `outing` | `gakudo` | `depart` | `ZUNDA_OUTING_NOW` | 学童へ出発する時間なのだ。忘れ物がないか確認するのだ。 |
| `outing` | `school` | `five_min` | `ZUNDA_OUTING_5MIN` | そろそろ学校へ出発する準備なのだ。 |
| `outing` | `school` | `depart` | `ZUNDA_OUTING_NOW` | 学校へ出発する時間なのだ。 |
| `outing` | `lesson` | `five_min` | `ZUNDA_OUTING_5MIN` | そろそろ習い事に行く準備なのだ。 |
| `outing` | `lesson` | `depart` | `ZUNDA_OUTING_NOW` | 習い事へ出発する時間なのだ。 |
| `kitchen` | `ramen3` | `done` | `ZUNDA_TIMER_RAMEN_DONE` | ラーメンできたで、時間なのだ。 |
| `kitchen` | `ramen5` | `done` | `ZUNDA_TIMER_RAMEN_DONE` | ラーメンできたで、時間なのだ。 |
| `kitchen` | `timer3` | `done` | `ZUNDA_TIMER_DONE` | 3分たったのだ。時間なのだ。 |
| `kitchen` | `timer5` | `done` | `ZUNDA_TIMER_DONE` | 5分たったのだ。時間なのだ。 |
| `custom` | `custom` | `custom` | empty | 入力された自由メッセージを読み上げる。 |

明示例:

```text
category=outing, mode=gakudo, kind=five_min
  key=ZUNDA_OUTING_5MIN

category=outing, mode=gakudo, kind=depart
  key=ZUNDA_OUTING_NOW

category=kitchen, mode=ramen3, kind=done
  key=ZUNDA_TIMER_RAMEN_DONE

category=kitchen, mode=timer3, kind=done
  key=ZUNDA_TIMER_DONE
```

## 8. Radio Items Response Design

WAV例:

```json
{
  "ok": true,
  "type": "radio",
  "reason": "alert_check",
  "slot": "alert",
  "items": [
    {
      "type": "wav",
      "key": "ZUNDA_OUTING_5MIN"
    }
  ]
}
```

TTS fallback例:

```json
{
  "ok": true,
  "type": "radio",
  "reason": "alert_check",
  "slot": "alert",
  "items": [
    {
      "type": "tts",
      "speaker": "zunda",
      "text": "そろそろ学童に行く準備なのだ。水筒と鍵を確認するのだ。"
    }
  ]
}
```

対象なし:

```json
{
  "ok": true,
  "type": "radio",
  "reason": "alert_check",
  "slot": "alert",
  "items": []
}
```

## 9. Duplicate Prevention

二重再生防止方針:

- `Alert_Config.played_at` を正とする。
- `alert_check` で対象を返したら、原則その時点または再生完了通知で `played_at` を入れる。
- MVPでは「返却時に `played_at` を入れる」方式でよい。
- 将来は `markPlayed` API に分離可能。
- フロントの `localStorage` は補助に留める。

MVP:

```text
alert_checkで返却した時点でplayed_atを入れる
```

将来:

```text
markPlayed APIで再生完了後に記録
```

MVPの処理:

```text
alert_check
  ↓
未再生対象を取得
  ↓
items[] を作る
  ↓
同じ処理内で played_at を書く
  ↓
items[] を返す
```

利点:

- ブラウザ再読み込みやpolling重複でも二重再生しにくい。
- 状態の正がSpreadsheetに残る。

欠点:

- ブラウザ側で実際の再生に失敗しても `played_at` が入る。

## 10. Interaction With Existing Clock Slots

干渉防止:

- `alert_check` は既存 `clock_*` と完全に別系統にする。
- `clock_0655` などとは別 `reason` にする。
- `morning_full` などの既存slot判定には混ぜない。
- `slotFromReason_()` では `alert_check -> alert` のように明示分岐する。
- 既存 `clock_*` の `CLOCK_SPEAK_TIMES` には追加しない。
- alert pollingは独立timerで実行する。

優先度案:

```text
alert 出発時刻         100
alert キッチン完了      95
alert 5分前            90
weekstart              80
regular radio          50
weather/school info    30
```

同時刻に重なった場合:

- MVPでは `alert_check` と定時Radioの両方が呼ばれる可能性がある。
- 既存 `playRadioQueue` の排他中は後続再生がスキップされる可能性があるため、実装時に再生キューの共通化を検討する。
- まずはGAS側でalertのpriorityを持たせ、alert内の複数候補はpriority順に返す。
- 将来的にはフロント側に単一の再生キュー管理を置き、regularよりalertを優先する。

## 11. Security

- 既存 `SIGNAGE_API_TOKEN` を使う。
- `setAlert`, `listAlerts`, `clearAlerts`, `alert_check` は全て token必須。
- MVPはGETでよい。
- 将来POST化を検討する。
- GitHub Pages上の管理画面なのでtoken埋め込みは完全な秘密ではない。
- 家庭内用途のMVPとしては tokenガードで開始する。

## 12. MVP Scope

MVPに含めるもの:

```text
admin/alert/ 入力画面
setAlert
listAlerts
clearAlerts
alert_check
Alert_Config
category=outing
category=kitchen
WAV key優先
TTS fallback
played_at二重再生防止
```

MVP外:

```text
曜日繰り返し
Google Calendar連携
LINE通知
VOICEVOX動的生成
markPlayed API
複雑な共通再生キュー制御
```

## 13. Implementation Plan

```text
Step 1: Alert_Config シート仕様確定
Step 2: GAS Alert.js 追加
Step 3: doGet に action=setAlert/listAlerts/clearAlerts 追加
Step 4: getRadioItemsForNow(reason) に alert_check 追加
Step 5: admin/alert/ 作成
Step 6: index.html に alert_check polling 追加
Step 7: 手動テスト
Step 8: 本番 clasp push / GitHub Pages push
```

詳細:

1. `Alert_Config` の列と値形式を確定する。
2. `Alert.js` に `setAlert_`, `listAlerts_`, `clearAlerts_`, `getAlertItemsForNow_` を作る。
3. `doGet(e)` で `action` を読み、管理系APIへ分岐する。
4. `getRadioItemsForNow(reason)` に `reason === 'alert_check'` を追加する。
5. `admin/alert/` の入力画面を作る。
6. `index.html` に独立pollingを追加する。
7. ローカル/本番GASで手動テストする。
8. 問題なければ GitHub Pages と Apps Script に反映する。

## 14. Test Plan

最低限のテスト:

```text
outing 08:00 notify5min=true → 07:55/08:00 の2件
outing notify5min=false → 08:00のみ
kitchen ramen3 → 現在+3分に1件
kitchen timer5 → 現在+5分に1件
alert_check 時刻前は空
alert_check 時刻後はitemsあり
一度返したらplayed_atが入り再度返らない
WAV keyが返る
WAV key未定義時のみTTS fallback
既存clock系が変わらない
token不一致で拒否
```

追加テスト観点:

- `listAlerts` が指定日の予約だけ返す。
- `clearAlerts` で未再生予約が消える、または無効化される。
- 期限切れの未再生アラートが返らない。
- 複数アラートが同時刻にある場合、priority順に返る。
- `custom` で自由メッセージがTTS fallbackとして返る。
