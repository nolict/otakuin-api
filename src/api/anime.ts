import { Elysia } from 'elysia';

import { getUnifiedAnimeDetail } from '../services/anime-unified';

export const animeRoute = new Elysia({ prefix: '/api' })
  .get('/anime/:id_mal', async ({ params }) => {
    const malId = parseInt(params.id_mal, 10);

    if (isNaN(malId) || malId <= 0) {
      return {
        error: 'Invalid MAL ID. Must be a positive integer.',
        data: null
      };
    }

    const result = await getUnifiedAnimeDetail(malId);

    if (!result.success) {
      return {
        error: result.error,
        data: null
      };
    }

    return result.data ?? null;
  });
