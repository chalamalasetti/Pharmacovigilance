// FDA data-only branch must not produce an hourly preview deployment.
process.exit(process.env.VERCEL_GIT_COMMIT_REF === 'fda-feed-cache' ? 0 : 1);
