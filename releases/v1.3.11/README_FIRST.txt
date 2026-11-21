CUKI AI MENU v1.3.11 — REMOTE DISPLAY MANAGER
================================================

WHAT'S NEW
- The CUKI POS AI Display Owner page can disable AI Voice completely (listening and speaking).
- OFF prevents the Surface from running Windows voice recognition; the slideshow, payment keyboard shortcut and ready-order notifications remain available.
- Publish the new switch setting in POS to apply it on the Surface automatically.
- The slide Seconds editor no longer jumps back to 3 while replacing its contents.
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
- Hand swiping is temporarily disabled.
- Down arrow = Iconic CUKI Club. Up arrow = Weekly Menu.
- Say "Hey CUKI, show payment" = original Pay.aw QR.
- Voice responds only when asked. Kitchen-ready notices remain silent.
- P = Pay.aw keyboard fallback; F11 = fullscreen.

UPDATING
- Start the app using the OUTER START_CUKI.bat in the main CUKI AI Menu folder.
- Player software updates are delivered through the GitHub updater.
- Normal menu, image and video changes are published from CUKI POS; no app download is needed.

POS CONNECTION
  https://cuki-pos.onrender.com

Display controls
- Fullscreen starts on an external display when Windows is using Extend.
- Press Ctrl+Shift+D to select a screen or restore automatic selection.
- Press F11 to switch between fullscreen and windowed mode.
- Set the TV to its recommended resolution and orientation in Windows Display Settings.

READY ORDER NOTIFICATIONS (v1.3.11)
- Displays the customer-facing daily order number from the kitchen POS receipt (not the database ID).
- Announces new READY orders even after polling delays or brief disconnections.
- Keeps an in-memory record if browser storage is unavailable; no announcement on first connection for historic orders.
- Existing displays must start through the outer START_CUKI.bat with updater enabled to install this release.
- Test with a newly paid order, tap READY in Kitchen, and check for its daily order number on the TV.

CUKI KITCHEN READY DISPLAY - 60 SECONDS (v1.3.11)
- When Kitchen taps READY on a paid order, the customer's daily order number appears for 60 seconds.
- Owner > AI Display > Test READY display sends #999, visibly marked TEST. The test uses no real sale or payment.
- Display does not speak for READY notices; existing Pay.aw and menu playback continue afterward.
- Restart through the OUTER START_CUKI.bat with updates enabled to install v1.3.11.
