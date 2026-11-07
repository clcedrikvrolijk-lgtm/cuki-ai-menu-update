CUKI AI MENU v1.3.4 — LIVE POS PHOTO SLIDESHOW
=================================================

INSTALLATION
1. Close all previous CUKI AI Menu windows.
2. Extract the ZIP to a NEW folder.
3. Run INSTALL_AND_START.bat once (requires Node.js LTS + internet).
4. Next time run START_CUKI.bat.

LIVE WEEKLY SLIDESHOW
- Screen 1 shows one CUKI product at a time with its original photo from CUKI POS.
- Slides automatically change every 7 seconds.
- Prices, stock availability and published weekly selection refresh every 20 seconds.
- CUKI POS Admin > Weekly Menu > Publish controls which CUKIs appear.
- POS Admin > Products controls the photos, prices and sold-out status.
- No app reinstall is needed for weekly changes.

IMPORTANT: The Surface must be able to reach the CUKI POS public API:
  https://cuki-pos.onrender.com/api/menu/catalog
If your POS uses a DIFFERENT Render URL, edit pos-settings.json and set base_url.
The POS service must run the /api/menu/catalog and /api/menu/products/{id}/image
endpoints. If these routes are not yet deployed or POS is offline, the kiosk
shows a fallback CUKI poster; it does not fake live photos/prices.

OTHER SCREENS
- Swipe DOWN = Iconic CUKI Club signup QR.
- Swipe UP = Weekly Menu slideshow.
- Say "Hey CUKI, show payment" to show the original Pay.aw payment QR.
- Say "Hey CUKI, show the club" or "Hey CUKI, show the menu" for those screens.
- After each product loop, the Club QR and Pay.aw each appear for one minute.
- Local Windows speech recognition responds with one short line ONLY after a
  recognized voice request; no unsolicited talking. P=Pay.aw keyboard fallback.
- G=camera debug, F11=fullscreen.

UPDATABLE CONTENT
- The Club QR destination and fallback text are read from the GitHub
  display-content.json and refreshed every five minutes.
- Published weekly menu changes are fetched from your POS every 20 seconds.
- All images are the actual stored POS images; no synthetic product pictures.
- Temporary POS outages keep recent slides while the app is running.

PAYMENT SAFETY
The kiosk does not charge customers and cannot confirm payment. Always verify
merchant and amount in Pay.aw before paying.
