# AGENTS.md

## 作業原則

このプロジェクトでは、実装より先に必ず現状調査を行うこと。

推測で既存構造を決めつけない。
既存のシート名、列名、JSON構造、APIレスポンス、UI状態を確認してから修正する。

## 必須手順

変更前に必ず以下を確認する。

1. 作業ディレクトリ
   - pwd
   - git rev-parse --show-toplevel

2. 変更対象ファイル
   - どのファイルを変更するか明示
   - それ以外は変更しない

3. データ構造
   - GAS API の返却JSON
   - スプレッドシートの参照元シート
   - フロント側が期待するデータ構造

4. 既存機能への影響
   - グラフ表示
   - 入力機能
   - JSONP
   - processGrowthData

## 禁止事項

- 現行コードを読まずに実装しない
- 実データ構造を推測しない
- 既存の似たファイル名だけで判断しない
- looker_height / looker_weight / growth_processed の役割を勝手に入れ替えない
- ユーザーの許可なく git commit / git push / clasp push しない
- ユーザーの許可なくフォルダを新規作成しない
- 作業ディレクトリ外にファイルを作らない

## データ設計方針

- growth_records は元データ
- growth_processed はWebアプリAPIの主データ
- looker_height / looker_weight はLooker Studio用の派生データ
- Webアプリの getGrowthChartData() は原則 growth_processed を読む
- BMIは growth_processed の bmi を優先する
- 身長・体重・BMIを別シートから再合成しない

## 実装前の回答形式

実装前に必ず以下を報告する。

- 調査したファイル
- 確認したデータ構造
- 原因
- 修正方針
- 変更予定ファイル
- 影響範囲

ユーザーの承認後に実装する。

## 実装後の回答形式

実装後に必ず以下を報告する。

- 変更ファイル
- 変更内容
- 既存機能への影響
- テスト内容
- 未確認事項