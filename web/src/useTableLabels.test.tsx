// Unit tests for the table labels behind the phone layout: every body cell
// carries its column's name, and a row that arrives later is labelled too.

// Vitest's test tools, React's state and ref, and Testing Library.
import { describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
// The function and the hook under test.
import { labelTable, useTableLabels } from "./useTableLabels";
// Adds lines to the [RESULT] block printed after each test.
import { expected, fact } from "../test/resultBlock";

// Builds a table from HTML, as a page would draw it.
function tableFrom(html: string): HTMLTableElement {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder.querySelector("table") as HTMLTableElement;
}

// The data-label of every body cell, row by row.
function labels(table: HTMLTableElement): string[][] {
  return Array.from(table.tBodies[0].rows).map((row) =>
    Array.from(row.cells).map((cell) => cell.dataset.label ?? "<none>"),
  );
}

// A page with one table: it starts with one row and gains a second on a
// click, so the test can watch a row that arrives after the first draw.
function GrowingTable() {
  const ref = useRef<HTMLElement>(null);
  useTableLabels(ref);
  const [rows, setRows] = useState(["Maya"]);
  return (
    <main ref={ref}>
      <button onClick={() => setRows([...rows, "Sam"])}>Add</button>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((name) => (
            <tr key={name}>
              <td>{name}</td>
              <td>Active</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

// labelTable on its own, then the hook inside a component.
describe("table labels for the phone layout", () => {
  // Each cell gets its column's header text; an empty header gives an empty
  // name, and a cell spanning two columns takes the first one's name.
  it("names each body cell after its column", () => {
    expected(
      "row 1: Name, Amount, '' (actions); row 2: Name (spans Name+Amount), ''",
    );
    const table = tableFrom(`
      <table>
        <thead><tr><th>Name</th><th> Amount </th><th></th></tr></thead>
        <tbody>
          <tr><td>Maya</td><td>$10.00</td><td><button>⋯</button></td></tr>
          <tr><td colspan="2">No amount yet</td><td></td></tr>
        </tbody>
      </table>`);
    labelTable(table);
    const result = labels(table);
    fact(
      "labels",
      result.map((row) => row.join(" | ")),
    );
    expect(result).toEqual([
      ["Name", "Amount", ""],
      ["Name", ""],
    ]);
  });

  // A table with no header row is left alone.
  it("leaves a table with no header untouched", () => {
    expected("no data-label on any cell");
    const table = tableFrom(
      "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>",
    );
    labelTable(table);
    const result = labels(table);
    fact(
      "labels",
      result.map((row) => row.join(" | ")),
    );
    expect(result).toEqual([["<none>", "<none>"]]);
  });

  // The hook labels the first draw, and a row added later on its own.
  it("labels a row that arrives after the first draw", async () => {
    expected("Maya's cells labelled Name/Status; after Add, Sam's too");
    render(<GrowingTable />);
    // The first row, labelled on mount.
    expect(screen.getByText("Maya")).toHaveAttribute("data-label", "Name");
    expect(screen.getAllByText("Active")[0]).toHaveAttribute(
      "data-label",
      "Status",
    );
    // A new row: the watcher labels it without the page doing anything.
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() =>
      expect(screen.getByText("Sam")).toHaveAttribute("data-label", "Name"),
    );
    fact("rows", ["Maya", "Sam"]);
  });
});
