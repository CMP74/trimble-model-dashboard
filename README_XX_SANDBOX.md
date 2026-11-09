# Trimble Connect PDF index — XX Sandbox folder discovery

This update replaces **server/index.js only**. It leaves the existing React dashboard, model viewer, FieldView and Excel functionality unchanged.

## What changed

- Looks up project `7nAFSwau0CI` using the authenticated Trimble Connect API.
- Reads its root folder ID, lists top-level items, and finds the folder named `XX Sandbox` (case-insensitive).
- Uses that folder ID to list and index PDF files; the model folder remains unchanged.
- `/api/documents/status` now shows `folderName`, `folderId`, and a readable `error` if discovery fails.
- Set `TRIMBLE_DOCUMENT_FOLDER_NAME` to use another top-level folder, or `TRIMBLE_DOCUMENT_FOLDER_ID` to override automatic discovery.

## Install

Upload `Trimble_Connect_PDF_Index_XX_Sandbox.zip` to your Codespaces project root, then:

```bash
cd /workspaces/trimble-model-dashboard/trimble-model-dashboard
cp server/index.js server/index.js.pre-xx-sandbox
unzip -o Trimble_Connect_PDF_Index_XX_Sandbox.zip -d .
node --check server/index.js
```

Restart **only** the Express backend (`npm run server`) so it loads the new file. Keep Vite running if it is already running.

Test:

```bash
curl -s http://localhost:3000/api/documents/status
curl -s http://localhost:3000/api/documents
```

Then open AI Search and click **Find PDFs in Trimble Connect**.

## Known limitation

The project root discovery and file-download API calls have not been verified against your live Trimble Connect tenant. If discovery fails, the status endpoint reports the error. This update does not modify any Trimble Connect files or require Asite access.
