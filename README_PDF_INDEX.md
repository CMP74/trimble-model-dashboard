# Trimble Connect PDF Index — Stage 1

This is a **read-only pilot**. It preserves the supplied App.tsx, viewer, and backend and adds PDF listing, extraction, and search. It does not modify any Trimble Connect files or claim verified BIM/drawing associations.

## Install

From your repository root, **back up/commit your working files first**. Extract the ZIP at the repository root, preserving directories (`src/`, `server/`). Replace the four files included. Then:

```bash
npm install
npm run build
npm run server
```

In a separate terminal:

```bash
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Keep the existing Vite proxy to port 3000 and the existing Trimble OAuth environment settings. Do not share `.env` or tokens.

## Folder configuration

Set `TRIMBLE_DOCUMENT_FOLDER_ID` in the **backend** environment to the Trimble Connect folder ID containing the PDF. If unset, the existing model folder ID `KVqla3gS1XY` is used; that folder may not contain your PDF. Restart the backend after changing it.

## Test

1. Log in to Trimble Connect as usual.
2. Open **AI Search (demo)**, click **Find PDFs in Trimble Connect**.
3. Choose **Index PDF** for the drawing pack.
4. Enter a distinctive phrase from the general notes and click **Search indexed PDF text**.
5. Results include source filename, page number, and extracted excerpt.

## Known limitation — important

The file-listing API follows the backend's existing `folders/{id}/items` convention. The **file download URL (`files/{id}/download`) has not been verified against your live Trimble Connect tenant**. If indexing reports an HTTP 404/403 or non-PDF response, do not change OAuth or the working model integration: the download URL/response needs adapting to the actual Trimble API response. The backend deliberately reports this error instead of fabricating indexed pages. The index is in-memory only; restart clears it. No OCR, AI-generated answers, verified drawing links, or direct PDF deep links are included yet.
