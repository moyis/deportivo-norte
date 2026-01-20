import type { APIRoute } from 'astro';
import { fetchLatestVideos } from '../../lib/youtube';

const CACHE_DURATION = 24 * 60 * 60; // 24 hours in seconds

// This endpoint runs server-side and is cached by Vercel for 24 hours
export const prerender = false;

export const GET: APIRoute = async () => {
  const videos = await fetchLatestVideos();

  return new Response(JSON.stringify(videos), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Cache for 24 hours on Vercel's edge network
      'Cache-Control': `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate=${CACHE_DURATION}`,
    },
  });
};
