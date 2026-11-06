FIELDVIEW INSPECTION LEGEND UPDATE

Contains only src/App.tsx. Based on the confirmed working multi-selection fix.

Install from your project root:
  unzip -o FieldView_Inspection_Legend_Update.zip -d .
  npm run build

Changes only the inspection status panel below the viewer and adds summary calculations.
Counts are distinct model Full Pour IDs, not number of BIM objects.
ITP completion is calculated independently of open NCR precedence.
Demo associations remain clearly labelled.

No changes to TrimbleViewer.tsx, fieldviewService.ts, CSVs, or dependencies.
