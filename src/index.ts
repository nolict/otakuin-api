import { Elysia } from 'elysia';

import { animeRoute } from './api/anime';
import { homeRoute } from './api/home';
import { streamingRoutes } from './api/streaming';

const app = new Elysia()
  .use(homeRoute)
  .use(animeRoute)
  .use(streamingRoutes)
  .get('/', () => ({
    message: 'Anime Scraper API',
    version: '1.5.0',
    endpoints: {
      home: '/api/home',
      anime: '/api/anime/:id_mal',
      streaming: '/api/streaming/:id/:episode'
    }
  }))
  .listen(3000);

console.log(`🦊 Server is running at ${app.server?.hostname ?? 'localhost'}:${app.server?.port ?? 3000}`);
