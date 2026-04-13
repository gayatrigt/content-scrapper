# Twitter Content Scraping & Analysis Skill

## Purpose
Scrape any Twitter/X account's timeline, analyze their content strategy using AI, and produce actionable reports for content planning. This skill enables building a content plan based on what actually drives engagement for a given account.

---

## Step 1: Scrape Twitter Timeline via RapidAPI

### API: twitter-api45
- **Host:** `twitter-api45.p.rapidapi.com`
- **Endpoint:** `GET /timeline.php`
- **Params:** `screenname` (required), `cursor` (for pagination)
- **Headers:**
  ```
  Content-Type: application/json
  x-rapidapi-host: twitter-api45.p.rapidapi.com
  x-rapidapi-key: <RAPIDAPI_KEY>
  ```

### Pagination Strategy
- The API returns ~20 tweets per page with a `next_cursor` field
- Loop through pages using the cursor until:
  - You reach the desired cutoff date (e.g., 6 months back)
  - No more `next_cursor` is returned
  - You hit a safety limit (max 15 pages recommended)
- Add a 500ms delay between pages to avoid rate limiting
- Handle non-JSON responses gracefully (API occasionally returns HTML on rate limit) — just stop pagination and work with what you have

### Raw Tweet Fields Available
Each tweet in the `timeline` array contains:
```json
{
  "tweet_id": "string",
  "text": "string",
  "created_at": "Mon Apr 13 19:45:51 +0000 2026",
  "favorites": 13612,        // likes
  "retweets": 1967,
  "replies": 2132,
  "quotes": 108,
  "bookmarks": 336,
  "views": "1940331",        // sometimes string, sometimes number
  "lang": "en",
  "media": {},                // photo/video attachments
  "author": {
    "name": "string",
    "screen_name": "string",
    "followers_count": 237909674
  }
}
```

### Data Processing
For each tweet, compute:
- **engagement** = favorites + retweets + replies + quotes + bookmarks
- **engagement_rate** = engagement / views (normalize views to number first)
- **day_of_week** from `created_at` (UTC)
- **time_slot**: Morning (6-12), Afternoon (12-17), Evening (17-21), Night (21-6) UTC
- **is_retweet**: text starts with "RT @"
- **has_media**: media field is non-empty

---

## Step 2: Analyze Content with AI (Claude API)

### What to Send
Prepare a compact payload of the account's **original tweets only** (filter out retweets). For each tweet include:
- id (index for reference)
- text (max 280 chars)
- likes, retweets, replies, views
- engagement rate as percentage
- date

Cap at ~200 tweets to stay within token limits while providing enough data for meaningful analysis.

### Analysis Prompt Template

```
You are a Twitter/X content strategist. Analyze these {count} original tweets
(plus {rt_count} retweets not shown) from @{username} and produce a comprehensive
content analysis.

Here are the tweets (sorted newest first):
{tweets_json}

Respond with ONLY valid JSON matching this structure:

{
  "topics": [
    {
      "name": "Specific Topic Name",
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
    "Actionable insight with specific numbers"
  ],
  "content_plan": {
    "summary": "2-3 sentence strategy overview",
    "pillars": [
      {
        "name": "Pillar name",
        "posts_per_week": 0,
        "best_format": "format name",
        "best_time": "day + time slot",
        "angles": ["Specific content angle 1", "Angle 2", "Angle 3"]
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
  "account_summary": "2-3 sentence summary of content style and brand voice"
}

Guidelines:
- Identify 4-8 SPECIFIC content topics (not generic like "Tech" — use
  "AI product announcements" or "hot takes on startup culture")
- Identify 4-7 content formats (e.g., "One-liner hot takes", "Thread
  breakdowns", "Quote tweet commentary", "Questions/polls", "Link shares
  with commentary", "Personal stories", "Memes/humor")
- Calculate accurate stats from the data provided
- top_tweet_ids reference the "id" field from the tweets
- Engagement rate as decimal (0.05 = 5%)
- Content plan should be a realistic 7-day schedule
- Quick wins: 3-5 bullet points with specific, data-backed insights
- Be specific and actionable — help someone replicate this account's success
```

### Model Recommendation
Use `claude-sonnet-4-20250514` with `max_tokens: 4096`. This balances quality and speed for the structured analysis.

---

## Step 3: Build Schedule Analysis (No AI Needed)

