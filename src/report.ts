import * as fs from "node:fs";
import * as path from "node:path";
import { ExtractedPageData } from "./crawl";

function csvEscape(field: string) {
  const str = field ?? "";
  const needsQuoting = /[",\n]/.test(str);
  const escaped = str.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

export function writeCSVReport(
  pageData: Record<string, ExtractedPageData | unknown>,
  filename = "report.csv",
) {

  const headers = ["page_url", "h1", "first_paragraph", "outgoing_link_urls", "image_urls"]
  const rows: string[] = [];
  rows.push(headers.join(","));

  const keys = Object.keys(pageData).sort();
  let skipped = 0;

  for (const key of keys) {
    const raw = (pageData as Record<string, any>)[key];

    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }

    const url = typeof raw.url === "string" ? raw.url : key;
    const h1 = typeof raw.h1 === "string" ? raw.h1 : "";
    const first =
      typeof raw.first_paragraph === "string" ? raw.first_paragraph : "";

    const outgoing = Array.isArray(raw.outgoing_links)
      ? (raw.outgoing_links as string[])
      : [];
    const images = Array.isArray(raw.image_urls)
      ? (raw.image_urls as string[])
      : [];

    const values = [url, h1, first, outgoing.join(";"), images.join(";")].map(
      csvEscape,
    );

    rows.push(values.join(','));
  }

  const filePath = path.resolve(process.cwd(), filename);
  fs.writeFileSync(filePath, rows.join("\n"), { encoding: "utf-8" });
}

