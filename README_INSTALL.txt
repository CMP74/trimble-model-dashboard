FieldView ITP completion clarification

Contains only src/App.tsx, based on the uploaded latest App (2).tsx.

Changes:
- Shows real export-wide ITP completion separately from demo-linked model pour completion.
- Uses the actual FieldView ITP forms and completed statuses (Complete, Complete - Archived, Closed).
- Labels both progress indicators as read-only and reports exact numerator/denominator.
- Warns if demonstration ITP form IDs cannot be found in the export.
- Does not change mapping CSVs, Trimble viewer, multi-selection, colour precedence or form navigation.

Install from project root: unzip -o FieldView_ITP_Completion_Clarification.zip -d .
Then run: npm run build
