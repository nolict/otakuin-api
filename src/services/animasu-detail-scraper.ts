import { fetchHTML, parseDOM } from '../utils/dom-parser';

import type { AnimeDetailScraped, AnimeMetadata, Episode, ScraperResult } from '../types/anime';

const ANIMASU_BASE_URL = 'https://v0.animasu.app';

function parseSeasonYear(seasonStr: string): { season?: string; year?: number } {
  const normalized = seasonStr.toLowerCase().trim();
  
  // Try to extract season
  let season: string | undefined;
  if (normalized.includes('spring')) {
    season = 'spring';
  } else if (normalized.includes('summer')) {
    season = 'summer';
  } else if (normalized.includes('fall')) {
    season = 'fall';
  } else if (normalized.includes('winter')) {
    season = 'winter';
  }
  
  // Try to extract year
  const yearMatch = normalized.match(/\d{4}/);
  const year = yearMatch !== null ? parseInt(yearMatch[0], 10) : undefined;
  
  return { season, year };
}

function parseReleaseDate(dateStr: string): { year?: number } {
  const normalized = dateStr.trim();
  const yearMatch = normalized.match(/\d{4}/);
  
  if (yearMatch !== null) {
    return { year: parseInt(yearMatch[0], 10) };
  }
  
  return {};
}

function extractEpisodeNumber(text: string): number {
  // Try to find "Episode X" or "Ep X" or just "X" at the start
  const patterns = [
    /episode\s*(\d+)/i,
    /ep\s*(\d+)/i,
    /^(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match !== null && match[1] !== undefined) {
      return parseInt(match[1], 10);
    }
  }
  
  return 0;
}

export async function scrapeAnimasuDetail(slug: string): Promise<ScraperResult<AnimeDetailScraped>> {
  const url = `${ANIMASU_BASE_URL}/anime/${slug}/`;
  
  try {
    const html = await fetchHTML(url);
    const $ = parseDOM(html);
    
    // Extract title from alternative title or h1
    const altTitle = $('.alter').text().trim();
    const h1Title = $('h1.entry-title').text().trim();
    const title = altTitle.length > 0 ? altTitle : h1Title;
    
    const metadata: AnimeMetadata = {
      title,
      alternativeTitles: {},
      type: '',
      status: ''
    };
    
    if (altTitle.length > 0 && h1Title.length > 0 && altTitle !== h1Title) {
      metadata.alternativeTitles.synonyms = [h1Title];
    }
    
    // Parse metadata from .infox .spe span
    $('.infox .spe span').each((_, el) => {
      const $el = $(el);
      const label = $el.find('b').text().trim().toLowerCase();
      $el.find('b').remove();
      const value = $el.text().trim();
      
      if (label.includes('status')) {
        metadata.status = value;
      } else if (label.includes('rilis')) {
        const parsed = parseReleaseDate(value);
        if (parsed.year !== undefined) {
          metadata.year = parsed.year;
        }
      } else if (label.includes('jenis')) {
        metadata.type = value;
      } else if (label.includes('durasi')) {
        metadata.duration = value;
      } else if (label.includes('studio')) {
        metadata.studio = value;
      } else if (label.includes('musim')) {
        const parsed = parseSeasonYear(value);
        metadata.season = parsed.season;
        if (parsed.year !== undefined) {
          metadata.year = parsed.year;
        }
      }
    });
    
    // Extract episodes from .bixbox.epcheck li or .eplister ul li
    const episodes: Episode[] = [];
    
    // Try new selector first (.bixbox.epcheck li)
    let episodeElements = $('.bixbox.epcheck li');
    
    // Fallback to old selector
    if (episodeElements.length === 0) {
      episodeElements = $('.eplister ul li');
    }
    
    episodeElements.each((_, el) => {
      const $el = $(el);
      
      // New format (.bixbox.epcheck li) - link inside .lchx a
      const lchxLink = $el.find('.lchx a');
      let episodeUrl = lchxLink.attr('href') ?? '';
      let episodeText = lchxLink.text().trim();
      
      // Fallback: direct link
      if (episodeUrl.length === 0) {
        const linkElement = $el.find('a');
        episodeUrl = linkElement.attr('href') ?? '';
        episodeText = linkElement.text().trim();
      }
      
      // Old format (.eplister ul li)
      const episodeNum = $el.find('.epl-num').text().trim();
      const episodeTitle = $el.find('.epl-title').text().trim();
      const releaseDate = $el.find('.epl-date').text().trim();
      
      if (episodeUrl.length > 0) {
        let episodeNumber = 0;
        let finalTitle = '';
        
        // Extract from new format
        if (episodeText.length > 0) {
          // Remove extra text like "Tonton", "Watch", etc
          const cleanText = episodeText.replace(/\s+(tonton|watch|stream)$/i, '').trim();
          episodeNumber = extractEpisodeNumber(cleanText);
          finalTitle = cleanText;
        } else if (episodeNum.length > 0) {
          // Extract from old format
          episodeNumber = extractEpisodeNumber(episodeNum);
          finalTitle = episodeTitle.length > 0 ? episodeTitle : `Episode ${episodeNumber}`;
        }
        
        if (episodeNumber > 0) {
          episodes.push({
            number: episodeNumber,
            title: finalTitle.length > 0 ? finalTitle : `Episode ${episodeNumber}`,
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
        error: 'Could not extract anime title from Animasu'
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
