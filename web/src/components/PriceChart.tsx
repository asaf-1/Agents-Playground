// Price drawings, as inline SVG. No chart library: a line and an area are a
// handful of points, and keeping it here means no new dependency ships to the
// browser for what is ultimately a <polyline>.
//
// Both scale to whatever they are given, so a coin at $0.39 and one at $67,000
// draw the same shape.

// React's unique id, and the chart's point type.
import { useId } from "react";
import type { PricePoint } from "../marketApi";

// Up, down or flat: the colour of the line.
type Direction = "up" | "down" | "flat";

// Turn prices into "x,y x,y ..." inside a viewBox of width x height. A flat
// series would divide by zero, so it is drawn down the middle instead.
function toPoints(
  values: number[],
  width: number,
  height: number,
  pad = 0,
): string {
  // No prices, nothing to draw.
  if (values.length === 0) {
    return "";
  }
  // The lowest and highest price, the room inside the padding, and the gap
  // between points.
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const usable = height - pad * 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  // Each price as an x,y point across the width; a higher price sits higher.
  return values
    .map((value, index) => {
      const ratio = span === 0 ? 0.5 : (value - low) / span;
      const y = pad + (1 - ratio) * usable;
      return `${(index * step).toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

// The small line in a markets row. Decorative: the row already states the
// price and the change in text, so screen readers skip it.
export function Sparkline({
  values,
  direction,
}: {
  values: number[];
  direction: Direction;
}) {
  // A fixed small size.
  const width = 96;
  const height = 28;
  // The line, stretched to fit and hidden from screen readers.
  return (
    <svg
      className={`sparkline sparkline-${direction}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={toPoints(values, width, height, 3)} />
    </svg>
  );
}

// The coin page's chart: the same line over a filled area, with a baseline at
// the first price so a reader can see at a glance which side of the start the
// coin is on.
export function PriceChart({
  series,
  direction,
  label,
}: {
  series: PricePoint[];
  direction: Direction;
  label: string;
}) {
  // A unique id for the fill, and the chart's size.
  const gradientId = useId();
  const width = 720;
  const height = 240;
  const pad = 12;
  // The prices, as the line's points.
  const values = series.map((point) => point.priceMicros);
  const line = toPoints(values, width, height, pad);

  // Nothing to draw.
  if (!line) {
    return null;
  }

  // The first price, on the same scale as the line, drawn as the baseline.
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const firstRatio = span === 0 ? 0.5 : (values[0] - low) / span;
  const baseline = pad + (1 - firstRatio) * (height - pad * 2);

  // The chart as a picture with its label.
  return (
    <svg
      className={`price-chart price-chart-${direction}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      data-testid="coin-chart"
    >
      {/* The area's fill: a gradient from top to bottom. */}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop className="chart-fill-top" offset="0%" />
          <stop className="chart-fill-bottom" offset="100%" />
        </linearGradient>
      </defs>
      {/* The first price, as a line across. */}
      <line
        className="chart-baseline"
        x1="0"
        x2={width}
        y1={baseline}
        y2={baseline}
      />
      {/* The area under the line. */}
      <polygon
        className="chart-area"
        fill={`url(#${gradientId})`}
        points={`0,${height} ${line} ${width},${height}`}
      />
      {/* The line itself. */}
      <polyline className="chart-line" points={line} />
    </svg>
  );
}
