import * as cheerio from 'cheerio';

export interface DOMElement {
  tag: string;
  classes: string[];
  id: string;
  attributes: Record<string, string>;
  children: number;
  text: string;
}

export async function fetchHTML(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    throw new Error(
      `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
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
