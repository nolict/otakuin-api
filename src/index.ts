import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

import { animeRoute } from './api/anime';
import { homeRoute } from './api/home';
import { streamingRoutes } from './api/streaming';
import { videoRoute } from './api/video';
import { videoProxyRoute } from './api/video-proxy';

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
  .use(videoRoute)
  .use(videoProxyRoute)
  .get('/', () => ({
    message: 'Anime Scraper API',
    version: '1.10.0',
    endpoints: {
      home: '/api/home',
      anime: '/api/anime/:id_mal',
      streaming: '/api/streaming/:id/:episode',
      video: '/api/video/:code',
      videoProxy: '/api/video-proxy?url={encoded_video_url}'
    }
  }))
  .listen(3000);

console.log(`🦊 Server is running at ${app.server?.hostname ?? 'localhost'}:${app.server?.port ?? 3000}`);
