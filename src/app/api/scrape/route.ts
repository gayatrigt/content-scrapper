import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!;
const RAPIDAPI_HOST = "twitter-api45.p.rapidapi.com";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface RawTweet {
  text?: string;
  created_at?: string;
  retweets?: number;
  favorites?: number;
  replies?: number;
  quotes?: number;
  bookmarks?: number;
  views?: string | number;
  media?: unknown;
}

interface ProcessedTweet {
  text: string;
  created_at: string;
  retweets: number;
  likes: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  views: number;
  engagement: number;
  engagement_rate: number;
  day_of_week: string;
  time_slot: string;
  has_media: boolean;
  is_retweet: boolean;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function processTweet(t: RawTweet): ProcessedTweet | null {
  if (!t.text || !t.created_at) return null;

  const retweets = t.retweets || 0;
  const likes = t.favorites || 0;
  const replies = t.replies || 0;
  const quotes = t.quotes || 0;
  const bookmarks = t.bookmarks || 0;
  const views = typeof t.views === "string" ? parseInt(t.views) || 0 : t.views || 0;
  const engagement = retweets + likes + replies + quotes + bookmarks;
  const engagement_rate = views > 0 ? engagement / views : 0;

  const date = new Date(t.created_at);
  const hour = date.getUTCHours();
  let time_slot = "Night";
  if (hour >= 6 && hour < 12) time_slot = "Morning";
  else if (hour >= 12 && hour < 17) time_slot = "Afternoon";
  else if (hour >= 17 && hour < 21) time_slot = "Evening";

  return {
    text: t.text,
    created_at: t.created_at,
    retweets,
    likes,
    replies,
    quotes,
    bookmarks,
    views,
    engagement,
    engagement_rate,
    day_of_week: DAYS[date.getUTCDay()],
    time_slot,
    has_media: !!t.media && (Array.isArray(t.media) ? t.media.length > 0 : Object.keys(t.media as object).length > 0),
    is_retweet: t.text.startsWith("RT @"),
  };
}

async function fetchTimeline(
  screenName: string,
  cursor?: string
): Promise<{ tweets: RawTweet[]; nextCursor?: string }> {
  const url = new URL("https://twitter-api45.p.rapidapi.com/timeline.php");
  url.searchParams.set("screenname", screenName);
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": RAPIDAPI_KEY,
    },
  });

  if (!res.ok) {
    // Non-OK status during pagination — stop gracefully instead of crashing
    return { tweets: [], nextCursor: undefined };
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return { tweets: data.timeline || [], nextCursor: data.next_cursor || undefined };
  } catch {
    // API returned non-JSON (HTML error page, rate limit) — stop pagination gracefully
    console.warn("Twitter API returned non-JSON response, stopping pagination");
    return { tweets: [], nextCursor: undefined };
  }
}

