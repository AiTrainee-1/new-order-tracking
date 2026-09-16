import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  keyFor,
  emptyMessage = "Nothing to show yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  keyFor: (row: T) => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="text-2xl">📋</span>
        <p className="text-sm text-ink-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-white/80 bg-white/60">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/80 bg-white/70 text-xs uppercase tracking-wide text-ink-500">
            {columns.map((col) => (
              <th key={col.header} className={`whitespace-nowrap px-3 py-2.5 font-semibold ${col.className ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyFor(row)} className="border-b border-white/70 transition-colors last:border-0 hover:bg-white/80">
              {columns.map((col) => (
                <td key={col.header} className={`px-3 py-3.5 align-middle text-ink-800 ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
