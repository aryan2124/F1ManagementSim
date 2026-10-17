import type { ReactNode } from "react";

/** Small flags drawn from rectangles (crisp pixels). Unknown nations get a grey flag with the code. */

type Band = [colour: string, weight: number];
const H = (bands: Band[]): ReactNode => {
  const total = bands.reduce((a, b) => a + b[1], 0);
  let y = 0;
  return bands.map(([c, w], i) => {
    const h = (w / total) * 20;
    const r = <rect key={i} x={0} y={y} width={30} height={h + 0.01} fill={c} />;
    y += h;
    return r;
  });
};
const V = (bands: Band[]): ReactNode => {
  const total = bands.reduce((a, b) => a + b[1], 0);
  let x = 0;
  return bands.map(([c, w], i) => {
    const wd = (w / total) * 30;
    const r = <rect key={i} x={x} y={0} width={wd + 0.01} height={20} fill={c} />;
    x += wd;
    return r;
  });
};

const jack = (x: number, y: number, w: number, h: number): ReactNode => (
  <g transform={`translate(${x} ${y}) scale(${w / 30} ${h / 20})`}>
    <rect width={30} height={20} fill="#012169" />
    <path d="M0 0L30 20M30 0L0 20" stroke="#fff" strokeWidth={4} />
    <path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" strokeWidth={1.6} />
    <rect x={12} width={6} height={20} fill="#fff" />
    <rect y={7} width={30} height={6} fill="#fff" />
    <rect x={13.2} width={3.6} height={20} fill="#c8102e" />
    <rect y={8.2} width={30} height={3.6} fill="#c8102e" />
  </g>
);

const FLAGS: Record<string, ReactNode> = {
  FRA: V([["#0055a4", 1], ["#ffffff", 1], ["#ef4135", 1]]),
  ITA: V([["#009246", 1], ["#ffffff", 1], ["#ce2b37", 1]]),
  GER: H([["#000000", 1], ["#dd0000", 1], ["#ffce00", 1]]),
  NED: H([["#ae1c28", 1], ["#ffffff", 1], ["#21468b", 1]]),
  ESP: H([["#aa151b", 1], ["#f1bf00", 2], ["#aa151b", 1]]),
  MON: H([["#ce1126", 1], ["#ffffff", 1]]),
  MEX: (
    <>
      {V([["#006847", 1], ["#ffffff", 1], ["#ce1126", 1]])}
      <circle cx={15} cy={10} r={2.6} fill="#8c6a2f" />
    </>
  ),
  FIN: (
    <>
      <rect width={30} height={20} fill="#ffffff" />
      <rect x={8} width={4.5} height={20} fill="#003580" />
      <rect y={7.75} width={30} height={4.5} fill="#003580" />
    </>
  ),
  ARG: (
    <>
      {H([["#74acdf", 1], ["#ffffff", 1], ["#74acdf", 1]])}
      <circle cx={15} cy={10} r={2.2} fill="#f6b40e" />
    </>
  ),
  BRA: (
    <>
      <rect width={30} height={20} fill="#009c3b" />
      <path d="M15 2L27 10L15 18L3 10Z" fill="#ffdf00" />
      <circle cx={15} cy={10} r={4.4} fill="#002776" />
      <path d="M10.7 9.2Q15 8 19.3 11" stroke="#fff" strokeWidth={0.9} fill="none" />
    </>
  ),
  THA: H([["#a51931", 1], ["#f4f5f8", 1], ["#2d2a4a", 2], ["#f4f5f8", 1], ["#a51931", 1]]),
  CAN: (
    <>
      {V([["#d52b1e", 1], ["#ffffff", 2], ["#d52b1e", 1]])}
      <path d="M15 4.5L16.4 8L19 7.2L18 11L20 12L15.8 13L15.8 16H14.2L14.2 13L10 12L12 11L11 7.2L13.6 8Z" fill="#d52b1e" />
    </>
  ),
  GBR: jack(0, 0, 30, 20),
  NZL: (
    <>
      <rect width={30} height={20} fill="#00247d" />
      {jack(0, 0, 15, 10)}
      {[[22, 4], [26, 9], [22, 15], [19, 9]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.3} fill="#cc142b" stroke="#fff" strokeWidth={0.4} />)}
    </>
  ),
  AUS: (
    <>
      <rect width={30} height={20} fill="#00008b" />
      {jack(0, 0, 15, 10)}
      {[[7.5, 15], [22, 4], [26, 9], [22, 17], [18, 9]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.2} fill="#fff" />)}
    </>
  ),
  USA: (
    <>
      {H(Array.from({ length: 13 }, (_, i) => [i % 2 ? "#ffffff" : "#b22234", 1] as Band))}
      <rect width={12} height={10.8} fill="#3c3b6e" />
    </>
  ),
  JPN: (
    <>
      <rect width={30} height={20} fill="#ffffff" />
      <circle cx={15} cy={10} r={5.4} fill="#bc002d" />
    </>
  ),
  CHN: (
    <>
      <rect width={30} height={20} fill="#de2910" />
      <circle cx={6} cy={6} r={2.6} fill="#ffde00" />
      {[[11, 2.5], [13, 5], [13, 8.5], [11, 11]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.9} fill="#ffde00" />)}
    </>
  ),
  DEN: (
    <>
      <rect width={30} height={20} fill="#c8102e" />
      <rect x={9} width={3.5} height={20} fill="#fff" />
      <rect y={8.25} width={30} height={3.5} fill="#fff" />
    </>
  ),
};

export function Flag({ nat, height = 20 }: { nat?: string; height?: number }) {
  const art = nat ? FLAGS[nat] : undefined;
  return (
    <svg className="flag" viewBox="0 0 30 20" width={height * 1.5} height={height} shapeRendering="crispEdges" role="img" aria-label={nat ?? "flag"} style={{ outline: "2px solid rgba(0,0,0,0.6)", display: "block" }}>
      {art ?? (
        <>
          <rect width={30} height={20} fill="#555a6e" />
          <text x={15} y={13} fontSize={7} textAnchor="middle" fill="#fff" fontFamily="monospace">{nat ?? "?"}</text>
        </>
      )}
    </svg>
  );
}
