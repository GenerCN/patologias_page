---
target: patologias.html
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\Sistemas\\Documents\\AppScript\\patologias_page\\patologias.html"
target_fingerprint: "sha256:d6d2555ad68cd7c57482041844f55933df9c54d5d8e3693a3a0f8ef383b90fc8"
target_path: "C:\\Users\\Sistemas\\Documents\\AppScript\\patologias_page\\patologias.html"
timestamp: 2026-10-19T21-29-13Z
slug: patologias-html
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | No "last updated" time |
| 2 | Match System / Real World | 3 | Meaningless arrow icon on "Sin resultado físico" chip |
| 3 | User Control and Freedom | 3 | No "clear all filters" |
| 4 | Consistency and Standards | 2 | Overlapping chips vs stage bar; same blue for both wait stages |
| 5 | Error Prevention | 3 | Nivel silently overwrites monto; no date-order check |
| 6 | Recognition Rather Than Recall | 3 | Patient names truncated |
| 7 | Flexibility and Efficiency | 2 | No keyboard row nav, shortcuts, per-role default view |
| 8 | Aesthetic and Minimalist Design | 3 | Columns of em-dashes dominate |
| 9 | Error Recovery | 3 | Good partial-save + retry |
| 10 | Help and Documentation | 2 | Help only in title tooltips; no Días legend |
| **Total** | | **27/40** | **Acceptable (high)** |

## Design Specificity Verdict
Mostly product-specific (derived stages, Vía cita, 10-day SLA, separate billing, clinic copy); visual shell generic (Inter, navy, white cards).
Detector: static 2 (cramped-padding FP, overused-font intentional); side-tab gone. Rendered: low-contrast .pill-no 4.4:1, tr.active .col-id small 4.3:1. Both assessments: Etapa pill loses background on active row. Overlay not possible (headless only).

## Priority Issues
- [P0] Rows not keyboard-operable (table.js:93 click-only). Fix: folio as button, arrow-key nav. /impeccable harden
- [P1] Panel lacks dialog semantics/focus management; locked sections icon-only. /impeccable harden
- [P1] Role-editable fields buried under locked sections for admisión/contabilidad. /impeccable layout
- [P2] Overlapping filter systems; "Todos N" misleading under chip; chips lack aria-pressed. /impeccable distill
- [P2] Silent monto overwrite (nivel 5 stale); color collisions (wait stages same blue, active-row pill vanishes, "tarde" uses check icon). /impeccable polish + clarify

## Persona Red Flags
Alex: no shortcuts, no row keyboard nav / save-and-next, single sortable column, filters lost on reload, no per-role default view.
Sam: rows unreachable by keyboard, no panel focus management, chips without aria-pressed, tooltip-only help, "tarde" check reads as success, toast not role=status.

## Minor Observations
Auto table layout in empty/error states; zero stage bar on empty search; truncated placeholder at 900px; 2-digit years; subtle active-row marker.

## Questions to Consider
1. Per-role default worklist?
2. Per-role column set instead of 13 columns?
3. One-click "mark received today" stage actions instead of typing dates?
