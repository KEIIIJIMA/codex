# images フォルダ

スライドショー用の画像をここに置いてください。

## 推奨形式

- フォーマット: WebP（サイズが小さく高品質）または JPG
- 解像度: 1920×1080 以上
- ファイル名: bg1.webp, bg2.webp, bg3.webp など

## config.js への登録

```js
slideshow: {
  images: [
    { src: "images/bg1.webp", label: "Scene 1" },
    { src: "images/bg2.webp", label: "Scene 2" },
    { src: "images/bg3.webp", label: "Scene 3" },
  ],
}
```

画像が1枚もない場合はグラデーションアニメーションで代替表示します。
