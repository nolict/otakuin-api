import { Elysia } from 'elysia';

import { getStreamingLinks } from '../services/aggregators/streaming.aggregator';
import { logger } from '../utils/logger';

export const streamingRoutes = new Elysia({ prefix: '/api/streaming' })
  .get('/:id/:episode', async ({ params, set }) => {
    try {
      const malId = parseInt(params.id, 10);
      const episode = parseInt(params.episode, 10);

      if (isNaN(malId) || malId <= 0) {
        set.status = 400;
        return {
          error: 'Invalid MAL ID. Must be a positive integer.',
          sources: []
        };
      }

      if (isNaN(episode) || episode <= 0) {
        set.status = 400;
        return {
          error: 'Invalid episode number. Must be a positive integer.',
          sources: []
        };
      }

      const result = await getStreamingLinks(malId, episode);

      if (result.sources.length === 0) {
        logger.warn(`No streaming sources found for MAL ${malId} Episode ${episode}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error fetching streaming links: ${errorMessage}`);
      set.status = 500;
      return {
        error: 'Internal server error while fetching streaming links',
        sources: []
      };
    }
  }, {
    detail: {
      tags: ['Streaming'],
      summary: 'Get streaming links for a specific episode',
      description: 'Returns all available streaming links from Samehadaku and Animasu for a specific anime episode. Results are cached for 20 minutes.',
      responses: {
        200: {
          description: 'Streaming links retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  mal_id: { type: 'number', example: 21 },
                  episode: { type: 'number', example: 1 },
                  sources: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        provider: { type: 'string', enum: ['samehadaku', 'animasu'], example: 'animasu' },
                        url: { type: 'string', example: 'https://ok.ru/videoembed/11683733572274' },
                        resolution: { type: 'string', example: '1080p' },
                        server: { type: 'string', example: '1' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Invalid parameters',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string' },
                  sources: { type: 'array', items: {} }
                }
              }
            }
          }
        },
        500: {
          description: 'Server error'
        }
      }
    }
  });
