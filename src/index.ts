import { argv } from "node:process";
import { crawlPage } from "./crawl";

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
  console.log(`Crawler starting at baseURL:${baseURL}...`);
  const pages = await crawlPage(baseURL);
  console.log(pages);

  process.exit(0);
}

main();
