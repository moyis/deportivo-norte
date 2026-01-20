/**
 * YouTube API utilities
 * Fetches latest videos from the club's YouTube channel
 */

const CHANNEL_ID = 'UCkQX1tChV7lrewriPhf58rw'; // @DeportivoNorte channel ID

export interface Video {
  id: string;
  title: string;
}

/**
 * Fetches the latest 3 videos from the YouTube channel
 * Uses YouTube RSS feed (no API key required)
 */
export async function fetchLatestVideos(): Promise<Video[]> {
  try {
    // Use YouTube RSS feed (no API key required)
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
    const response = await fetch(rssUrl);

    if (!response.ok) {
      throw new Error('Failed to fetch YouTube RSS feed');
    }

    const xmlText = await response.text();

    // Parse XML to extract video data
    const videoIdMatches = xmlText.matchAll(/<yt:videoId>(.*?)<\/yt:videoId>/g);
    const titleMatches = xmlText.matchAll(/<title>(.*?)<\/title>/g);

    const videoIds = Array.from(videoIdMatches).map(match => match[1]).slice(0, 3);
    const titles = Array.from(titleMatches).map(match => match[1]).slice(1, 4); // Skip first title (channel name)

    return videoIds.map((id, index) => ({
      id,
      title: titles[index] || 'Video del Club Deportivo Norte'
    }));
  } catch (error) {
    console.error('Error fetching YouTube videos:', error);
    return [];
  }
}
