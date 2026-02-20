import { File } from 'megajs';

import { logger } from '../../utils/logger';
import { getCachedVideoUrl, saveVideoUrlCache } from '../repositories/video-url-cache.repository';

export async function extractMegaVideoUrl(embedUrl: string): Promise<string | null> {
  const timer = logger.createTimer();

  try {
    const cachedUrl = await getCachedVideoUrl(embedUrl, 'mega');
    if (cachedUrl !== null) {
      logger.perf('Mega cache HIT', timer.split());
      return cachedUrl;
    }

    logger.debug('Extracting Mega.nz video metadata', { url: embedUrl });

    const match = embedUrl.match(/\/embed\/([^#]+)#(.+)/);
    if (match === null) {
      logger.warn('Invalid Mega.nz URL format', { url: embedUrl });
      return null;
    }

    const [, fileId, key] = match;

    const fileUrl = `https://mega.nz/file/${fileId}#${key}`;
    const file = File.fromURL(fileUrl);

    await file.loadAttributes();

    logger.debug('Mega.nz file metadata loaded', {
      name: file.name,
      size: file.size,
      sizeMB: (file.size / 1024 / 1024).toFixed(2)
    });

    logger.perf('Mega.nz metadata extraction completed', timer.end());

    await saveVideoUrlCache(embedUrl, 'mega', fileUrl);

    return fileUrl;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a rate limit error
    if (errorMessage.includes('ETOOMANY') || errorMessage.includes('Too many')) {
      logger.warn('Mega.nz rate limit reached - too many concurrent accesses', { url: embedUrl });
    } else {
      logger.error('Failed to extract Mega.nz video URL', { error: errorMessage });
    }

    return null;
  }
}

export function isMegaUrl(url: string): boolean {
  return url.includes('mega.nz/embed/');
}

export async function streamMegaVideo(
  fileUrl: string,
  start?: number,
  end?: number
): Promise<{ stream: ReadableStream; fileSize: number } | null> {
  try {
    const file = File.fromURL(fileUrl);
    await file.loadAttributes();

    const fileSize = file.size;

    const downloadOptions: { returnCiphertext: boolean; start?: number; end?: number } = {
      returnCiphertext: false
    };

    if (start !== undefined) {
      downloadOptions.start = start;
    }

    if (end !== undefined) {
      downloadOptions.end = end;
    } else if (start !== undefined) {
      downloadOptions.end = fileSize - 1;
    }

    logger.debug('Mega.nz stream with range', {
      start,
      end: downloadOptions.end,
      fileSize
    });

    const stream = file.download(downloadOptions);

    const readableStream = new ReadableStream({
      start(controller): void {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        stream.on('end', () => {
          controller.close();
        });

        stream.on('error', (error: Error) => {
          controller.error(error);
        });
      },
      cancel(): void {
        stream.destroy();
      }
    });

    return { stream: readableStream, fileSize };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a rate limit error
    if (errorMessage.includes('ETOOMANY') || errorMessage.includes('Too many')) {
      logger.warn('Mega.nz rate limit reached during streaming', { error: errorMessage });
    } else {
      logger.error('Failed to stream Mega.nz video', { error: errorMessage });
    }

    return null;
  }
}
