import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';

import { animeRoute } from './api/anime';
import { homeRoute } from './api/home';
import { streamingRoutes } from './api/streaming';
import { videoRoute } from './api/video';

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
  .use(swagger({
    path: '/docs',
    documentation: {
      info: {
        title: 'Otakuin API',
        version: '1.17.1',
        description: 'Unified anime streaming API with multi-source aggregation'
      }
    }
  }))
  .get('/', () => {
    return Response.redirect('/docs');
  })
  .listen(3000);

console.log(`Server is running at ${app.server?.hostname ?? 'localhost'}:${app.server?.port ?? 3000}`);
