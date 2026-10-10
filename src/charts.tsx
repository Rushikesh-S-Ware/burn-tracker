import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useC } from './theme';

export type Point = { label: string; value: number };

/** Simple line chart: values over time with an optional dashed reference line. */
export function LineChart({
  points,
  color,
  reference,
  referenceLabel,
  height = 150,
  format = (v: number) => String(Math.round(v * 10) / 10),
}: {
  points: Point[];
  color: string;
  reference?: number;
  referenceLabel?: string;
  height?: number;
  format?: (v: number) => string;
}) {
  const C = useC();
  const [width, setWidth] = useState(0);
  const PAD = { l: 38, r: 12, t: 12, b: 18 };
  const vals = points.map((p) => p.value);
  const all = reference !== undefined ? [...vals, reference] : vals;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const x = (i: number) => PAD.l + (i / Math.max(1, points.length - 1)) * (width - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (height - PAD.t - PAD.b);

  if (points.length < 2) {
    return (
      <View style={{ height: 60, justifyContent: 'center' }}>
        <Text style={{ color: C.sub, textAlign: 'center' }}>Log this a couple more times to see a trend.</Text>
      </View>
    );
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[hi, (hi + lo) / 2, lo].map((v, i) => (
            <SvgText key={i} x={PAD.l - 6} y={y(v) + 4} fontSize={10} fill={C.sub} textAnchor="end">
              {format(v)}
            </SvgText>
          ))}
          {reference !== undefined && (
            <>
              <Line x1={PAD.l} x2={width - PAD.r} y1={y(reference)} y2={y(reference)} stroke={C.green} strokeDasharray="5 4" strokeWidth={1.5} />
              {referenceLabel && (
                <SvgText x={width - PAD.r} y={y(reference) - 4} fontSize={10} fill={C.green} textAnchor="end">
                  {referenceLabel}
                </SvgText>
              )}
            </>
          )}
          <Polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
          {vals.map((v, i) => (
            <Circle key={i} cx={x(i)} cy={y(v)} r={i === vals.length - 1 ? 5 : 3} fill={color} />
          ))}
          <SvgText x={PAD.l} y={height - 3} fontSize={10} fill={C.sub}>
            {points[0].label}
          </SvgText>
          <SvgText x={width - PAD.r} y={height - 3} fontSize={10} fill={C.sub} textAnchor="end">
            {points[points.length - 1].label}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}
