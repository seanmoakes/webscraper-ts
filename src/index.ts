import { argv } from "node:process";
import { crawlSiteAsync } from "./crawl";

async function main() {
  if (argv.length < 3) {
    console.error("too few arguments");
    process.exit(1);
  }
  if (argv.length > 3) {
    console.error("too many arguments");
    process.exit(1);
  }
  const baseURL = argv[2];

  console.log(`starting crawl of:${baseURL}...`);

  const pages = await crawlSiteAsync(baseURL);

  console.log(pages);

  process.exit(0);
}

main();
