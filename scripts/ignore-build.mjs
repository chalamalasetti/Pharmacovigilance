// Preview work branches and data caches must not consume production build capacity.
const ref=process.env.VERCEL_GIT_COMMIT_REF??'';
process.exit(['fda-feed-cache','regulatory-document-cache'].includes(ref)||/^(?:codex|claude)\//.test(ref)?0:1);
