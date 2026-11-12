// Tables on a phone: each cell carries its column's name, so the phone CSS in
// app.css can turn a row into a card that reads "Email  maya@…" line by line.
// One hook in the layout does it for every table on every page, including
// tables added later, so no page has to label its own cells.

// React's effect hook, and the type of a ref to an element.
import { useEffect, type RefObject } from "react";

// Copies each header's name onto every body cell under it, as data-label. A
// cell that spans several columns takes the name of the first one. A header
// with no text (an actions column) gives an empty name, which the CSS shows as
// the cell alone. Only cells whose name changed are written.
export function labelTable(table: HTMLTableElement): void {
  // The column names, from the header's first row.
  const headerRow = table.tHead?.rows[0];
  if (!headerRow) return;
  const names: string[] = [];
  for (const header of Array.from(headerRow.cells)) {
    const name = (header.textContent ?? "").trim();
    for (let span = 0; span < header.colSpan; span += 1) names.push(name);
  }

  // Each body cell, matched to its column by counting spans along the row.
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      let column = 0;
      for (const cell of Array.from(row.cells)) {
        const name = names[column] ?? "";
        if (cell.dataset.label !== name) cell.dataset.label = name;
        column += cell.colSpan;
      }
    }
  }
}

// Labels every table inside the element now, and again whenever its content
// changes (a page opens, rows load, a row is added). It watches only for added
// and removed nodes, so writing the labels never sets it off again.
export function useTableLabels(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Label every table under the element.
    const run = () => root.querySelectorAll("table").forEach(labelTable);
    run();
    // And again after every change below it, until the layout goes away.
    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ref]);
}
