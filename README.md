# シフカレ

今のバイト先専用の、シフトを最短で確認・更新するモバイルファーストPWAです。

## 初回設定

1. Supabase SQL Editorで `supabase.sql` を実行する
2. Authentication > Providersで **Anonymous Sign-Ins** を有効にする
3. Vercelに `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定する
4. GitHubへ反映するとVercelが自動デプロイする

## 機能

- 「あなたは誰ですか？」からの端末内本人選択
- 本名を維持した自由な表示名
- 今日のランチ・ディナー、入り時間順、2人以下の警告
- 月間カレンダーとメンバー別今月シフト
- 閲覧／変更モード
- シフトボード貼り付け、個別追加・変更・削除
- Supabase Realtimeと変更履歴
- PWA（ホーム画面追加）

名前選択だけの本人識別は利便性優先の方式です。URLを知る人は別の登録名を選べるため、強い本人認証が必要になった場合はメールOTP等へ戻してください。
