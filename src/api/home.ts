import { Elysia } from 'elysia';

import { scrapeHomePage } from '../services/scrapers/samehadaku-home.scraper';

export const homeRoute = new Elysia({ prefix: '/api' })
  .get('/home', async () => {
    const result = await scrapeHomePage();

    if (!result.success) {
      return {
        error: result.error,
        data: []
      };
    }

    return result.data ?? [];
  });
