import { Elysia } from 'elysia';

import { animeRoute } from './api/anime';
import { homeRoute } from './api/home';

const app = new Elysia()
  .use(homeRoute)
  .use(animeRoute)
  .get('/', () => ({
    message: 'Anime Scraper API',
    version: '1.0.0',
    endpoints: {
      home: '/api/home',
      anime: '/api/anime/:id_mal'
    }
  }))
  .listen(3000);

console.log(`🦊 Server is running at ${app.server?.hostname ?? 'localhost'}:${app.server?.port ?? 3000}`);
