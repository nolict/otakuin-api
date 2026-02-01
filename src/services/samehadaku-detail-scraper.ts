import { fetchHTML, parseDOM } from '../utils/dom-parser';

import type { AnimeDetailScraped, AnimeMetadata, Episode, ScraperResult } from '../types/anime';

const SAMEHADAKU_BASE_URL = 'https://v1.samehadaku.how';

function parseSeasonYear(seasonStr: string): { season?: string; year?: number } {
  const normalized = seasonStr.toLowerCase().trim();
  const seasonMatch = normalized.match(/(spring|summer|fall|winter)\s+(\d{4})/);
  
  if (seasonMatch !== null) {
    return {
      season: seasonMatch[1],
      year: parseInt(seasonMatch[2], 10)
    };
  }
  
  return {};
}

function extractEpisodeNumber(text: string): number {
  const match = text.match(/episode\s+(\d+)/i);
  if (match !== null && match[1] !== undefined) {
    return parseInt(match[1], 10);
  }
  return 0;
}

export async function scrapeSamehadakuDetail(slug: string): Promise<ScraperResult<AnimeDetailScraped>> {
  const url = `${SAMEHADAKU_BASE_URL}/anime/${slug}/`;
  
  try {
    const html = await fetchHTML(url);
    const $ = parseDOM(html);
    
    // Extract metadata
    const title = $('h1.entry-title').text().trim().replace(/\s+Sub\s+Indo$/i, '');
    const metadata: AnimeMetadata = {
      title,
      alternativeTitles: {},
      type: '',
      status: ''
    };
    
    // Parse metadata from .infoanime .spe span
    $('.infoanime .spe span').each((_, el) => {
      const $el = $(el);
      const label = $el.find('b').text().trim().toLowerCase();
      const fullText = $el.text().trim();
      const value = fullText.replace($el.find('b').text().trim(), '').trim();
      
      if (label.includes('japanese')) {
        metadata.alternativeTitles.japanese = value;
      } else if (label.includes('english')) {
        metadata.alternativeTitles.english = value;
      } else if (label.includes('synonyms')) {
        metadata.alternativeTitles.synonyms = [value];
      } else if (label.includes('type')) {
        metadata.type = value;
      } else if (label.includes('status')) {
        metadata.status = value;
      } else if (label.includes('season')) {
        const parsed = parseSeasonYear(value);
        metadata.season = parsed.season;
        metadata.year = parsed.year;
      } else if (label.includes('studio')) {
        metadata.studio = value;
      } else if (label.includes('source')) {
        metadata.source = value;
      } else if (label.includes('duration')) {
        metadata.duration = value;
      } else if (label.includes('total episode')) {
        metadata.totalEpisodes = value;
      } else if (label.includes('released')) {
        metadata.releasedDate = value;
      }
    });
    
    // Extract episodes
    const episodes: Episode[] = [];
    $('.lstepsiode.listeps ul li').each((_, el) => {
      const $el = $(el);
      const episodeTitle = $el.find('.lchx a').text().trim();
      const episodeUrl = $el.find('.lchx a').attr('href') ?? '';
      const releaseDate = $el.find('.date').text().trim();
      
      if (episodeUrl.length > 0 && episodeTitle.length > 0) {
        const episodeNumber = extractEpisodeNumber(episodeTitle);
        
        if (episodeNumber > 0) {
          episodes.push({
            number: episodeNumber,
            title: episodeTitle,
            url: episodeUrl,
            releaseDate: releaseDate.length > 0 ? releaseDate : undefined
          });
        }
      }
    });
    
    // Sort episodes by number ascending
    episodes.sort((a, b) => a.number - b.number);
    
    if (title.length === 0) {
      return {
        success: false,
        error: 'Could not extract anime title from Samehadaku'
      };
    }
    
    return {
      success: true,
      data: {
        metadata,
        episodes
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
