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

## Pre-launch thread (7 tweets, no emojis)
Each tweet goes with the matching image in `cards/kruv-N.png` (1600x900). Source: `kruv-cards.html` + `kruv-cards-capture.js`.

### 1. `cards/kruv-1.png`

**English (231)**

What is Kruv?

A launchpad where every coin is quoted in shares of the company behind an app. An Instagram coin trades against META. A YouTube coin trades against GOOGL.

A coin can't just ride the dollar. It has to beat its stock.

**Spanish (234)**

¿Qué es Kruv?

Un launchpad donde cada moneda cotiza en acciones de la empresa detrás de una app. Una moneda de Instagram cotiza contra META. Una de YouTube, contra GOOGL.

No basta con subir en dólares. Tiene que ganarle a su acción.

### 2. `cards/kruv-2.png`

**English (215)**

On Kruv, the app decides the pair.

Instagram, WhatsApp and Threads pair with META. YouTube and Gmail pair with GOOGL. Netflix pairs with NFLX.

The table is public and fixed, so no creator can pick an easier stock.

**Spanish (201)**

En Kruv, la app decide el par.

Instagram, WhatsApp y Threads van con META. YouTube y Gmail, con GOOGL. Netflix, con NFLX.

La tabla es pública y fija: ningún creador puede elegir una acción más fácil.

### 3. `cards/kruv-3.png`

**English (184)**

Every coin on Kruv has the same supply: 1,000,000,000, minted once.

800M are sold on the bonding curve. The last 200M go into the pool when the curve sells out.

Nobody can mint more.

**Spanish (195)**

Todas las monedas de Kruv tienen el mismo supply: 1.000.000.000, acuñado una sola vez.

800M se venden en la curva. Los últimos 200M van al pool cuando la curva se agota.

Nadie puede acuñar más.

### 4. `cards/kruv-4.png`

**English (189)**

The curve doesn't hold dollars. It holds the stock.

When you buy, your dollars buy shares of the paired company first, then those shares buy the coin. Selling runs the same path backwards.

**Spanish (201)**

La curva no guarda dólares. Guarda la acción.

Al comprar, tus dólares compran primero acciones de la empresa emparejada y después esas acciones compran la moneda. Vender hace el mismo camino al revés.

### 5. `cards/kruv-5.png`

**English (212)**

Two legs, one position.

Return in $ = (1 + coin vs stock) x (1 + stock vs $) - 1

A coin can be up against META while META is down. The scoreboard ranks coins by the first leg: how far they beat their own stock.

**Spanish (217)**

Dos patas, una posición.

Retorno en $ = (1 + moneda vs acción) x (1 + acción vs $) - 1

Una moneda puede subir contra META mientras META baja. El ranking ordena por la primera pata: cuánto le gana a su propia acción.

### 6. `cards/kruv-6.png`

**English (164)**

Fees on Kruv are fixed at launch:

1% curve fee on every buy and sell
0-2% creator tax, set once and capped
0% creator tax after graduation
Launching a coin is free

**Spanish (189)**

Las comisiones de Kruv se fijan al lanzar:

1% de comisión en cada compra y venta
0-2% de tasa del creador, fija y con tope
0% de tasa del creador tras graduarse
Lanzar una moneda es gratis

### 7. `cards/kruv-7.png`

**English (194)**

When a coin sells out its curve, it graduates.

The curve's stock and the last 200M coins form a pool, and that liquidity is locked. No withdraw path for anyone, team included.

$KRUV is coming.

**Spanish (197)**

Cuando una moneda agota su curva, se gradúa.

La acción de la curva y los últimos 200M forman un pool, y esa liquidez queda bloqueada. Nadie puede retirarla, tampoco el equipo.

$KRUV llega pronto.
