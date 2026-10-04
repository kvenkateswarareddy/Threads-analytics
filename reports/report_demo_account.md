# Threads performance report: @demo_account
_Source: **mock** (synthetic data, post links are illustrative). 41 posts from 2026-07-24 to 2026-09-29. Time zone: Asia/Taipei._

## Overview

| Avg likes | Avg replies | Avg reposts | Avg quotes | Avg interactions | Avg engagement rate (% of followers) |
|---|---|---|---|---|---|
| 67 | 7 | 3.4 | 0.7 | 78.2 | 0.53 |

## Three observations

1. Timing: most posts go out on Wed and around 19:00 (Asia/Taipei), but Tue earns the highest average engagement and the 20:00 slot averages 100.6 interactions per post.
2. Format: "plain" posts perform best (88 avg interactions) while "link" posts perform worst (40); 15% of all posts contain an external link.
3. Hooks: length has little relationship with engagement (Pearson r = -0.086); question posts make up 38% of the high group versus 0% of the low group.

## Top 5 posts by engagement rate

| # | Post | Likes | Replies | Reposts | Quotes | Rate |
|---|---|---|---|---|---|---|
| 1 | Be honest, how many hours a week do you spend on learning to code? | 160 | 41 | 6 | 2 | 1.417 |
| 2 | What is the one AI tools habit you cannot live without? Tell me below 👇 | 127 | 34 | 4 | 2 | 1.132 |
| 3 | 5 quick fitness tips that took me 10 years to learn: keep it simple, ship early, rest more... | 130 | 8 | 6 | 1 | 0.983 |
| 4 | Honest question: is sleep overrated or do I just need a better routine? What do you think? | 116 | 15 | 6 | 2 | 0.942 |
| 5 | 3 fitness lessons from this year: 1) start smaller 2) track one number 3) review every Sun... | 112 | 6 | 6 | 1 | 0.847 |

## Posting time

Most frequent day: **Wed**, most frequent hour: **19:00**, best day by average interactions: **Tue**.

| Day | Posts | Avg interactions |
|---|---|---|
| Mon | 5 | 61.6 |
| Tue | 6 | 99.8 |
| Wed | 9 | 88 |
| Thu | 3 | 97.3 |
| Fri | 9 | 62.4 |
| Sat | 4 | 71 |
| Sun | 5 | 73.8 |

## Text length vs interactions

Pearson r (characters vs interactions) = **-0.086**

| Bucket | Posts | Avg interactions |
|---|---|---|
| Short (<=60 chars) | 11 | 65.1 |
| Medium (61-180) | 26 | 86.5 |
| Long (>180) | 4 | 60 |

## Post types

| Type | Posts | Share | Avg interactions |
|---|---|---|---|
| plain | 29 | 71% | 88 |
| link | 6 | 15% | 40 |
| hashtag | 5 | 12% | 60.6 |
| mention | 1 | 2% | 112 |

## Keywords and hashtags

Keywords: tools (8), budgeting (7), everything (7), read (7), start (7), actually (5), hours (5), update (5), week (5), action (4)

Hashtags: #tips (4), #motivation (3), #creator (2), #mondaymood (2), #aitools (1), #books (1), #grind (1), #hustle (1), #life (1), #remotework (1)

## Success and failure analysis (NLP)

Groups: score = likes + 2 x replies; top third = high, bottom third = low, rest = mid.

### HIGH group (13 posts, avg likes 105.2, avg replies 14)

**Why these succeeded:**
- Question posts: 38% in this group vs 15% overall (over-represented)
- Posts with links: 0% in this group vs 15% overall (under-represented)

Distinctive terms: fitness, habit, cannot, live, without

Sample posts (same feature method applied to each):

- "Be honest, how many hours a week do you spend on learning to code?" (160 likes, 41 replies): asks a direct question, which invites replies
- "What is the one AI tools habit you cannot live without? Tell me below 👇" (127 likes, 34 replies): asks a direct question, which invites replies; contains a call-to-action (comment / share / follow)
- "Honest question: is sleep overrated or do I just need a better routine? What do you think?" (116 likes, 15 replies): asks a direct question, which invites replies; contains a call-to-action (comment / share / follow); positive tone
- "5 quick fitness tips that took me 10 years to learn: keep it simple, ship early, rest more, ask for help, repe..." (130 likes, 8 replies): uses concrete numbers

### MID group (15 posts, avg likes 60.1, avg replies 4.9)

**Middle group is defined by:**
- No single feature separates this group from the rest; differences are mostly timing or topic.

Distinctive terms: update, journey, far, failed, lot

Sample posts (same feature method applied to each):

- "Books update. #mondaymood #tips #mondaymood #books" (58 likes, 4 replies): hashtag stuffing (4 tags); very short
- "Side projects update. #hustle #tips #motivation #sideprojects" (59 likes, 2 replies): hashtag stuffing (4 tags)
- "I finally tried a new startups routine and honestly it was great. I feel so much better 😊" (61 likes, 5 replies): positive tone; personal first-person voice
- "AI tools update. #life #motivation #grind #AItools" (59 likes, 6 replies): hashtag stuffing (4 tags); very short

### LOW group (13 posts, avg likes 36.8, avg replies 2.5)

**Why these underperformed:**
- Question posts: 0% in this group vs 15% overall (under-represented)
- Posts with links: 38% in this group vs 15% overall (over-represented)
- Posts with numbers: 0% in this group vs 17% overall (under-represented)

Distinctive terms: work, remote, check, guide, link

Sample posts (same feature method applied to each):

- "Read more about budgeting here https://example.com/p/1028 and follow for updates." (23 likes, 1 replies): contains a call-to-action (comment / share / follow); contains an external link, which pulls readers off-platform
- "Read more about learning to code here https://example.com/p/1021 and follow for updates." (30 likes, 2 replies): contains a call-to-action (comment / share / follow); contains an external link, which pulls readers off-platform
- "Check out my AI tools guide https://example.com/guide/1003 (link in bio too)" (31 likes, 2 replies): contains a call-to-action (comment / share / follow); contains an external link, which pulls readers off-platform
- "Ugh, budgeting is so annoying today. Everything is broken and I am tired." (33 likes, 2 replies): negative / frustrated tone

## Recommendations

- End more posts with an open question: it is clearly over-represented in the best-performing posts.
- Move external links into a reply or the profile; posts with links sit disproportionately in the low group.
- Use concrete numbers or lists; high performers contain them far more often.
- Schedule more posts on Tue, the day with the highest average engagement.
- Lean into topics that distinguish winners: fitness, habit, cannot.

## Cleaning report

44 rows in, 41 out; 2 duplicates removed; 1 dropped for unusable timestamps; 2 rows with missing counts imputed with the column median; 1 without text; 1 URLs rebuilt.
