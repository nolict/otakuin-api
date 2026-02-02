import { fetchHTML, inspectElement, parseDOM } from '../utils/dom-parser.js';

interface SelectorInfo {
  selector: string;
  label: string;
}

function printSeparator(char = '='): void {
  console.log(char.repeat(80));
}

function printHeader(title: string): void {
  printSeparator();
  console.log(`  ${title}`);
  printSeparator();
}

function analyzePage(html: string): void {
  const $ = parseDOM(html);

  printHeader('PAGE STRUCTURE ANALYSIS');

  console.log('\n📊 Document Statistics:');
  console.log(`   Total elements: ${$('*').length}`);
  console.log(`   Links: ${$('a').length}`);
  console.log(`   Images: ${$('img').length}`);
  console.log(`   Forms: ${$('form').length}`);

  printHeader('IMPORTANT ELEMENTS');

  const importantSelectors: SelectorInfo[] = [
    { selector: 'header', label: 'Header' },
    { selector: 'nav', label: 'Navigation' },
    { selector: 'main', label: 'Main Content' },
    { selector: 'article', label: 'Articles' },
    { selector: 'section', label: 'Sections' },
    { selector: 'footer', label: 'Footer' },
    { selector: '[class*="content"]', label: 'Content Containers' },
    { selector: '[class*="item"]', label: 'Item Containers' },
    { selector: '[class*="card"]', label: 'Card Elements' },
    { selector: '[class*="list"]', label: 'List Elements' }
  ];

  importantSelectors.forEach(({ selector, label }) => {
    const elements = $(selector);
    if (elements.length > 0) {
      console.log(`\n🔍 ${label} (${selector}):`);
      console.log(`   Found: ${elements.length} element(s)`);

      elements.slice(0, 3).each((i, el) => {
        const info = inspectElement($(el));
        console.log(`\n   [${i + 1}] <${info.tag}>`);
        if (info.id.length > 0) {
          console.log(`       ID: #${info.id}`);
        }
        if (info.classes.length > 0) {
          console.log(`       Classes: .${info.classes.join(', .')}`);
        }
        console.log(`       Children: ${info.children}`);
        if (info.text.length > 0) {
          const preview = info.text.substring(0, 60);
          const ellipsis = info.text.length > 60 ? '...' : '';
          console.log(`       Text: "${preview}${ellipsis}"`);
        }
      });
    }
  });

  printHeader('ALL UNIQUE CLASSES');

  const allClasses = new Set<string>();
  $('[class]').each((_, el) => {
    const classes = $(el).attr('class')?.split(' ') ?? [];
    classes.forEach((cls) => {
      if (cls.length > 0) {
        allClasses.add(cls);
      }
    });
  });

  const sortedClasses = Array.from(allClasses).sort();
  console.log(`\nTotal unique classes: ${sortedClasses.length}\n`);

  sortedClasses.forEach((cls) => {
    const count = $(`.${cls}`).length;
    console.log(`   .${cls} (${count} elements)`);
  });

  printHeader('ALL UNIQUE IDs');

  const allIds = new Set<string>();
  $('[id]').each((_, el) => {
    const id = $(el).attr('id');
    if (id !== undefined && id.length > 0) {
      allIds.add(id);
    }
  });

  console.log(`\nTotal unique IDs: ${allIds.size}\n`);
  Array.from(allIds).sort().forEach((id) => {
    console.log(`   #${id}`);
  });

  printSeparator();
}

async function main(): Promise<void> {
  const url = process.argv[2];

  if (url === undefined || url.length === 0) {
    console.error('❌ Error: URL is required');
    console.log('\nUsage: bun src/scripts/scan.ts <url>');
    console.log('Example: bun src/scripts/scan.ts https://v1.samehadaku.how/anime-terbaru/');
    process.exit(1);
  }

  try {
    console.log(`\n🌐 Fetching: ${url}\n`);
    const html = await fetchHTML(url);
    console.log('✅ HTML fetched successfully\n');

    analyzePage(html);

    console.log('\n✨ Scan completed successfully!\n');
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    process.exit(1);
  }
}

void main();
