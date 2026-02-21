import { Elysia } from 'elysia';

import { getHomePageAnimeList } from '../services/aggregators/home.aggregator';

const ITEMS_PER_PAGE = 10;

export const homeRoute = new Elysia({ prefix: '/api' })
  .get('/home', async ({ query }) => {
    const page = parseInt(query.page ?? '1', 10);

    if (page < 1 || isNaN(page)) {
      return {
        error: 'Invalid page number',
        data: [],
        pagination: {
          current_page: 1,
          per_page: ITEMS_PER_PAGE,
          total: 0,
          total_pages: 0
        }
      };
    }

    const result = await getHomePageAnimeList();

    if (!result.success) {
      return {
        error: result.error,
        data: [],
        pagination: {
          current_page: page,
          per_page: ITEMS_PER_PAGE,
          total: 0,
          total_pages: 0
        }
      };
    }

    const allData = result.data ?? [];
    const totalPages = Math.ceil(allData.length / ITEMS_PER_PAGE);
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedData = allData.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      pagination: {
        current_page: page,
        per_page: ITEMS_PER_PAGE,
        total: allData.length,
        total_pages: totalPages
      }
    };
  }, {
    detail: {
      tags: ['Home'],
      summary: 'Get latest anime list',
      description: 'Returns paginated list of latest anime from Samehadaku and Animasu, normalized with MyAnimeList data. Results are cached for 6 hours.',
      parameters: [
        {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'integer', default: 1 },
          description: 'Page number for pagination'
        }
      ]
    }
  });
