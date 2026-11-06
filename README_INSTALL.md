# FieldView ITP/NCR + multi-object dashboard update

This is a **replacement-files package**, not a full standalone repository. Preserve all other existing project files and the backend.

## Install

1. Back up or commit your working repository first.
2. Extract this ZIP into the repository root, preserving `src/` and `public/fieldview/` paths. Allow these supplied files to replace the existing ones.
3. Run `npm run build` in your Codespace and fix any reported errors before committing. This package was syntax-parsed, but could not be tested against your full repository or a live Trimble session here.
4. Start your existing backend (`npm run server`) and Vite (`npm run dev`) as before.

## Changes

- 3D viewer reports **all selected objects**, including multiple selected objects and multiple model groups, while keeping the existing single-object panel.
- Selection summary aggregates object count, IFC types, materials, available volume quantities, and inspection status by distinct pour.
- Colour model by inspection status: green complete, amber in progress, red open NCR (takes precedence). Colour restoration uses existing viewer behaviour.
- Supplied `pour-form-links.csv` associations are retained. For any additional distinct `Full Pour ID` found in the loaded model, an ITP form is selected from real exported CSV forms, with occasional additional NCR records for visual demonstration.
- Every generated association is labelled **demonstration only**. The CSV form itself is genuine export data, but its association to the model is NOT verified.
- Pours without a Full Pour ID cannot be matched. No fabricated IFC IDs are written to the CSV.
- Existing Form Explorer, Asite tab, AI search and Model Data code is retained in App.tsx.

## Notes and limitations

- The demo association set is calculated from the loaded model's Full Pour IDs. The original three links in `pour-form-links.csv` remain unchanged.
- The volume summary prioritizes NetVolume, then GrossVolume, then Volume, parsing numeric values with optional m³/m3. Units without a unit label are assumed to be m³; verify your model's units. Missing values are explicitly counted, and the total may be partial.
- Inspection status is based on the linked form's exported status, not on a live FieldView API or independently validated ITP completion.
- Full integration and TypeScript build validation require the rest of the existing repository (including App.css, services/modelService.ts, tsconfig and installed dependencies), which were not supplied in Update_01.zip.
