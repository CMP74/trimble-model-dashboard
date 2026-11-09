Trimble Connect PDF Download Fix

This ZIP replaces ONLY server/index.js. It uses the Trimble Connect legacy
Core API endpoint GET /files/fs/{fileId}/downloadurl to request a short-lived
preauthorised PDF download link, then downloads without forwarding the OAuth
token to the storage URL.

Installation (upload ZIP into project root first):
cd /workspaces/trimble-model-dashboard/trimble-model-dashboard
cp server/index.js server/index.js.before-pdf-download-fix
unzip -o Trimble_Connect_PDF_Download_Fix.zip -d .
node --check server/index.js

Restart the Express backend (Ctrl+C in its terminal, then npm run server).
Reconnect Trimble in the dashboard because backend sessions are in memory.
Keep Vite running. Click Index again in AI Search.

This has been syntax checked, but NOT tested against your authenticated
Trimble Connect project. If it fails, report the exact error message.
