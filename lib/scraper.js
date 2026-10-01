import { z } from "zod";

export const ScrapeSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  extract: z.enum(["text", "html", "links", "meta", "full"]).default("text"),
  timeout: z.number().int().min(1000).max(15000).default(8000),
});

export async function scrapeUrl(input) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout);

  try {
    const response = await fetch(input.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScrapeAgent/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return { url: input.url, status: "error", error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    const elapsed = Date.now() - start;

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;
    const cleaned = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");
    const text = cleaned.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (input.extract === "links") {
      const links = [];
      const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        const href = m[1].trim();
        const linkText = m[2].replace(/<[^>]+>/g, "").trim();
        if (href && !href.startsWith("#") && linkText) {
          try {
            links.push({ href: new URL(href, input.url).href, text: linkText });
          } catch {}
        }
      }
      return { url: input.url, status: "ok", title, links: links.slice(0, 100), elapsed };
    }

    return {
      url: input.url,
      status: "ok",
      title,
      content: text.slice(0, 8000),
      wordCount: text.split(/\s+/).filter(Boolean).length,
      elapsed,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      url: input.url,
      status: "error",
      error: err.name === "AbortError" ? "Timeout" : err.message,
    };
  }
}
