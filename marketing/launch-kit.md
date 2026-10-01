# Kruv launch kit

## Video
- `kruv-launch.mp4`: 24 s, 1080×1080, H.264, no audio. Ready to upload to X.
- `kruv-launch-cover.jpg`: final frame, usable as a thumbnail.
- `kruv-video.html` + `kruv-video-capture.js`: the source. To re-render, put them next to the fonts (`fonts-local.css` + woff2 files) and the logo as `mark.png`, run `node kruv-video-capture.js frames`, then:
  `ffmpeg -framerate 30 -i frames/f%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart kruv-launch.mp4`

## Tweet (English)
$KRUV is live 🚀

Kruv is a launchpad where every coin trades against the stock behind its app: Instagram vs $META, YouTube vs $GOOGL.

Every buy puts the stock into the curve. When it sells out, liquidity locks forever.

CA: [CA]

## Tweet (Spanish)
$KRUV ya está en vivo 🚀

Kruv es un launchpad donde cada moneda cotiza contra la acción detrás de su app: Instagram vs $META, YouTube vs $GOOGL.

Cada compra mete la acción en la curva. Al agotarse, la liquidez se bloquea para siempre.

CA: [CA]

## Bio
Coins quoted in the stock behind the app 🛰️ Every buy puts the stock in the curve. Liquidity locks at graduation. $KRUV · CA 👇

Spanish bio: Monedas que cotizan en la acción detrás de la app 🛰️ Cada compra mete la acción en la curva. Liquidez bloqueada al graduar. $KRUV

All texts fit X's limits with a 44-character Solana contract address in place of [CA] (tweets ≤ 280, bio ≤ 160).
