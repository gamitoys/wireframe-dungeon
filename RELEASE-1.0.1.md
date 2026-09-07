# 1.0.1

店の名前は WIREFRAME DUNGEON のまま。
ホームの下の文字だけ WFダンジョン。

## Mac

```bash
cd ~/Desktop/wireframe-dungeon
git pull
npx cap sync ios
npx cap open ios
```

Xcode:

1. 左の青い App を選ぶ
2. General → Display Name: `WFダンジョン`
3. Version: `1.0.1`
4. Build: `4`
5. Assets → AppIcon に `AppIcon-1024.png` をドロップ（リポジトリの根にある）
6. 実行先 Any iOS Device (arm64)
7. Product → Archive → Distribute App → Upload

## App Store Connect

1. 配信 → ＋ → 1.0.1
2. ビルド 1.0.1 (4) を選択
3. スクショを明るい版に差し替え（6.7インチ）
   - SS1-title-bright.png
   - SS2-b1-bright.png
   - SS3-b5-king-bright.png
   - SS4-b10-bright.png
   - SS4b-b15-bright.png
   https://gamitoys.github.io/ から保存
4. このバージョンの新機能:

```
・ホーム画面の名前を「WFダンジョン」に変更
・アイコンを見やすく調整
・CFGボタンが押しやすくなりました
・アプリを開き直したときBGMが復帰するように修正
```

5. 審査に追加
