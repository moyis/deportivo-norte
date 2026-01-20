/**
 * YouTube API utilities
 * Fetches latest videos from the club's YouTube channel
 */

// YouTube channel handle
const CHANNEL_HANDLE = 'DeportivoNorte';

export interface Video {
  id: string;
  title: string;
}

/**
 * Fetches the channel ID from the YouTube channel handle
 */
async function getChannelIdFromHandle(handle: string): Promise<string | null> {
  try {
    // Try to fetch the channel page and extract the channel ID
    const channelUrl = `https://www.youtube.com/@${handle}`;
    const response = await fetch(channelUrl);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Look for the channel ID in the HTML
    // It appears in various places, try multiple patterns
    const patterns = [
      /"channelId":"(UC[^"]+)"/,
      /"externalId":"(UC[^"]+)"/,
      /channel\/(UC[^"\/]+)/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        console.log('Found channel ID:', match[1]);
        return match[1];
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching channel ID:', error);
    return null;
  }
}

/**
 * Fetches the latest 3 videos from the YouTube channel
 * Uses YouTube RSS feed (no API key required)
 */
export async function fetchLatestVideos(): Promise<Video[]> {
  try {
    // First, get the channel ID from the handle
    const channelId = await getChannelIdFromHandle(CHANNEL_HANDLE);

    if (!channelId) {
      console.error('Could not resolve channel ID from handle:', CHANNEL_HANDLE);
      return [];
    }

    // Use YouTube RSS feed (no API key required)
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    console.log('Fetching YouTube RSS from:', rssUrl);

    const response = await fetch(rssUrl);

    if (!response.ok) {
      console.error('YouTube RSS fetch failed with status:', response.status);
      throw new Error(`Failed to fetch YouTube RSS feed: ${response.status}`);
    }

    const xmlText = await response.text();
    console.log('YouTube RSS XML length:', xmlText.length);

    // Parse XML to extract video entries
    // Each entry looks like: <entry>...<yt:videoId>ID</yt:videoId>...<title>Title</title>...</entry>
    const entryMatches = xmlText.matchAll(/<entry>(.*?)<\/entry>/gs);
    const entries = Array.from(entryMatches);

    console.log('Found entries:', entries.length);

    const videos: Video[] = [];

    for (const entry of entries.slice(0, 3)) {
      const entryContent = entry[1];

      const videoIdMatch = entryContent.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const titleMatch = entryContent.match(/<title>(.*?)<\/title>/);

      if (videoIdMatch && titleMatch) {
        videos.push({
          id: videoIdMatch[1],
          title: titleMatch[1]
        });
      }
    }

    console.log('Extracted videos:', videos.length);
    return videos;
  } catch (error) {
    console.error('Error fetching YouTube videos:', error);
    return [];
  }
}
