---
target: patologias.html
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Sistemas\\Documents\\AppScript\\patologias_page\\patologias.html"
target_fingerprint: "sha256:b878169d836c6e702a216dbf6ea8bf41ab7fad1988c7a928432b5ea3962cc743"
target_path: "C:\\Users\\Sistemas\\Documents\\AppScript\\patologias_page\\patologias.html"
timestamp: 2026-10-19T20-16-10Z
slug: patologias-html
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Save closes panel; only a 3s non-announced toast |
| 2 | Match System / Real World | 3 | "Resultados no llegados" filters physical result while Días tracks digital |
| 3 | User Control and Freedom | 1 | Esc/×/Cancelar/row-click discard edits silently; panel closes before API save |
| 4 | Consistency and Standards | 2 | Mixed label casing; MONTO header misaligned; "Sí" and "Vía cita" identical pills |
| 5 | Error Prevention | 2 | No date-order validation; free-text monto; nivel overwrites monto |
| 6 | Recognition Rather Than Recall | 3 | Search-type must be chosen manually |
| 7 | Flexibility and Efficiency | 2 | No sort, no Vencidos filter, no keyboard nav, empty start |
| 8 | Aesthetic and Minimalist Design | 3 | Stat card repeats header count |
| 9 | Error Recovery | 2 | Developer-facing errors, no retry, edits lost |
| 10 | Help and Documentation | 2 | Mouse-only tooltips, no color legend |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict
Domain logic is product-specific (Días SLA badge, Vía cita, role-locked sections, queue filters); visual system is generic admin template. Pipeline rendered as 12 equal date columns.
Detector: static 3 (side-tab .stat-chip, overused-font Inter, cramped-padding .table-card = false positive); rendered 3 (side-tab, overused-font, low-contrast .pill-no 4.4:1). Overlay not possible (headless only).

## Priority Issues
- [P0] Silent data loss on edit: closePanel() before API (main.js:174), per-field sequential writes (111-113), global Esc closes (183). Fix: dirty tracking + confirm, keep panel open until success, retry on error. /impeccable harden
- [P1] Keyboard/screen reader: rows click-only, panel not a dialog, toast not live, search input unlabeled, back button unnamed. /impeccable audit + harden
- [P1] Días relies on red/green only; completed-late vs pending-late same red. Fix non-color cue, loudest for pending-overdue, Vencidos filter + sort. /impeccable colorize + clarify
- [P1] Table shows raw columns not workflow stage. Add Etapa/Siguiente paso column, clickable stage counts, auto-load per-role queue. /impeccable layout + distill
- [P2] Role-blind panel order (contabilidad editable section below fold). /impeccable layout

## Persona Red Flags
Alex: no sort, no keyboard row nav, manual search mode, empty start, save resets to page 1, N sequential API calls, no deep link, chips not combinable.
Sam: rows unreachable by keyboard, mouse-only th tooltips, Días meaning only in color/title, panel no dialog semantics, color-only status dot, toast not announced, disabled vs pointer-events inconsistency.

## Minor Observations
Closed panel shadow leak; long panel labels wrap; "Papanicolau" spelling; 900px panel pushes table to ~420px; monto unformatted in panel; unhelpful empty-search toast; duplicate titles; .pill-no contrast 4.4:1.

## Questions to Consider
1. Default screen per role = "my queue"?
2. Is entrega→digital the SLA that matters, or entrega→patient?
3. Should completed-late stay red forever?
