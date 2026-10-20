Dashboard cleanup — complete replacement files

From the React/Vite project directory (where package.json lives):
  unzip -o FieldView_Dashboard_Cleanup_Install.zip
  npm run build
  npm run dev

Files replaced:
  src/App.tsx
  src/components/TrimbleViewer.tsx (unchanged from latest working AI Search release)
  src/fieldviewService.ts (unchanged from latest working AI Search release)

Existing public/fieldview/*.csv files are retained and must remain in place.
The dashboard now uses loaded BIM element counts and CSV-driven form counts,
removes the legacy mock FieldView records and demo element selection controls,
and shows CSV-backed forms associated with the selected Full Pour ID.
Mock associations are still labelled as demonstration-only.
