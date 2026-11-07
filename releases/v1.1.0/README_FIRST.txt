CUKI WEEKLY DISPLAY v1.1.0
===========================

WHAT THIS VERSION DOES
- Screen 1: full-screen weekly CUKI menu poster.
- Screen 2: large QR code for THE ICONIC CUKI CLUB.
- Swipe DOWN: Club.
- Swipe UP: Weekly menu.
- Arrow keys work as a backup.
- G toggles the small hand-camera debug preview.
- F11 toggles fullscreen in Electron/Windows.
- Voice is OFF by default and no OpenAI API key is required.

HOW THE MENU UPDATES
The app checks this remote file every few minutes:
https://raw.githubusercontent.com/clcedrikvrolijk-lgtm/cuki-ai-menu-update/main/display-content.json

That file contains the weekly menu copy and CUKI Club join URL.
The last successful version is cached on the Surface, so a temporary internet problem will not blank the display.

INSTALL
1. Extract this folder.
2. Run INSTALL_AND_START.bat once.
3. After that use START_CUKI.bat.

TO CHANGE THE WEEKLY MENU
Update display-content.json in the CUKI AI Menu update repository.
No app rebuild is required.

CUKI CLUB
The QR destination is controlled by club.join_url in display-content.json.
