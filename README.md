# 出退勤打刻アプリ

スマートフォンからワンタップで出退勤を打刻し、管理者のLINEグループに自動通知するPWAアプリ

## 機能

- 📍 出勤打刻（LINE通知＋スプレッドシート記録）
- 🏠 退勤打刻（勤務時間自動計算＋LINE通知）
- 📊 本日の記録表示
- 🎉 課題完了報告
- 📱 PWA対応（ホーム画面に追加可能）

## 加点ポイント実装

### デザインの工夫
- ⏰ 現在時刻のリアルタイム表示
- ✨ ボタン押下時のアニメーション
- 🌙 ダークモード対応

### エラーハンドリング
- 🔄 リトライ機能（最大3回）
- 🚫 二重打刻防止
- 💬 日本語エラーメッセージ
- ⏳ ローディング表示

### コード品質
- 📝 JSDocコメント
- 🔧 定数の一元管理

## 使用技術

- HTML5 / CSS3 / JavaScript (ES6+)
- Google Apps Script
- LINE Messaging API
- GitHub Pages
- PWA (Service Worker + manifest.json)

## デモ

https://konaka33.github.io/attendance-app

## セットアップ

詳細は [gas/README.md](gas/README.md) を参照してください。

## 作者

konaka33 (user01)

## ライセンス

MIT
