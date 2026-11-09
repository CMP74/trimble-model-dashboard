TRIMBLE DASHBOARD — UNIFIED SEARCH UI FIX

Replacement file: src/App.tsx ONLY.
Based on the PDF Index Stage 1 App.tsx already supplied. Preserves existing BIM, FieldView, selection and Excel features.

Install from project root:
  cp src/App.tsx src/App.tsx.before-search-fix
  unzip -o Trimble_Project_Search_UI_Fix.zip -d .
  npm run build

Vite hot reload should update the interface. Keep Express running: the indexed PDF pages are held in backend memory and will be lost if Express is restarted.

In AI Search:
  1. Ensure Drg_index_Test.pdf has been indexed (if backend restarted, index again).
  2. Enter concrete or padstone into the ONE search field.
  3. Click Search all sources.
  4. Results from indexed PDFs appear in the PDF results section with page numbers; BIM/FieldView demonstration matches appear below.
  5. Clear search resets both sets of results.

Note: PDF search is literal text search; it is not semantic AI. Natural-language sentences may not match PDF text. The backend is unchanged.
