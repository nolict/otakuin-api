import * as cheerio from 'cheerio';

export interface DOMElement {
  tag: string;
  classes: string[];
  id: string;
  attributes: Record<string, string>;
  children: number;
  text: string;
}

const DEFAULT_TIMEOUT_MS = 10000;

export async function fetchHTML(url: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw new Error(
      `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function parseDOM(html: string): cheerio.CheerioAPI {
  return cheerio.load(html);
}

export function inspectElement(element: cheerio.Cheerio<any>): DOMElement {
  const $el = element.first();
  const firstElement: unknown = $el.get(0);
  const tagName: unknown = $el.prop('tagName');

  let attributes: Record<string, string> = {};
  if (
    firstElement !== null &&
    firstElement !== undefined &&
    typeof firstElement === 'object' &&
    'attribs' in firstElement
  ) {
    const attribs: unknown = firstElement.attribs;
    if (
      attribs !== null &&
      attribs !== undefined &&
      typeof attribs === 'object'
    ) {
      attributes = attribs as Record<string, string>;
    }
  }

  return {
    tag: typeof tagName === 'string' ? tagName.toLowerCase() : 'unknown',
    classes: $el.attr('class')?.split(' ').filter(Boolean) ?? [],
    id: $el.attr('id') ?? '',
    attributes,
    children: $el.children().length,
    text: $el.text().trim().substring(0, 100)
  };
}
