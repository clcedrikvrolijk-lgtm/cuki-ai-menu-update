CUKI AI MENU v1.3.5 — LIVE POS SLIDESHOW + KITCHEN READY CALLOUT
===================================================================

WHAT'S NEW
- The Surface checks the CUKI POS Kitchen ready-order feed every 5 seconds.
- When Kitchen taps READY, the customer display shows a branded CUKI callout.
- The callout shows only the order number and collection instruction.
- The callout is visual and silent. It never speaks or plays a sound.
- It stays on screen for 12 seconds, then returns to the current menu/Club/Pay.aw screen.
- Multiple orders marked ready close together are grouped in the same callout.

LIVE WEEKLY SLIDESHOW
- One published CUKI POS product per slide, using the real product image stored in POS.
- Slides change every 7 seconds.
- Published selection, price and availability refresh every 20 seconds.
- POS Admin > Weekly Menu > Publish controls the selection.
- POS Admin > Products controls product photos, prices and availability.
- No weekly-menu ZIP download is needed.

KITCHEN READY CALLOUT
- The POS Kitchen tablet marks an order Ready as usual.
- The kiosk reads the public, read-only endpoint:
  /api/kitchen/ready-display
- That endpoint returns only order number and ready timestamp for recent ready orders.
- It does not expose customer names, order contents, payment amounts or payment details.
- The endpoint is limited to orders marked ready in the last 15 minutes.
- The kiosk polls every 5 seconds and remembers recent notifications to avoid repeats.

OTHER SCREENS
- Swipe DOWN = Iconic CUKI Club QR.
- Swipe UP = Weekly Menu slideshow.
- Say "Hey CUKI, show payment" = original Pay.aw QR.
- Say "Hey CUKI, show the club" or "Hey CUKI, show the menu" for those screens.
- Voice only responds to a recognized request. The order-ready callout is always silent.
- P = Pay.aw keyboard fallback; G = camera debug; F11 = fullscreen.

UPDATING
- The app uses the GitHub updater.
- Start the app using the OUTER START_CUKI.bat in the main CUKI AI Menu folder.
- It checks latest.json and applies updates automatically.
- Weekly menu and POS product changes come directly from CUKI POS; no app reinstall is needed.

POS CONNECTION
  https://cuki-pos.onrender.com
The Surface must have internet access to reach the POS service.
