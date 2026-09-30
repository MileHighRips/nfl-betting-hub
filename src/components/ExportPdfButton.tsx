'use client';

import { FileDown } from 'lucide-react';

/** Triggers the browser print dialog to export the page's print-only document. */
export default function ExportPdfButton({
  label = 'Export PDF',
  title,
}: {
  label?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
    >
      <FileDown size={14} />
      {label}
    </button>
  );
}
