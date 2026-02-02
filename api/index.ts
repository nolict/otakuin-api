import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

import { animeRoute } from '../src/api/anime';
import { homeRoute } from '../src/api/home';
import { streamingRoutes } from '../src/api/streaming';
import { videoProxyRoute } from '../src/api/video-proxy';

const app = new Elysia()
  .use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    credentials: true
  }))
  .use(homeRoute)
  .use(animeRoute)
  .use(streamingRoutes)
  .use(videoProxyRoute)
  .get('/', () => ({
    message: 'Anime Scraper API',
    version: '1.7.0',
    endpoints: {
      home: '/api/home',
      anime: '/api/anime/:id_mal',
      streaming: '/api/streaming/:id/:episode',
      videoProxy: '/api/video-proxy?url={encoded_video_url}'
    }
  }));

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  
  const request = new Request(url, {
    method: req.method ?? 'GET',
    headers: new Headers(req.headers as Record<string, string>),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
  });

  try {
    const response = await app.fetch(request);
    
    res.status(response.status);
    
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (response.body) {
      const body = await response.arrayBuffer();
      res.send(Buffer.from(body));
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
