// Data-only branches must not produce hourly preview deployments.
process.exit(['fda-feed-cache','regulatory-document-cache'].includes(process.env.VERCEL_GIT_COMMIT_REF) ? 0 : 1);
