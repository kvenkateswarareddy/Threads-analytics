// Shared types for the whole pipeline: fetch -> clean -> score -> analyse -> store.

export type DataSource = "mock" | "api";
export type PostType = "plain" | "link" | "hashtag" | "mention";
export type PerfGroup = "high" | "mid" | "low";

/** A post exactly as a source hands it to us. Every field may be missing or messy. */
export type RawPost = {
  external_id?: string | null;
  post_url?: string | null;
  posted_at?: string | number | null;
  text?: string | null;
  likes?: number | string | null;
  replies?: number | string | null;
  reposts?: number | string | null;
  quotes?: number | string | null;
};

export type FetchResult = {
  username: string;
  followers: number; // 0 = unknown
  posts: RawPost[];
  source: DataSource;
};

export type TextFeatures = {
  char_count: number;
  word_count: number;
  hashtag_count: number;
  mention_count: number;
  url_count: number;
  hashtags: string[];
};

export type CleanPost = TextFeatures & {
  external_id: string;
  post_url: string;
  posted_at: string; // ISO-8601, always UTC
  text: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  post_type: PostType;
  engagement: number; // likes + replies + reposts + quotes
  engagement_rate: number; // see analyze.ts for the definition
  perf_group: PerfGroup;
};

export type CleaningReport = {
  input_rows: number;
  output_rows: number;
  duplicates_removed: number;
  dropped_invalid_time: number;
  filled_missing_text: number;
  filled_missing_counts: number;
  rebuilt_urls: number;
  time_zone: string;
};

export type NlpFeatures = {
  sentiment: number; // -1..1 lexicon score
  is_question: boolean;
  has_cta: boolean;
  emoji_count: number;
  exclaim_count: number;
  first_person: number;
  has_number: boolean;
  avg_word_len: number;
};

export type GroupSamplePost = {
  post_url: string;
  text: string;
  likes: number;
  replies: number;
  score: number;
  features: NlpFeatures;
  signals: string[]; // human-readable reasons derived from the features
};

export type GroupAnalysis = {
  group: PerfGroup;
  size: number;
  avg_likes: number;
  avg_replies: number;
  avg_score: number;
  feature_means: {
    sentiment: number;
    question_rate: number;
    cta_rate: number;
    emoji_avg: number;
    exclaim_avg: number;
    first_person_avg: number;
    number_rate: number;
    char_avg: number;
    link_rate: number;
    hashtag_rate: number;
  };
  distinctive_terms: { term: string; log_odds: number }[];
  samples: GroupSamplePost[];
  reasons: string[];
};

export type Summary = {
  username: string;
  source: DataSource;
  followers: number;
  time_zone: string;
  overview: {
    post_count: number;
    date_from: string;
    date_to: string;
    avg_likes: number;
    avg_replies: number;
    avg_reposts: number;
    avg_quotes: number;
    avg_engagement: number;
    avg_engagement_rate: number;
    engagement_rate_unit: "pct_of_followers" | "index_vs_mean";
  };
  top_posts: Pick<
    CleanPost,
    "post_url" | "posted_at" | "text" | "likes" | "replies" | "reposts" | "quotes" | "engagement_rate"
  >[];
  weekday_distribution: { day: string; posts: number; avg_engagement: number }[];
  hour_distribution: { hour: number; posts: number; avg_engagement: number }[];
  busiest_day: string;
  busiest_hour: number;
  best_day_by_engagement: string;
  length_vs_engagement: {
    buckets: { label: string; posts: number; avg_engagement: number }[];
    pearson_chars_vs_engagement: number;
    pearson_words_vs_engagement: number;
  };
  top_keywords: { term: string; count: number }[];
  top_hashtags: { tag: string; count: number }[];
  post_types: { type: PostType; posts: number; share: number; avg_engagement: number }[];
  feature_flags: { has_link: number; has_hashtag: number; has_mention: number; plain: number };
  groups: GroupAnalysis[];
  group_thresholds: { low_max: number; high_min: number; formula: string };
  observations: string[];
  recommendations: { text: string; by: "rules" | "llm" };
  cleaning: CleaningReport;
};
