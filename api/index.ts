import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = req.url ?? '/';
  
  // Root endpoint
  if (url === '/' || url === '') {
    res.status(200).json({
      message: 'Anime Scraper API',
      version: '1.7.0',
      endpoints: {
        home: '/api/home',
        anime: '/api/anime/:id_mal',
        streaming: '/api/streaming/:id/:episode',
        videoProxy: '/api/video-proxy?url={encoded_video_url}'
      }
    });
    return;
  }

  // Import and route to specific handlers
  try {
    if (url.startsWith('/api/home')) {
      const { scrapeHomePage } = await import('../src/services/scrapers/samehadaku-home.scraper');
      const result = await scrapeHomePage();
      res.status(200).json(result.data ?? []);
      return;
    }
    
    if (url.startsWith('/api/anime/')) {
      const malId = url.split('/api/anime/')[1]?.split('?')[0];
      if (!malId || isNaN(Number(malId))) {
        res.status(400).json({ error: 'Invalid MAL ID' });
        return;
      }
      const { getUnifiedAnimeDetail } = await import('../src/services/aggregators/anime.aggregator');
      const result = await getUnifiedAnimeDetail(Number(malId));
      res.status(200).json(result);
      return;
    }
    
    if (url.startsWith('/api/streaming/')) {
      const parts = url.split('/api/streaming/')[1]?.split('/');
      const malId = parts?.[0];
      const episode = parts?.[1]?.split('?')[0];
      
      if (!malId || !episode || isNaN(Number(malId)) || isNaN(Number(episode))) {
        res.status(400).json({ error: 'Invalid MAL ID or episode number' });
        return;
      }
      
      const { getStreamingLinks } = await import('../src/services/aggregators/streaming.aggregator');
      const result = await getStreamingLinks(Number(malId), Number(episode));
      res.status(200).json(result);
      return;
    }
    
    if (url.startsWith('/api/video-proxy')) {
      const urlParams = new URLSearchParams(url.split('?')[1] ?? '');
      const videoUrl = urlParams.get('url');
      
      if (!videoUrl) {
        res.status(400).json({ error: 'Missing url parameter' });
        return;
      }
      
      if (!videoUrl.includes('googlevideo.com')) {
        res.status(403).json({ error: 'Invalid video URL domain' });
        return;
      }
      
      const rangeHeader = req.headers.range;
      const headers: Record<string, string> = { Accept: '*/*' };
      if (rangeHeader) {
        headers.Range = rangeHeader;
      }
      
      const response = await fetch(videoUrl, {
        headers,
        signal: AbortSignal.timeout(30000)
      });
      
      if (!response.ok) {
        res.status(response.status).json({ error: `Video source returned ${response.status}` });
        return;
      }
      
      const contentType = response.headers.get('Content-Type') ?? 'video/mp4';
      const contentLength = response.headers.get('Content-Length');
      const acceptRanges = response.headers.get('Accept-Ranges') ?? 'bytes';
      const contentRange = response.headers.get('Content-Range');
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      if (response.status === 206) {
        res.status(206);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
      return;
    }
    
    res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
