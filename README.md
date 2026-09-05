# WIREFRAME DUNGEON — iOS

Gami Toys Works  
Bundle ID: `works.gamitoys.wireframedungeon`

## Mac

1. Xcode と Node.js LTS を入れる
2. ターミナル:

```bash
cd ~/Desktop
git clone https://github.com/gamitoys/wireframe-dungeon.git
cd wireframe-dungeon
npm install
cp node_modules/three/build/three.min.js www/three.min.js
npx cap add ios
npx cap sync ios
npx cap open ios
```

AppIcon は、先に保存した `AppIcon-1024.png` を Xcode の AppIcon へドラッグ。

Signing: Team を自分に。Bundle ID は `works.gamitoys.wireframedungeon`。
Portrait のみ。`ITSAppUsesNonExemptEncryption` = NO。
Product → Archive → App Store Connect へ Upload。
