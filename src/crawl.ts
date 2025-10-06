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

export async function getHTML(url: string) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "BootCrawler/1.0" },
    });
  } catch (err) {
    throw new Error(`Got Network error: ${(err as Error).message}`);
  }

  if (response.status > 399) {
    console.error(`Got HTTP error: ${response.status} ${response.statusText}`);
    return "";
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("text/html")) {
    console.log(`Got non-HTML response: ${contentType}`);
    return "";
  }

  return response.text();
}

export async function crawlPage(
  baseURL: string,
  currentURL: string = baseURL,
  pages: Record<string, number> = {},
) {
  const currentURLObj = new URL(currentURL);
  const baseURLObj = new URL(baseURL);
  if (currentURLObj.hostname !== baseURLObj.hostname) {
    return pages;
  }

  const normalizedURL = normalizeURL(currentURL);

  if (pages[normalizedURL] > 0) {
    pages[normalizedURL]++;
    return pages;
  }

  pages[normalizedURL] = 1;

  console.log(`crawling ${currentURL}`);
  let html = "";
  try {
    html = await getHTML(currentURL);
  } catch (err) {
    console.log(`${(err as Error).message}`);
    return pages;
  }

  const nextURLs = getURLsFromHTML(html, baseURL);

  for (const nextURL of nextURLs) {
    pages = await crawlPage(baseURL, nextURL, pages);
  }

  return pages;
}

export class ConcurrentCrawler {
  private baseURL: string;
  private pages: Record<string, number>;
  private limit: <T>(fn: () => Promise<T>) => Promise<T>;

  constructor(baseURL: string, maxConcurrency: number = 5) {
    this.baseURL = baseURL;
    this.pages = {};
    this.limit = pLimit(maxConcurrency);
  }

  private addPageVisit(normalizedURL: string): boolean {
    if (this.pages[normalizedURL]) {
      this.pages[normalizedURL]++;
      return false;
    }

    this.pages[normalizedURL] = 1;
    return true;
  }

  private async getHTML(currentURL: string): Promise<string> {
    return await this.limit(async () => {
      let res;
      try {
        res = await fetch(currentURL, {
          headers: { "User-Agent": "BootCrawler/1.0" },
        });
      } catch (err) {
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
      html = await getHTML(currentURL);
    } catch (err) {
      console.log(`${(err as Error).message}`);
      return;
    }

    const nextURLs = getURLsFromHTML(html, this.baseURL);

    const crawlPromises = nextURLs.map((nextURL) => this.crawlPage(nextURL));

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
