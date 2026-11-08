CUKI AI MENU v1.3.6 — REMOTE DISPLAY MANAGER
================================================

WHAT'S NEW
- CUKI POS now controls the Surface display playlist.
- Owner > AI Display lets you upload images and videos, reorder slides, set durations, save drafts and publish.
- Supported media: JPG, PNG, WebP, MP4 and WebM; maximum 50 MB per file.
- Uploaded media and playlist settings are stored in the existing CUKI POS PostgreSQL database.
- The Surface checks for published changes every 5 seconds and updates without downloading a new app.
- Videos autoplay muted and loop for the configured slide duration.
- The weekly POS menu and Iconic CUKI Club QR can be included in the same playlist.
- Draft preview is separate from the published/live preview.

LIVE OVERVIEW AND PAIRING
- Open CUKI POS > AI Display on another PC to see the draft and published playlist.
- Select "Pair / reconnect Surface" to generate an eight-digit code.
- Enter that code once in the CUKI AI Menu pairing prompt on the Surface.
- The Surface reports its online status, current slide and app version to the POS.
- Pairing codes expire after 10 minutes and can only be used once.

KITCHEN READY CALLOUT
- Kitchen taps READY as usual.
- The customer display shows a branded, silent order-ready callout with order number only.
- The callout disappears after 12 seconds.

OTHER SCREENS
- Swipe DOWN = Iconic CUKI Club (when included in the playlist).
- Swipe UP = Weekly Menu (when included in the playlist).
- Say "Hey CUKI, show payment" = original Pay.aw QR.
- Voice responds only when asked. Kitchen-ready notices remain silent.
- P = Pay.aw keyboard fallback; G = camera debug; F11 = fullscreen.

UPDATING
- Start the app using the OUTER START_CUKI.bat in the main CUKI AI Menu folder.
- Player software updates are delivered through the GitHub updater.
- Normal menu, image and video changes are published from CUKI POS; no app download is needed.

POS CONNECTION
  https://cuki-pos.onrender.com
