import { Elysia } from 'elysia';

import { getUnifiedAnimeDetail } from '../services/aggregators/anime.aggregator';

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
  }, {
    detail: {
      tags: ['Anime'],
      summary: 'Get anime details by MAL ID',
      description: 'Returns complete anime information including title, synopsis, episodes from multiple sources (Samehadaku and Animasu), metadata from MyAnimeList. Uses advanced matching algorithm with 83.3% accuracy. Results are cached for 20 minutes.',
      parameters: [
        {
          name: 'id_mal',
          in: 'path',
          required: true,
          schema: { type: 'integer' },
          description: 'MyAnimeList anime ID',
          example: 21
        }
      ]
    }
  });
