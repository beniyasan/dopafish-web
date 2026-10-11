# DOPAGAKI Fishing Collection — Web版

iOSアプリ「Dopagaki Fishing Collection」([beniyasan/dopafish](https://github.com/beniyasan/dopafish)) の機能をそのまま再現したWeb版です。
抽選・確率・スコア・RUSH・図鑑・ショップ・演出の内容はアプリ版と同一です。

## 遊び方

- **CASTボタン長押し** → 指を離してキャスト(長押し時間でパワー決定)
- 魚が食いついたらリーチ演出 → **画面連打**で引き上げ
- **AUTO**で自動連投、**釣具強化**でメダルを使ってアップグレード
- **図鑑**に釣った魚が記録される(localStorage保存)
- スペースキー長押しでもキャスト可(デスクトップ)

## Lolipop Deploy Now 設定

| 項目 | 値 |
|------|-----|
| フレームワーク | `static` |
| output_dir | `/`(リポジトリルート) |
| ブランチ | `main`(pushで自動デプロイ) |

ビルド不要の静的サイト(index.html + js/css + webp画像)です。

## 技術構成

- Vanilla JS (ES Modules) + Canvas 2D — SpriteKitシーンを2Dキャンバスに移植
- Web Audio API — SE合成 + BGMループ(アプリ版のAudioEngineと同じ音色・譜面)
- navigator.vibrate — ハプティクス(対応端末のみ、トグル可)
- localStorage — 図鑑・メダル・最高記録・強化レベル・触覚設定を永続化

## デバッグ用URLパラメータ

| パラメータ | 効果 |
|-----------|------|
| `?rig=n\|r\|sr\|ssr\|ur\|lr\|miss\|bluff\|secret` | 釣果を固定 |
| `?fast` | 待ち時間短縮 |
| `?go` | 自動開始+自動キャスト |
| `?win` | 連打必勝 |
| `?secret` | シークレット魚を確実化 |
| `?mashneed=0.2` | 連打必要量を20%に(逃げ検証用) |
| `?rush=N` | RUSH N回転の状態で開始 |
| `?ending` | 開始時に通常EDを再生 |
| `?daycast=N` | その日の投数をNにして開始(29で次の1投で1日終了) |
| `?omen=N` | 海の気配ゲージをNで開始(100で満タン) |
