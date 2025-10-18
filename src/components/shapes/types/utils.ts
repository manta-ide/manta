// this util functions generates an svg path from a list of points
export function generatePath(points: number[][]) {
  const path = points.map(([x, y]) => `${x},${y}`).join(' L');
  return `M${path} Z`;
}