function buildScheduleAnalysis(tweets: ProcessedTweet[]) {
  const dayStats: Record<string, { count: number; totalEngRate: number }> = {};
  const slotStats: Record<string, { count: number; totalEngRate: number }> = {};
  const gridStats: Record<string, { count: number; totalEngRate: number }> = {};

  for (const day of DAYS) {
    dayStats[day] = { count: 0, totalEngRate: 0 };
  }
  for (const slot of ["Morning", "Afternoon", "Evening", "Night"]) {
    slotStats[slot] = { count: 0, totalEngRate: 0 };
  }

  for (const t of tweets) {
    dayStats[t.day_of_week].count++;
    dayStats[t.day_of_week].totalEngRate += t.engagement_rate;
    slotStats[t.time_slot].count++;
    slotStats[t.time_slot].totalEngRate += t.engagement_rate;

    const key = `${t.day_of_week}-${t.time_slot}`;
    if (!gridStats[key]) gridStats[key] = { count: 0, totalEngRate: 0 };
    gridStats[key].count++;
    gridStats[key].totalEngRate += t.engagement_rate;
  }

  const heatmap: { day: string; slot: string; count: number; avgEngRate: number }[] = [];
  for (const day of DAYS) {
    for (const slot of ["Morning", "Afternoon", "Evening", "Night"]) {
      const key = `${day}-${slot}`;
      const s = gridStats[key] || { count: 0, totalEngRate: 0 };
      heatmap.push({
        day,
        slot,
        count: s.count,
        avgEngRate: s.count > 0 ? s.totalEngRate / s.count : 0,
      });
    }
  }

  const bestDay = Object.entries(dayStats)
    .filter(([, s]) => s.count > 0)
    .sort(([, a], [, b]) => b.totalEngRate / b.count - a.totalEngRate / a.count)[0]?.[0] || "N/A";

  const bestSlot = Object.entries(slotStats)
    .filter(([, s]) => s.count > 0)
    .sort(([, a], [, b]) => b.totalEngRate / b.count - a.totalEngRate / a.count)[0]?.[0] || "N/A";

  const weeks = tweets.length > 0
    ? Math.max(1, Math.ceil(
        (new Date(tweets[0].created_at).getTime() - new Date(tweets[tweets.length - 1].created_at).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      ))
    : 1;

  return {
    heatmap,
    bestDay,
    bestSlot,
    postsPerWeek: Math.round(tweets.length / weeks),
    dayStats: Object.fromEntries(
      Object.entries(dayStats).map(([d, s]) => [d, { count: s.count, avgEngRate: s.count > 0 ? s.totalEngRate / s.count : 0 }])
    ),
    slotStats: Object.fromEntries(
      Object.entries(slotStats).map(([s, v]) => [s, { count: v.count, avgEngRate: v.count > 0 ? v.totalEngRate / v.count : 0 }])
    ),
  };
}

async function analyzeWithClaude(tweets: ProcessedTweet[], username: string) {
  // Prepare a compact summary of tweets for Claude (avoid sending too much data)
  const tweetSummaries = tweets
    .filter((t) => !t.is_retweet) // focus on original content
    .slice(0, 200) // limit for token efficiency
    .map((t, i) => ({
      id: i,
      text: t.text.substring(0, 280),
      likes: t.likes,
      retweets: t.retweets,
      replies: t.replies,
      views: t.views,
      eng_rate: (t.engagement_rate * 100).toFixed(2) + "%",
      date: t.created_at,
    }));

  const rtCount = tweets.filter((t) => t.is_retweet).length;

  const prompt = `You are a Twitter/X content strategist. Analyze these ${tweetSummaries.length} original tweets (plus ${rtCount} retweets not shown) from @${username} and produce a comprehensive content analysis.

Here are the tweets (sorted newest first):
${JSON.stringify(tweetSummaries, null, 0)}

Respond with ONLY valid JSON (no markdown, no code fences) matching this exact structure:

{
  "topics": [
    {
      "name": "Topic Name",
      "description": "What this content pillar covers",
      "tweet_count": 0,
      "avg_engagement_rate": 0.0,
      "total_engagement": 0,
      "total_views": 0,
      "top_tweet_ids": [0, 1, 2],
      "insight": "Why this topic works or doesn't for engagement"
    }
  ],
  "formats": [
    {
      "name": "Format Name",
      "description": "What this format looks like",
      "tweet_count": 0,
      "avg_engagement_rate": 0.0,
      "total_engagement": 0,
      "example_tweet_ids": [0, 1],
      "insight": "How this format performs and why"
    }
  ],
  "quick_wins": [
    "Actionable insight about what works best (be specific with numbers)",
    "Another specific insight"
  ],
  "content_plan": {
    "summary": "2-3 sentence strategy overview for someone creating similar content",
    "pillars": [
      {
        "name": "Pillar name",
        "posts_per_week": 0,
        "best_format": "format name",
        "best_time": "day + time slot",
        "angles": ["Specific content angle 1", "Specific content angle 2", "Specific content angle 3"]
      }
    ],
    "weekly_schedule": [
      {
        "day": "Monday",
        "posts": [
          {
            "time_slot": "Morning",
            "pillar": "pillar name",
            "format": "format name",
            "angle": "Specific angle or topic to cover",
            "reasoning": "Why this combo works based on the data"
          }
        ]
      }
    ]
  },
  "account_summary": "2-3 sentence summary of this account's content style and what defines their brand voice"
}

Guidelines:
- Identify 4-8 specific content topics/themes (not generic categories like "Tech" — be specific like "AI product announcements" or "hot takes on startup culture")
- Identify 4-7 content formats (e.g., "One-liner hot takes", "Thread breakdowns", "Quote tweet commentary", "Question/poll", "Link shares with commentary", "Personal stories", "Memes/humor")
- For each topic and format, calculate accurate stats from the data provided
- top_tweet_ids and example_tweet_ids should reference the "id" field from the tweets
- Engagement rate should be a decimal (e.g., 0.05 for 5%)
- The content plan should be a realistic 7-day schedule based on actual posting patterns
- Quick wins should be 3-5 bullet points with specific, data-backed insights
- Be specific and actionable — this needs to help someone replicate this account's success`;

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("credit balance")) {
      throw new Error("Claude API credits exhausted. Please add credits at console.anthropic.com");
    }
    if (msg.includes("authentication") || msg.includes("api_key")) {
      throw new Error("Invalid Claude API key. Check your ANTHROPIC_API_KEY in .env.local");
    }
    throw new Error(`Claude API error: ${msg}`);
  }

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Failed to parse Claude response as JSON");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { username, months = 6 } = await req.json();

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const screenName = username.replace("@", "").trim();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    // Fetch tweets
    const allTweets: ProcessedTweet[] = [];
    let cursor: string | undefined;
    let reachedCutoff = false;
    let pages = 0;
    const maxPages = 15;

    while (!reachedCutoff && pages < maxPages) {
      const { tweets, nextCursor } = await fetchTimeline(screenName, cursor);
      pages++;

      if (!tweets || tweets.length === 0) break;

      for (const t of tweets) {
        if (!t.text || !t.created_at) continue;
        const tweetDate = new Date(t.created_at);
        if (tweetDate < cutoffDate) {
          reachedCutoff = true;
          break;
        }
        const processed = processTweet(t);
        if (processed) allTweets.push(processed);
      }

      if (!nextCursor) break;
      cursor = nextCursor;

      // Small delay between pages to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }

    if (allTweets.length === 0) {
      return NextResponse.json({
        username: screenName,
        totalTweets: 0,
        periodMonths: months,
        schedule: null,
        analysis: null,
        tweets: [],
      });
    }

    // Run schedule analysis (pure computation, no AI needed)
    const schedule = buildScheduleAnalysis(allTweets);

    // Run Claude analysis
    const analysis = await analyzeWithClaude(allTweets, screenName);

    // Attach actual tweet data to analysis for display
    const originalTweets = allTweets.filter((t) => !t.is_retweet).slice(0, 200);

    // Build enriched CSV rows
    const csvRows = allTweets.map((t) => ({
      date: t.created_at,
      text: t.text.substring(0, 500),
      likes: t.likes,
      retweets: t.retweets,
      replies: t.replies,
      quotes: t.quotes,
      bookmarks: t.bookmarks,
      views: t.views,
      engagement: t.engagement,
      engagement_rate: (t.engagement_rate * 100).toFixed(2) + "%",
      day_of_week: t.day_of_week,
      time_slot: t.time_slot,
      is_retweet: t.is_retweet,
    }));

    return NextResponse.json({
      username: screenName,
      totalTweets: allTweets.length,
      originalTweetCount: originalTweets.length,
      retweetCount: allTweets.length - originalTweets.length,
      periodMonths: months,
      schedule,
      analysis,
      tweets: originalTweets,
      csvRows,
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
