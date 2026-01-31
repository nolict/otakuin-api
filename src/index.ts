import { Elysia } from 'elysia';

import { homeRoute } from './api/home';

const app = new Elysia()
  .use(homeRoute)
  .get('/', () => ({
    message: 'Anime Scraper API',
    version: '1.0.0',
    endpoints: {
      home: '/api/home'
    }
  }))
  .listen(3000);

console.log(`🦊 Server is running at ${app.server?.hostname ?? 'localhost'}:${app.server?.port ?? 3000}`);
