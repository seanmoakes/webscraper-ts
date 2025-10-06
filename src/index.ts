import { crawlSiteAsync } from "./crawl";

async function main() {
  if (process.argv.length < 5) {
    console.log("not enough arguments provided");
    console.log(
      "usage: node dist/index.js <baseURL> <maxConcurrency> <maxPages>",
    );
    process.exit(1);
  }
  if (process.argv.length > 5) {
    console.log("too many arguments provided");
    process.exit(1);
  }

  const baseURL = process.argv[2];
  const maxConcurrency = Number(process.argv[3]);
  const maxPages = Number(process.argv[4]);

  if (!Number.isFinite(maxConcurrency) || maxConcurrency <= 0) {
    console.log("invalid maxConcurrency");
    process.exit(1);
  }
  if (!Number.isFinite(maxPages) || maxPages <= 0) {
    console.log("invalid maxPages");
    process.exit(1);
  }

  console.log(
    `starting crawl of ${baseURL} (concurrency=${maxConcurrency}, maxPages=${maxPages})...`,
  );

  await crawlSiteAsync(baseURL);

  process.exit(0);
}

main();