This is pure computation on the scraped data — no AI call required.

### Posting Heatmap
Build a 7-day x 4-slot grid tracking:
- **Count**: how many tweets in each cell
- **Avg engagement rate**: mean engagement rate for tweets in that cell

```
Days: Monday through Sunday
Slots: Morning, Afternoon, Evening, Night
```

### Key Metrics to Compute
- **Best day**: day with highest average engagement rate
- **Best time slot**: slot with highest average engagement rate
- **Posts per week**: total tweets / number of weeks in period
- **Day distribution**: count + avg engagement per day
- **Slot distribution**: count + avg engagement per slot

Note: Twitter API returns UTC timestamps. Flag this to users — time slots are approximate without knowing the poster's timezone.

---

## Step 4: Generate Reports

### Report Types

#### 1. Raw Data CSV
Export every tweet with columns:
- date, text, likes, retweets, replies, quotes, bookmarks, views
- engagement (total), engagement_rate
- day_of_week, time_slot, is_retweet

#### 2. Full Analysis Report (Text)
Structured sections:
```
TWITTER CONTENT ANALYSIS: @username
==================================================
Period | Total Tweets | Original vs RTs | Posts/Week
Best Day | Best Time Slot

ACCOUNT SUMMARY
QUICK WINS (numbered list)
CONTENT TOPICS (by engagement rate, with stats + insights)
CONTENT FORMATS (with stats + insights)
CONTENT STRATEGY (summary + pillars with angles)
WEEKLY SCHEDULE (day-by-day with reasoning)
```

#### 3. Content Plan (Markdown)
Downloadable weekly plan:
```markdown
# Weekly Content Plan for @username

## Strategy
{summary}

## Content Pillars
### {pillar_name}
- Frequency: Nx/week
- Best Format: {format}
- Best Time: {day + slot}
- Angles: {list}

## Weekly Schedule
### Monday
- **Morning** | {pillar} | {format}
  - Angle: {specific angle}
  - Why: {reasoning}
```

---

## Step 5: Present Results

### Recommended UI Structure (5 Tabs)

| Tab | Content |
|-----|---------|
| **Overview** | Key stats (tweets, posts/week, topics found), account summary, quick wins, top content pillars, best day/time |
| **Topics** | AI-identified themes ranked by engagement rate, with descriptions, insight text, engagement bars, and top tweets per topic |
| **Formats** | Bar chart comparing engagement rate by format, detail cards with insights and example tweets |
| **Schedule** | 7x4 heatmap (day x time slot) color-coded by engagement rate, summary stats for best day/slot/frequency |
| **Content Plan** | Strategy summary, content pillars with angles and frequency, full 7-day weekly schedule with per-post reasoning |

---

## Architecture Notes

### Tech Stack Used in Reference Implementation
- **Next.js** (App Router) with TypeScript and Tailwind CSS
- **RapidAPI** twitter-api45 for tweet fetching
- **Anthropic Claude API** for content analysis
- **PapaParse** for CSV generation
- API keys stored in `.env.local` (never committed)

### API Route Structure
Single `POST /api/scrape` endpoint that:
1. Receives `{ username, months }` 
2. Paginates through Twitter timeline
3. Processes tweets (engagement rates, time analysis)
4. Builds schedule analysis (pure computation)
5. Sends original tweets to Claude for AI analysis
6. Returns combined response with all data

### Performance Considerations
- Elon-level accounts (~300 tweets/month) take 30-60 seconds total
- Twitter pagination: ~2-3s per page with 500ms delay
- Claude API: ~10-20s for full analysis response
- Cap tweet input to Claude at 200 to manage token costs
- Filter out retweets before sending to AI (they're someone else's content)

### Error Handling
- Twitter API may return HTML instead of JSON during rate limiting — catch and stop pagination gracefully, work with tweets collected so far
- Claude API errors: surface clean messages for credit/auth issues
- Empty timelines: return early with null analysis

---

## Example Usage

To analyze an account:
```
Input: @username, 6 months
Output:
  - 300 tweets scraped (180 original, 120 RTs)
  - 7 content topics identified (e.g., "Product launches", "Industry hot takes")
  - 6 content formats ranked (e.g., "Thread breakdowns" > "One-liners")
  - Best posting time: Tuesday Night (UTC)
  - Weekly content plan: 3 posts/day across 4 pillars
  - Downloadable CSV, report, and content plan
```
