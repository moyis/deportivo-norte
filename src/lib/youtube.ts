/**
 * YouTube API utilities
 * Fetches latest videos from the club's YouTube channel
 */

// YouTube channel ID for @DeportivoNorte
const CHANNEL_ID = 'UCSutPa2h-pV-tEq8vblrk6A';

export interface Video {
  id: string;
  title: string;
  publishedAt: string;
}

/**
 * Fetches the latest 3 videos from the YouTube channel
 * Uses YouTube RSS feed (no API key required)
 */
export async function fetchLatestVideos(): Promise<Video[]> {
  try {
    // Use YouTube RSS feed (no API key required)
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

    // Aborta si el feed tarda más de 5s para no demorar el render diferido
    const response = await fetch(rssUrl, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      console.error('YouTube RSS fetch failed with status:', response.status);
      throw new Error(`Failed to fetch YouTube RSS feed: ${response.status}`);
    }

    const xmlText = await response.text();

    // Parse XML to extract video entries
    // Each entry looks like: <entry>...<yt:videoId>ID</yt:videoId>...<title>Title</title>...</entry>
    const entryMatches = xmlText.matchAll(/<entry>(.*?)<\/entry>/gs);
    const entries = Array.from(entryMatches);

    const videos: Video[] = [];

    for (const entry of entries.slice(0, 3)) {
      const entryContent = entry[1];

      const videoIdMatch = entryContent.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const titleMatch = entryContent.match(/<title>(.*?)<\/title>/);
      const publishedMatch = entryContent.match(/<published>(.*?)<\/published>/);

      if (videoIdMatch && titleMatch) {
        videos.push({
          id: videoIdMatch[1],
          title: titleMatch[1],
          publishedAt: publishedMatch ? publishedMatch[1] : new Date().toISOString()
        });
      }
    }

    return videos;
  } catch (error) {
    console.error('Error fetching YouTube videos:', error);
    return [];
  }
}
