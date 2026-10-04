"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Summary } from "@/lib/types";

const C1 = "#2f6fed";
const C2 = "#f08a24";

function Box({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="card chart">
      <h3>{title}</h3>
      {note && <p className="muted small">{note}</p>}
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Charts({
  summary,
  scatter,
}: {
  summary: Summary;
  scatter: { chars: number; engagement: number }[];
}) {
  const hours = summary.hour_distribution.map((h) => ({ ...h, label: String(h.hour).padStart(2, "0") }));
  return (
    <div className="grid2">
      <Box title="Posting frequency by weekday" note="Bars: number of posts. Orange: average interactions per post.">
        <BarChart data={summary.weekday_distribution}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" />
          <YAxis yAxisId="l" allowDecimals={false} />
          <YAxis yAxisId="r" orientation="right" />
          <Tooltip />
          <Legend />
          <Bar yAxisId="l" dataKey="posts" name="Posts" fill={C1} radius={[4, 4, 0, 0]} />
          <Bar yAxisId="r" dataKey="avg_engagement" name="Avg interactions" fill={C2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </Box>

      <Box title={`Posting frequency by hour (${summary.time_zone})`} note="Hour of day in the unified time zone.">
        <BarChart data={hours}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" interval={1} />
          <YAxis yAxisId="l" allowDecimals={false} />
          <YAxis yAxisId="r" orientation="right" />
          <Tooltip />
          <Legend />
          <Bar yAxisId="l" dataKey="posts" name="Posts" fill={C1} radius={[4, 4, 0, 0]} />
          <Bar yAxisId="r" dataKey="avg_engagement" name="Avg interactions" fill={C2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </Box>

      <Box title="Average interactions by post type">
        <BarChart data={summary.post_types}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="type" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="avg_engagement" name="Avg interactions" fill={C1} radius={[4, 4, 0, 0]} />
        </BarChart>
      </Box>

      <Box title="Text length vs interactions" note={`Pearson r = ${summary.length_vs_engagement.pearson_chars_vs_engagement} (characters vs interactions)`}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="chars" name="Characters" />
          <YAxis type="number" dataKey="engagement" name="Interactions" />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={scatter} fill={C1} />
        </ScatterChart>
      </Box>

      <Box title="Average interactions by length bucket">
        <BarChart data={summary.length_vs_engagement.buckets}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="avg_engagement" name="Avg interactions" fill={C2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </Box>

      <Box title="Top keywords (posts containing the term)">
        <BarChart data={summary.top_keywords} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="term" width={90} />
          <Tooltip />
          <Bar dataKey="count" name="Posts" fill={C1} radius={[0, 4, 4, 0]} />
        </BarChart>
      </Box>
    </div>
  );
}
