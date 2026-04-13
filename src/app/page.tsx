"use client";

import { useState } from "react";
import Papa from "papaparse";

// ── Types ──────────────────────────────────────────────────────────────

interface Tweet {
  text: string;
  created_at: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  engagement: number;
  engagement_rate: number;
  day_of_week: string;
  time_slot: string;
}

interface TopicData {
  name: string;
  description: string;
  tweet_count: number;
  avg_engagement_rate: number;
  total_engagement: number;
  total_views: number;
  top_tweet_ids: number[];
  insight: string;
}

interface FormatData {
  name: string;
  description: string;
  tweet_count: number;
  avg_engagement_rate: number;
  total_engagement: number;
  example_tweet_ids: number[];
  insight: string;
}

interface PillarData {
  name: string;
  posts_per_week: number;
  best_format: string;
  best_time: string;
  angles: string[];
}

interface SchedulePost {
  time_slot: string;
  pillar: string;
  format: string;
  angle: string;
  reasoning: string;
}

interface WeeklyDay {
  day: string;
  posts: SchedulePost[];
}

interface Analysis {
  topics: TopicData[];
  formats: FormatData[];
  quick_wins: string[];
  content_plan: {
    summary: string;
    pillars: PillarData[];
    weekly_schedule: WeeklyDay[];
  };
  account_summary: string;
}

interface HeatmapCell {
  day: string;
  slot: string;
  count: number;
  avgEngRate: number;
}

interface Schedule {
  heatmap: HeatmapCell[];
  bestDay: string;
  bestSlot: string;
  postsPerWeek: number;
  dayStats: Record<string, { count: number; avgEngRate: number }>;
  slotStats: Record<string, { count: number; avgEngRate: number }>;
}

interface ScrapeResult {
  username: string;
  totalTweets: number;
  originalTweetCount: number;
  retweetCount: number;
  periodMonths: number;
  schedule: Schedule;
  analysis: Analysis;
  tweets: Tweet[];
  csvRows: Record<string, unknown>[];
}

type Tab = "overview" | "topics" | "formats" | "schedule" | "plan";

// ── Main Page ──────────────────────────────────────────────────────────

