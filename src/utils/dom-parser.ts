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
    const response = await fetch(url, { signal: controller.signal });
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

export function inspectElement(element: cheerio.Cheerio<cheerio.Element>): DOMElement {
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
