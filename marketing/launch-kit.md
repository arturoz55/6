# Kruv pre-launch kit

## Video
- `kruv-teaser.mp4`: 24 s, 1080×1080, H.264, no audio. Ends on the Kruv mark and wordmark, with no launch or contract text, so it works before launch.
- `kruv-teaser-cover.jpg`: final frame, usable as a thumbnail.
- `kruv-video.html` + `kruv-video-capture.js`: the source. To re-render, put them next to the fonts (`fonts-local.css` + woff2 files) and the logo as `mark.png`, run `node kruv-video-capture.js frames`, then:
  `ffmpeg -framerate 30 -i frames/f%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart kruv-teaser.mp4`

## Pre-launch tweet (English, 239 characters)
Introducing Kruv 🛰️

A launchpad where every coin trades against the stock behind its app: Instagram vs $META, YouTube vs $GOOGL.

Every buy puts the stock into the curve. Sell out the curve and liquidity locks for good.

$KRUV is coming.

## Pre-launch tweet (Spanish, 258 characters)
Os presentamos Kruv 🛰️

Un launchpad donde cada moneda cotiza contra la acción de la empresa detrás de su app: Instagram vs $META, YouTube vs $GOOGL.

Cada compra mete la acción en la curva. Cuando se agota, la liquidez queda bloqueada.

$KRUV llega pronto.

## Bio (English, 126 characters)
Coins quoted in the stock behind the app 🛰️ Every buy puts the stock in the curve. Liquidity locks at graduation. $KRUV soon.

## Bio (Spanish, 138 characters)
Monedas que cotizan en la acción detrás de la app 🛰️ Cada compra mete la acción en la curva. Liquidez bloqueada al graduar. $KRUV pronto.
