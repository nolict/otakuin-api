import crypto from 'crypto';

export function generateObfuscatedFileName(
  malId: number,
  animeTitle: string,
  resolution: string,
  server: number
): string {
  const titleHash = generateTitleHash(animeTitle);
  const malIdPart = malId.toString().padStart(5, '0');
  const resolutionPart = resolution.replace('p', '');
  const serverPart = server.toString().padStart(2, '0');

  const fileName = `${malIdPart}${titleHash}${resolutionPart}s${serverPart}.mp4`;

  return fileName;
}

function generateTitleHash(title: string): string {
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const hash = crypto
    .createHash('md5')
    .update(cleanTitle)
    .digest('hex')
    .substring(0, 8);

  const obfuscated = shuffleString(hash);

  return obfuscated;
}

function shuffleString(str: string): string {
  const chars = str.split('');
  const shuffled: string[] = [];

  const pattern = [2, 5, 1, 7, 0, 4, 3, 6];

  for (const index of pattern) {
    if (index < chars.length) {
      shuffled.push(chars[index]);
    }
  }

  return shuffled.join('');
}

export function generateReleaseTag(malId: number): string {
  return `anime-${malId}`;
}

export function parseObfuscatedFileName(fileName: string): {
  malId: number;
  resolution: string;
  server: number;
} | null {
  const regex = /^(\d{5})[a-z0-9]{8}(\d{3,4})s(\d{2})\.mp4$/;
  const match = fileName.match(regex);

  if (match === null) {
    return null;
  }

  const malId = parseInt(match[1], 10);
  const resolution = `${match[2]}p`;
  const server = parseInt(match[3], 10);

  return { malId, resolution, server };
}