export default function Home() {
  const [username, setUsername] = useState("");
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  async function handleScrape() {
    if (!username.trim()) {
      setError("Please enter a Twitter username");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), months }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scrape");
      setResult(data);
      setActiveTab("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!result) return;
    const csv = Papa.unparse(result.csvRows);
    downloadFile(csv, `${result.username}_twitter_data.csv`, "text/csv");
  }

  function downloadReport() {
    if (!result) return;
    const a = result.analysis;
    const s = result.schedule;
    const lines: string[] = [];

    lines.push(`TWITTER CONTENT ANALYSIS: @${result.username}`);
    lines.push(`${"=".repeat(50)}`);
    lines.push(`Period: Last ${result.periodMonths} months`);
    lines.push(`Total Tweets: ${result.totalTweets} (${result.originalTweetCount} original, ${result.retweetCount} RTs)`);
    lines.push(`Avg Posts/Week: ${s.postsPerWeek}`);
    lines.push(`Best Day: ${s.bestDay} | Best Time: ${s.bestSlot}`);
    lines.push(``);
    lines.push(`ACCOUNT SUMMARY`);
    lines.push(`${"-".repeat(50)}`);
    lines.push(a.account_summary);
    lines.push(``);
    lines.push(`QUICK WINS`);
    lines.push(`${"-".repeat(50)}`);
    a.quick_wins.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
    lines.push(``);
    lines.push(`CONTENT TOPICS (by engagement rate)`);
    lines.push(`${"-".repeat(50)}`);
    a.topics.forEach((t) => {
      lines.push(`\n${t.name} (${t.tweet_count} posts)`);
      lines.push(`  ${t.description}`);
      lines.push(`  Avg Engagement Rate: ${(t.avg_engagement_rate * 100).toFixed(2)}%`);
      lines.push(`  Total Engagement: ${t.total_engagement.toLocaleString()}`);
      lines.push(`  Insight: ${t.insight}`);
    });
    lines.push(``);
    lines.push(`CONTENT FORMATS`);
    lines.push(`${"-".repeat(50)}`);
    a.formats.forEach((f) => {
      lines.push(`\n${f.name} (${f.tweet_count} posts)`);
      lines.push(`  ${f.description}`);
      lines.push(`  Avg Engagement Rate: ${(f.avg_engagement_rate * 100).toFixed(2)}%`);
      lines.push(`  Insight: ${f.insight}`);
    });
    lines.push(``);
    lines.push(`CONTENT STRATEGY`);
    lines.push(`${"-".repeat(50)}`);
    lines.push(a.content_plan.summary);
    lines.push(``);
    lines.push(`Content Pillars:`);
    a.content_plan.pillars.forEach((p) => {
      lines.push(`\n  ${p.name} (${p.posts_per_week}x/week)`);
      lines.push(`    Best Format: ${p.best_format}`);
      lines.push(`    Best Time: ${p.best_time}`);
      lines.push(`    Angles:`);
      p.angles.forEach((angle) => lines.push(`      - ${angle}`));
    });
    lines.push(``);
    lines.push(`WEEKLY SCHEDULE`);
    lines.push(`${"-".repeat(50)}`);
    a.content_plan.weekly_schedule.forEach((day) => {
      lines.push(`\n${day.day}:`);
      day.posts.forEach((post) => {
        lines.push(`  [${post.time_slot}] ${post.pillar} — ${post.format}`);
        lines.push(`    Angle: ${post.angle}`);
        lines.push(`    Why: ${post.reasoning}`);
      });
    });

    downloadFile(lines.join("\n"), `${result.username}_content_report.txt`, "text/plain");
  }

  function downloadContentPlan() {
    if (!result) return;
    const plan = result.analysis.content_plan;
    const lines: string[] = [];

    lines.push(`# Weekly Content Plan for @${result.username}`);
    lines.push(``);
    lines.push(`## Strategy`);
    lines.push(plan.summary);
    lines.push(``);
    lines.push(`## Content Pillars`);
    plan.pillars.forEach((p) => {
      lines.push(`### ${p.name}`);
      lines.push(`- **Frequency:** ${p.posts_per_week}x/week`);
      lines.push(`- **Best Format:** ${p.best_format}`);
      lines.push(`- **Best Time:** ${p.best_time}`);
      lines.push(`- **Angles:**`);
      p.angles.forEach((a) => lines.push(`  - ${a}`));
      lines.push(``);
    });
    lines.push(`## Weekly Schedule`);
    lines.push(``);
    plan.weekly_schedule.forEach((day) => {
      lines.push(`### ${day.day}`);
      day.posts.forEach((post) => {
        lines.push(`- **${post.time_slot}** | ${post.pillar} | ${post.format}`);
        lines.push(`  - *Angle:* ${post.angle}`);
        lines.push(`  - *Why:* ${post.reasoning}`);
      });
      lines.push(``);
    });

    downloadFile(lines.join("\n"), `${result.username}_content_plan.md`, "text/markdown");
  }

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type: `${type};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "topics", label: "Topics" },
    { id: "formats", label: "Formats" },
    { id: "schedule", label: "Schedule" },
    { id: "plan", label: "Content Plan" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-blue-400">Twitter</span> Content Planner
          </h1>
          <p className="mt-1 text-gray-400">
            Analyze any account and get a data-driven content plan
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Input */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Twitter Username
              </label>
              <div className="flex items-center rounded-lg border border-gray-700 bg-gray-800 px-3">
                <span className="text-gray-500">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScrape()}
                  placeholder="username"
                  className="w-full bg-transparent px-2 py-3 text-white outline-none placeholder:text-gray-600"
                />
              </div>
            </div>
            <div className="w-40">
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Months Back
              </label>
              <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 text-white outline-none"
              >
                {[1, 3, 6, 9, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} month{m > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleScrape}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Analyzing...
                </span>
              ) : (
                "Analyze"
              )}
            </button>
          </div>
          {loading && (
            <p className="mt-3 text-sm text-gray-500">
              Fetching tweets and running AI analysis — this may take 30-60 seconds...
            </p>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && result.analysis && (
          <div className="mt-8">
            {/* Tab Navigation */}
            <div className="mb-6 flex gap-1 rounded-lg border border-gray-800 bg-gray-900/50 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Download Bar */}
            <div className="mb-6 flex flex-wrap gap-3">
              <button onClick={downloadCSV} className="dl-btn">
                <DownloadIcon /> Raw Data CSV
              </button>
              <button onClick={downloadReport} className="dl-btn">
                <DownloadIcon /> Full Report
              </button>
              <button onClick={downloadContentPlan} className="dl-btn">
                <DownloadIcon /> Content Plan
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
              <OverviewTab result={result} />
            )}
            {activeTab === "topics" && (
              <TopicsTab topics={result.analysis.topics} tweets={result.tweets} />
            )}
            {activeTab === "formats" && (
              <FormatsTab formats={result.analysis.formats} tweets={result.tweets} />
            )}
            {activeTab === "schedule" && (
              <ScheduleTab schedule={result.schedule} />
            )}
            {activeTab === "plan" && (
              <ContentPlanTab plan={result.analysis.content_plan} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Tab Components ─────────────────────────────────────────────────────

function OverviewTab({ result }: { result: ScrapeResult }) {
  const a = result.analysis;
  const s = result.schedule;

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Tweets Analyzed" value={result.totalTweets.toString()} />
        <StatCard label="Original Posts" value={result.originalTweetCount.toString()} />
        <StatCard label="Posts/Week" value={s.postsPerWeek.toString()} />
        <StatCard label="Topics Found" value={a.topics.length.toString()} />
      </div>

      {/* Account Summary */}
      <Card>
        <h3 className="mb-2 text-lg font-semibold">Account Summary</h3>
        <p className="text-gray-300">{a.account_summary}</p>
      </Card>

      {/* Quick Wins */}
      <Card>
        <h3 className="mb-3 text-lg font-semibold text-emerald-400">
          Quick Wins & Key Insights
        </h3>
        <ul className="space-y-2">
          {a.quick_wins.map((win, i) => (
            <li key={i} className="flex gap-3 text-gray-300">
              <span className="mt-0.5 text-emerald-400">&#10003;</span>
              {win}
            </li>
          ))}
        </ul>
      </Card>

      {/* Top Pillars */}
      <Card>
        <h3 className="mb-3 text-lg font-semibold">Top Content Pillars</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {a.topics.slice(0, 6).map((topic) => (
            <div
              key={topic.name}
              className="rounded-lg border border-gray-700 bg-gray-800/50 p-4"
            >
              <div className="text-sm font-semibold text-blue-400">{topic.name}</div>
              <div className="mt-1 text-xs text-gray-500">{topic.tweet_count} posts</div>
              <div className="mt-2 text-sm text-gray-300">{topic.description}</div>
              <div className="mt-2 text-xs text-gray-500">
                Eng. Rate: {(topic.avg_engagement_rate * 100).toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Best Times */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-gray-400">Best Day to Post</h3>
          <div className="text-2xl font-bold text-blue-400">{s.bestDay}</div>
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-gray-400">Best Time Slot</h3>
          <div className="text-2xl font-bold text-blue-400">{s.bestSlot} (UTC)</div>
        </Card>
      </div>
    </div>
  );
}

function TopicsTab({ topics, tweets }: { topics: TopicData[]; tweets: Tweet[] }) {
  const maxEng = Math.max(...topics.map((t) => t.avg_engagement_rate), 0.001);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        AI-identified content themes, ranked by engagement rate
      </p>
      {topics.map((topic, i) => (
        <Card key={topic.name}>
          <div className="flex items-start gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-400">
              {i + 1}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">{topic.name}</h3>
                <span className="rounded-full bg-gray-800 px-3 py-0.5 text-xs text-gray-400">
                  {topic.tweet_count} posts
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-400">{topic.description}</p>

              {/* Engagement bar */}
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>
                    Engagement Rate: {(topic.avg_engagement_rate * 100).toFixed(2)}%
                  </span>
                  <span>
                    Total: {topic.total_engagement.toLocaleString()} eng |{" "}
                    {(topic.total_views || 0).toLocaleString()} views
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                    style={{
                      width: `${(topic.avg_engagement_rate / maxEng) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Insight */}
              <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800/30 px-3 py-2 text-sm text-gray-300">
                {topic.insight}
              </div>

              {/* Top Tweets */}
              {topic.top_tweet_ids && topic.top_tweet_ids.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs font-medium text-gray-500">Top Tweets</div>
                  {topic.top_tweet_ids.slice(0, 2).map((id) => {
                    const tw = tweets[id];
                    if (!tw) return null;
                    return (
                      <div
                        key={id}
                        className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-sm text-gray-300"
                      >
                        <div className="line-clamp-2">{tw.text}</div>
                        <div className="mt-1 flex gap-4 text-xs text-gray-500">
                          <span>{tw.likes.toLocaleString()} likes</span>
                          <span>{tw.retweets.toLocaleString()} RTs</span>
                          <span>{tw.views.toLocaleString()} views</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function FormatsTab({ formats, tweets }: { formats: FormatData[]; tweets: Tweet[] }) {
  const maxEng = Math.max(...formats.map((f) => f.avg_engagement_rate), 0.001);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        How different content formats perform for this account
      </p>

      {/* Bar comparison */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-gray-400">
          Engagement Rate by Format
        </h3>
        <div className="space-y-3">
          {formats
            .sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate)
            .map((f) => (
              <div key={f.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-gray-500">
                    {(f.avg_engagement_rate * 100).toFixed(2)}% ({f.tweet_count} posts)
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-400"
                    style={{
                      width: `${(f.avg_engagement_rate / maxEng) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
        </div>
      </Card>

      {/* Detail cards */}
      {formats.map((f, i) => (
        <Card key={f.name}>
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600/20 text-xs font-bold text-violet-400">
              {i + 1}
            </span>
            <h3 className="font-semibold">{f.name}</h3>
            <span className="rounded-full bg-gray-800 px-3 py-0.5 text-xs text-gray-400">
              {f.tweet_count} posts
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-400">{f.description}</p>
          <div className="mt-2 rounded-lg border border-gray-700 bg-gray-800/30 px-3 py-2 text-sm text-gray-300">
            {f.insight}
          </div>

          {/* Example tweets */}
          {f.example_tweet_ids && f.example_tweet_ids.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-medium text-gray-500">Examples</div>
              {f.example_tweet_ids.slice(0, 2).map((id) => {
                const tw = tweets[id];
                if (!tw) return null;
                return (
                  <div
                    key={id}
                    className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-sm text-gray-300"
                  >
                    <div className="line-clamp-2">{tw.text}</div>
                    <div className="mt-1 flex gap-4 text-xs text-gray-500">
                      <span>{tw.likes.toLocaleString()} likes</span>
                      <span>{tw.retweets.toLocaleString()} RTs</span>
                      <span>
                        {(tw.engagement_rate * 100).toFixed(2)}% eng rate
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ScheduleTab({ schedule }: { schedule: Schedule }) {
  const slots = ["Morning", "Afternoon", "Evening", "Night"];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const maxRate = Math.max(...schedule.heatmap.map((c) => c.avgEngRate), 0.001);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        When this account posts and when their content performs best (times in UTC)
      </p>

      {/* Heatmap */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-gray-400">
          Engagement Heatmap (Day x Time)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left text-xs text-gray-500"></th>
                {slots.map((s) => (
                  <th key={s} className="p-2 text-center text-xs text-gray-500">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <td className="p-2 text-xs font-medium text-gray-400">{day.slice(0, 3)}</td>
                  {slots.map((slot) => {
                    const cell = schedule.heatmap.find(
                      (c) => c.day === day && c.slot === slot
                    );
                    const rate = cell?.avgEngRate || 0;
                    const count = cell?.count || 0;
                    const intensity = maxRate > 0 ? rate / maxRate : 0;
                    return (
                      <td key={slot} className="p-1">
                        <div
                          className="flex h-14 flex-col items-center justify-center rounded-lg border border-gray-800 text-xs"
                          style={{
                            backgroundColor: `rgba(59, 130, 246, ${intensity * 0.6})`,
                          }}
                          title={`${day} ${slot}: ${count} posts, ${(rate * 100).toFixed(2)}% eng rate`}
                        >
                          <span className="font-medium">{count}</span>
                          <span className="text-[10px] text-gray-400">
                            {count > 0 ? (rate * 100).toFixed(1) + "%" : "—"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span>Low</span>
          <div className="flex h-3 w-32 overflow-hidden rounded-full">
            <div className="flex-1" style={{ backgroundColor: "rgba(59, 130, 246, 0.05)" }} />
            <div className="flex-1" style={{ backgroundColor: "rgba(59, 130, 246, 0.2)" }} />
            <div className="flex-1" style={{ backgroundColor: "rgba(59, 130, 246, 0.4)" }} />
            <div className="flex-1" style={{ backgroundColor: "rgba(59, 130, 246, 0.6)" }} />
          </div>
          <span>High Engagement</span>
        </div>
      </Card>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-gray-500">Best Day</div>
          <div className="mt-1 text-xl font-bold text-blue-400">{schedule.bestDay}</div>
          <div className="text-xs text-gray-500">
            Avg eng rate:{" "}
            {(schedule.dayStats[schedule.bestDay]?.avgEngRate * 100 || 0).toFixed(2)}%
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Best Time Slot</div>
          <div className="mt-1 text-xl font-bold text-blue-400">{schedule.bestSlot}</div>
          <div className="text-xs text-gray-500">
            Avg eng rate:{" "}
            {(schedule.slotStats[schedule.bestSlot]?.avgEngRate * 100 || 0).toFixed(2)}%
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Posting Frequency</div>
          <div className="mt-1 text-xl font-bold text-blue-400">
            {schedule.postsPerWeek}/week
          </div>
          <div className="text-xs text-gray-500">
            ~{Math.round(schedule.postsPerWeek / 7)}/day
          </div>
        </Card>
      </div>
    </div>
  );
}

function ContentPlanTab({
  plan,
}: {
  plan: Analysis["content_plan"];
}) {
  return (
    <div className="space-y-6">
      {/* Strategy */}
      <Card>
        <h3 className="mb-2 text-lg font-semibold text-blue-400">Content Strategy</h3>
        <p className="text-gray-300">{plan.summary}</p>
      </Card>

      {/* Pillars */}
      <Card>
        <h3 className="mb-4 text-lg font-semibold">Recommended Content Pillars</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {plan.pillars.map((p) => (
            <div
              key={p.name}
              className="rounded-lg border border-gray-700 bg-gray-800/40 p-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-blue-400">{p.name}</h4>
                <span className="rounded-full bg-blue-600/20 px-2.5 py-0.5 text-xs font-medium text-blue-300">
                  {p.posts_per_week}x/week
                </span>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-gray-500">
                <span>Format: {p.best_format}</span>
                <span>Best at: {p.best_time}</span>
              </div>
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">Content Angles</div>
                <ul className="space-y-1">
                  {p.angles.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-300">
                      <span className="text-blue-400">-</span> {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Weekly Schedule */}
      <Card>
        <h3 className="mb-4 text-lg font-semibold">Weekly Schedule</h3>
        <div className="space-y-4">
          {plan.weekly_schedule.map((day) => (
            <div key={day.day}>
              <h4 className="mb-2 font-semibold text-gray-300">{day.day}</h4>
              <div className="space-y-2">
                {day.posts.map((post, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-800 bg-gray-900/50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-300">
                        {post.time_slot}
                      </span>
                      <span className="rounded bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-300">
                        {post.pillar}
                      </span>
                      <span className="rounded bg-violet-900/40 px-2 py-0.5 text-xs font-medium text-violet-300">
                        {post.format}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-300">{post.angle}</p>
                    <p className="mt-1 text-xs text-gray-500">{post.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Shared UI Components ───────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
