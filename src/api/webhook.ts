import { Elysia } from 'elysia';

import { getPendingQueueItems, getQueueStats , updateQueueStatus } from '../services/repositories/video-queue.repository';
import { saveVideoStorage } from '../services/repositories/video-storage.repository';
import { logger } from '../utils/logger';

import type { VideoStorageItem } from '../types/video-storage';

export const webhookRoutes = new Elysia({ prefix: '/api/webhook' })
  .post('/queue-trigger', async ({ body, set, headers }) => {
    try {
      const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
      const authHeader = headers.authorization ?? '';

      if (webhookSecret.length > 0 && authHeader !== `Bearer ${webhookSecret}`) {
        set.status = 401;
        return {
          success: false,
          error: 'Unauthorized'
        };
      }

      const limit = (body as { limit?: number }).limit ?? 10;
      const pendingItems = await getPendingQueueItems(limit);

      if (pendingItems.length === 0) {
        logger.info('No pending queue items found');
        return {
          success: true,
          message: 'No pending items in queue',
          items: []
        };
      }

      logger.info(`Retrieved ${pendingItems.length} pending queue items for processing`);

      return {
        success: true,
        message: `Found ${pendingItems.length} pending items`,
        items: pendingItems
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Webhook error: ${errorMessage}`);
      set.status = 500;
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  })
  .get('/queue-stats', async ({ set, headers }) => {
    try {
      const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
      const authHeader = headers.authorization ?? '';

      if (webhookSecret.length > 0 && authHeader !== `Bearer ${webhookSecret}`) {
        set.status = 401;
        return {
          success: false,
          error: 'Unauthorized'
        };
      }

      const stats = await getQueueStats();

      return {
        success: true,
        stats
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Webhook error: ${errorMessage}`);
      set.status = 500;
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  })
  .post('/queue-complete', async ({ body, set, headers }) => {
    try {
      const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
      const authHeader = headers.authorization ?? '';

      if (webhookSecret.length > 0 && authHeader !== `Bearer ${webhookSecret}`) {
        set.status = 401;
        return {
          success: false,
          error: 'Unauthorized'
        };
      }

      const bodyData = body as {
        queue_id: number;
        status: 'completed' | 'failed';
        error_message?: string;
      };

      const queueId = bodyData.queue_id;
      const queueStatus = bodyData.status;
      const errorMessage = bodyData.error_message;

      if (queueId === undefined || queueStatus === undefined) {
        set.status = 400;
        return {
          success: false,
          error: 'Missing required fields: queue_id, status'
        };
      }

      const updated = await updateQueueStatus(queueId, queueStatus, errorMessage);

      if (!updated) {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to update queue status'
        };
      }

      logger.info(`Queue item ${queueId} marked as ${queueStatus}`);

      return {
        success: true,
        message: `Queue item ${queueId} updated to ${queueStatus}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Webhook error: ${errorMessage}`);
      set.status = 500;
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  })
  .post('/save-video-storage', async ({ body, set, headers }) => {
    try {
      const webhookSecret = process.env.WEBHOOK_SECRET ?? '';
      const authHeader = headers.authorization ?? '';

      if (webhookSecret.length > 0 && authHeader !== `Bearer ${webhookSecret}`) {
        set.status = 401;
        return {
          success: false,
          error: 'Unauthorized'
        };
      }

      const videoData = body as Omit<VideoStorageItem, 'id' | 'created_at' | 'updated_at'>;

      if (videoData.mal_id === undefined || videoData.episode === undefined) {
        set.status = 400;
        return {
          success: false,
          error: 'Missing required fields'
        };
      }

      const saved = await saveVideoStorage(videoData);

      if (!saved) {
        set.status = 500;
        return {
          success: false,
          error: 'Failed to save video storage'
        };
      }

      logger.info(`Video storage saved: ${videoData.file_name}`);

      return {
        success: true,
        message: 'Video storage saved successfully'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Webhook error: ${errorMessage}`);
      set.status = 500;
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  });
