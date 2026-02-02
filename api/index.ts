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

export default app.fetch;
