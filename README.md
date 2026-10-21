# おかんアプリ（PWA版）

「少しおせっかいなおかん」が、予定・天気・目標をもとに声をかけてくれる生活支援アプリのWeb版。
[`../okan-app`](../okan-app)（Expo＋Supabase）の機能を、[NEXTROUND](https://github.com/n6548yjd79-lang/NEXTROUND2) の画面構成（ダーク基調・下部の浮いたタブバー・進捗バー・モーダルカレンダー）で作り直したもの。okan-app 側は変更していない。

## 起動

`start.bat` をダブルクリック（開発用の静的サーバが立ち、`http://127.0.0.1:8766/` が開く）。止めるときは Ctrl+C。
本番はGitHub Pagesに `public/` を置くだけで、サーバは要らない（下の「公開」）。

```bash
python server.py --port 8766
```

必要なもの：Python 3.8以上（標準ライブラリのみ）。Chrome/Edgeで開くと、アドレスバーの「インストール」からアプリとして追加できる。

## 画面

| タブ | 内容 |
|---|---|
| ホーム | おかんの一言、今日・明日の天気（Open-Meteo）、今日の予定、目標の進捗 |
| 予定 | 日付ごとの一覧、追加・編集・削除、**カレンダー**（モーダル、日付から追加） |
| 目標 | 週/日の進捗バー、「やった」1タップ、取り消し、追加・編集・削除 |
| 記録 | おかんが声をかけた履歴（日付ごと・種別バッジ・理由） |
| 設定 | おせっかい度1〜5、口調、就寝/起床時刻、通知ON/OFF、通知の状態、JSON入出力 |

## ロジックの出どころ

ルールエンジン・テンプレート・通知抑制・予約計画・進捗集計・日時処理は、okan-app の `lib/` をそのまま移植したもの（`public/lib/`）。
`node tools/port-from-expo.mjs` で TypeScript → JS に変換し直せる。

移植が壊れていないことは、okan-app の既存テスト（117件）を移植先のJSに当てて確認する：

```bash
node tools/verify-port.mjs
```

## データ

- 保存先：**このブラウザの中だけ**（localStorage）。サーバにもクラウドにも送らない。外に出る通信は天気（Open-Meteo）だけ
- 端末をまたげない（スマホとPCは別データ）。移すときは設定の「JSONを書き出す／読み込む」
- ブラウザのサイトデータを消すと失われる。ときどき書き出してバックアップを取る
- 読み込みに失敗したときは保存を止める（壊れたデータを空で上書きしないため）

## 公開（GitHub Pages）

公開URL：https://panda447.github.io/okan-pwa/ （リポジトリ：panda447/okan-pwa、公開リポジトリ）

`gh-pages` ブランチの中身（`public/` と同じ）がそのまま公開される。Settings → Pages の Source は「Deploy from a branch」→ `gh-pages` / `/ (root)`。
コードを直したあとの更新は、main にコミットしてから次の2行：

```bash
git subtree split --prefix public -b gh-pages-tmp
git push -f origin gh-pages-tmp:gh-pages && git branch -D gh-pages-tmp
```

（GitHub Actionsで自動公開にしたい場合は、`gh auth refresh -h github.com -s workflow` で権限を足してから、Pages Source を「GitHub Actions」にしてワークフローを置く。）

無料プランで使うにはリポジトリを公開（public）にする必要がある。コードは誰でも読めるが、予定などのデータはブラウザ内なのでコードには入らない。
スマホではそのURLを開き、「ホーム画面に追加」でアプリとして使える（HTTPSなので通知の許可も出せる）。

## 通知についての制約（okan-app との違い）

| | okan-app（実機・Expo Go） | この PWA 版 |
|---|---|---|
| アプリを閉じている間の通知 | 届く（ローカル通知を事前予約） | **届かない** |
| 開いている間の通知 | 届く | 届く（画面内バナー＋許可すればOS通知） |

- 通知はこのページ（またはインストールしたアプリ）を開いている間だけ判定する。20秒ごとに時刻を確認する
- 予定の60分前の通知は、予約時刻から5分以内に開いていれば出す。それ以降は「○分後」が嘘になるので出さない
- 届いたものだけを履歴に残す。画面が見えず、OS通知も許可されていない場合は出さない・残さない
- Pagesに置けばスマホでも開ける。ただし閉じている間の通知は届かない。閉じていても届かせたい場合は okan-app（Expo Go）を使う

## 構成

```
server.py        開発用の静的サーバ（保存はしない）
public/
  index.html / style.css / manifest.webmanifest / sw.js / icon-*.png
  js/            main, store, ui, weather, okan, notify, views/*
  lib/           okan-app から移植した純粋関数（日時・進捗・ルール・通知抑制）
tools/           port-from-expo.mjs（移植）/ verify-port.mjs（既存テストで検証）/ make_icons.py
start.bat        開発用サーバの起動

```

## 参考元から入れなかったもの

NEXTROUND の Firebaseログイン・クラウド同期・Cloudflare通知・AI添削・Notion取り込みは、おかんアプリに要らないので入れていない。
