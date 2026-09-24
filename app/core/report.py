"""Self-contained HTML report renderer for GET /scans/{id}/report.

Backend-rendered data export (not the interactive app — that's FRONTEND.md's
scope), so this is deliberately plain: inline CSS only, no JS, no external
assets, safe to download/forward/print.
"""

import html

_RISK_COLORS = {
    "low": "#16a34a",
    "medium": "#d97706",
    "high": "#ea580c",
    "critical": "#dc2626",
}


def _esc(value) -> str:
    return html.escape(str(value)) if value is not None else ""


def _format_dt(value) -> str:
    return value.isoformat() if value is not None else "—"


def render_report_html(scan, results: list) -> str:
    risk_color = _RISK_COLORS.get(scan.risk_score or "low", "#6b7280")

    category_rows = "".join(
        f"<tr><td>{_esc(cat)}</td><td>{stats.get('tested', 0)}</td>"
        f"<td>{stats.get('broke_through', 0)}</td><td>{stats.get('inconclusive', 0)}</td></tr>"
        for cat, stats in (scan.category_breakdown or {}).items()
    )

    def _row_class(r) -> str:
        if r.inconclusive:
            return "inconclusive"
        return "broke-through" if r.broke_through else "resisted"

    def _verdict_label(r) -> str:
        if r.inconclusive:
            return f"INCONCLUSIVE ({_esc(r.error_reason or 'unknown')})"
        return "BROKE THROUGH" if r.broke_through else "resisted"

    result_rows = "".join(
        f'<tr class="{_row_class(r)}">'
        f"<td><code>{_esc(r.attack_id)}</code></td>"
        f"<td>{_esc(r.category)}</td>"
        f"<td>{_esc(r.technique)}</td>"
        f"<td>{_verdict_label(r)}</td>"
        f"<td>{_esc(r.severity)}</td>"
        f"<td>{f'{r.confidence:.2f}' if r.confidence is not None else '—'}</td>"
        f"<td class=\"evidence\">{_esc(r.evidence)}</td>"
        "</tr>"
        for r in results
        if not r.is_error
    )

    error_rows = "".join(
        f"<tr><td><code>{_esc(r.attack_id)}</code></td><td>{_esc(r.category)}</td>"
        f"<td>{_esc(r.technique)}</td><td>{_esc(r.error_reason)}</td></tr>"
        for r in results
        if r.is_error
    )

    error_section = ""
    if error_rows:
        error_section = f"""
        <h2>Errors ({sum(1 for r in results if r.is_error)})</h2>
        <table>
          <thead><tr><th>Attack ID</th><th>Category</th><th>Technique</th><th>Reason</th></tr></thead>
          <tbody>{error_rows}</tbody>
        </table>
        """

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SafeSec Agents report — {_esc(scan.target_name)}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; color: #1a1a1a; }}
  h1 {{ margin-bottom: 0.25rem; }}
  .subtitle {{ color: #6b7280; margin-top: 0; }}
  .risk-badge {{ display: inline-block; padding: 0.35rem 0.9rem; border-radius: 999px;
                 color: white; font-weight: 600; text-transform: uppercase;
                 font-size: 0.85rem; background: {risk_color}; }}
  .summary {{ display: flex; gap: 2rem; margin: 1.5rem 0; flex-wrap: wrap; }}
  .stat {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
           padding: 0.75rem 1.25rem; }}
  .stat .value {{ font-size: 1.5rem; font-weight: 700; }}
  .stat .label {{ color: #6b7280; font-size: 0.8rem; text-transform: uppercase; }}
  table {{ width: 100%; border-collapse: collapse; margin: 1rem 0 2rem; font-size: 0.9rem; }}
  th, td {{ text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid #e5e7eb; }}
  th {{ background: #f9fafb; }}
  tr.broke-through {{ background: #fef2f2; }}
  tr.broke-through td:nth-child(4) {{ color: #dc2626; font-weight: 700; }}
  tr.resisted td:nth-child(4) {{ color: #16a34a; }}
  tr.inconclusive {{ background: #fffbeb; }}
  tr.inconclusive td:nth-child(4) {{ color: #b45309; font-weight: 700; }}
  .evidence {{ font-family: ui-monospace, monospace; font-size: 0.8rem; color: #374151;
               max-width: 320px; }}
  code {{ font-family: ui-monospace, monospace; }}
  footer {{ color: #9ca3af; font-size: 0.8rem; margin-top: 3rem; }}
</style>
</head>
<body>
  <h1>SafeSec Agents security scan report</h1>
  <p class="subtitle">Target: <strong>{_esc(scan.target_name)}</strong> &middot; Scan ID: <code>{_esc(scan.scan_id)}</code></p>

  <span class="risk-badge">{_esc(scan.risk_score or 'unknown')} risk</span>

  <div class="summary">
    <div class="stat"><div class="value">{scan.total_attacks}</div><div class="label">Attacks run</div></div>
    <div class="stat"><div class="value">{scan.broke_through_count}</div><div class="label">Broke through</div></div>
    <div class="stat"><div class="value">{scan.inconclusive_count}</div><div class="label">Inconclusive</div></div>
    <div class="stat"><div class="value">{scan.error_count}</div><div class="label">Errors</div></div>
    <div class="stat"><div class="value">{(scan.duration_ms or 0) / 1000:.1f}s</div><div class="label">Duration</div></div>
  </div>

  <p>Started: {_format_dt(scan.started_at)} &middot; Completed: {_format_dt(scan.completed_at)}</p>

  <h2>Category breakdown</h2>
  <table>
    <thead><tr><th>Category</th><th>Tested</th><th>Broke through</th><th>Inconclusive</th></tr></thead>
    <tbody>{category_rows}</tbody>
  </table>

  <h2>Attack results ({len(results) - sum(1 for r in results if r.is_error)})</h2>
  <table>
    <thead>
      <tr><th>Attack ID</th><th>Category</th><th>Technique</th><th>Result</th>
          <th>Severity</th><th>Confidence</th><th>Evidence</th></tr>
    </thead>
    <tbody>{result_rows}</tbody>
  </table>

  {error_section}

  <footer>Generated by SafeSec Agents.</footer>
</body>
</html>"""
