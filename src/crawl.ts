import { JSDOM } from "jsdom";
import pLimit from 'p-limit';

export function normalizeURL(input: string) {
  const parsedURL = URL.parse(input);
  if (!parsedURL) {
    throw new Error("invalid url");
  }

  const host = parsedURL.host;
  const stripTrailingSlash = (str: string) => {
    return str.endsWith("/") ? str.slice(0, -1) : str;
  };
  const pathname = stripTrailingSlash(parsedURL.pathname);

  return `${host}${pathname}`;
}

export function getH1FromHTML(html: string): string {
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const h1 = doc.querySelector("h1");
    return (h1?.textContent ?? "").trim();
  } catch {
    return "";
  }
}

export function getFirstParagraphFromHTML(html: string): string {
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const main = doc.querySelector("main");
    const p = main?.querySelector("p") ?? doc.querySelector("p");
    return (p?.textContent ?? "").trim();
  } catch {
    return "";
  }
}

export function getURLsFromHTML(html: string, baseURL: string): string[] {
  const urls: string[] = [];
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const anchors = doc.querySelectorAll("a");

    anchors.forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href) return;

      try {
        const absoluteURL = new URL(href, baseURL).toString();
        urls.push(absoluteURL);
      } catch (err) {
        console.error(`invalid href '${href}':`, err);
      }
    });
  } catch (err) {
    console.error("failed to parse HTML:", err);
  }
  return urls;
}

export function getImagesFromHTML(html: string, baseURL: string): string[] {
  const imageURLs: string[] = [];
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const images = doc.querySelectorAll("img");

    images.forEach((img) => {
      const src = img.getAttribute("src");
      if (!src) return;

      try {
        const absoluteURL = new URL(src, baseURL).toString();
        imageURLs.push(absoluteURL);
      } catch (err) {
        console.error(`invalid src '${src}':`, err);
      }
    });
  } catch (err) {
    console.error("failed to parse HTML:", err);
  }
  return imageURLs;
}

export type ExtractedPageData = {
  url: string;
  h1: string;
  first_paragraph: string;
  outgoing_links: string[];
  image_urls: string[];
};

export function extractPageData(
  html: string,
  pageURL: string,
): ExtractedPageData {
  return {
    url: pageURL,
    h1: getH1FromHTML(html),
    first_paragraph: getFirstParagraphFromHTML(html),
    outgoing_links: getURLsFromHTML(html, pageURL),
    image_urls: getImagesFromHTML(html, pageURL),
  };
}

export class ConcurrentCrawler {
  private baseURL: string;
  private pages: Record<string, number>;
  private limit: <T>(fn: () => Promise<T>) => Promise<T>;

  private maxPages: number;
  private shouldStop = false;
  private allTasks = new Set<Promise<void>>();
  private abortController = new AbortController();

  private visited = new Set<string>();

  constructor(baseURL: string, maxConcurrency: number = 5, maxPages: number = 100) {
    this.baseURL = baseURL;
    this.pages = {};
    this.limit = pLimit(maxConcurrency);
    this.maxPages = Math.max(1, maxPages);
  }

  private addPageVisit(normalizedURL: string): boolean {
    if (this.shouldStop) return false;

    if (this.pages[normalizedURL]) {
      this.pages[normalizedURL]++;
    } else {
      this.pages[normalizedURL] = 1;
    }

    if (this.visited.has(normalizedURL)) {
      return false;
    }

    if (this.visited.size >= this.maxPages) {
      this.shouldStop = true;
      console.log("Reached maximum number of pages to crawl.");
      this.abortController.abort();
      return false;
    }

    this.visited.add(normalizedURL);
    return true;
  }

  private async getHTML(currentURL: string): Promise<string> {
    const { signal } = this.abortController;
    return await this.limit(async () => {
      let res;
      try {
        res = await fetch(currentURL, {
          headers: { "User-Agent": "BootCrawler/1.0" },
          signal,
        });
      } catch (err) {
        if ((err as any)?.name === "AbortError") {
          throw new Error("Fetch aborted");
        }
        throw new Error(`Got Network error: ${(err as Error).message}`);
      }

      if (res.status > 399) {
        console.error(`Got HTTP error: ${res.status} ${res.statusText}`);
        return "";
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("text/html")) {
        console.log(`Got non-HTML response: ${contentType}`);
        return "";
      }

      return res.text();
    });
  }

  private async crawlPage(currentURL: string): Promise<void> {
    if (this.shouldStop) return;

    const currentURLObj = new URL(currentURL);
    const baseURLObj = new URL(this.baseURL);
    if (currentURLObj.hostname !== baseURLObj.hostname) {
      return;
    }

    const normalizedURL = normalizeURL(currentURL);


    if (!this.addPageVisit(normalizedURL)) {
      return;
    }

    console.log(`crawling ${currentURL}`);

    let html = "";
    try {
      html = await this.getHTML(currentURL);
    } catch (err) {
      console.log(`${(err as Error).message}`);
      return;
    }

    if (this.shouldStop) return;

    const nextURLs = getURLsFromHTML(html, this.baseURL);

    const crawlPromises: Promise<void>[] = [];
    for (const nextURL of nextURLs) {
      if (this.shouldStop) break;

      const task = this.crawlPage(nextURL);
      this.allTasks.add(task);
      task.finally(() => this.allTasks.delete(task));
      crawlPromises.push(task);
    }

    await Promise.all(crawlPromises);
  }

  async crawl(): Promise<Record<string, number>> {
    await this.crawlPage(this.baseURL);
    return this.pages;
  }
}

export async function crawlSiteAsync(
  baseURL: string,
  maxConcurrency: number = 5,
): Promise<Record<string, number>> {
  const crawler = new ConcurrentCrawler(baseURL, maxConcurrency);
  return await crawler.crawl();
}
