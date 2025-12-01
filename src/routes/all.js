import express from "express";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

/**
 * YouTube embed URL üretici — sadece playsinline=1
 */
function convertToEmbedUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;

  // Eğer sadece ID geldiyse:
  if (!youtubeIdOrUrl.includes("youtube")) {
    return `https://www.youtube.com/embed/${youtubeIdOrUrl}?playsinline=1`;
  }

  // Embed URL geldiyse:
  const embedMatch = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (embedMatch && embedMatch[1]) {
    return `https://www.youtube.com/embed/${embedMatch[1]}?playsinline=1`;
  }

  // Watch URL geldiyse:
  const watchMatch = youtubeIdOrUrl.match(/watch\?v=([^&]+)/);
  if (watchMatch && watchMatch[1]) {
    return `https://www.youtube.com/embed/${watchMatch[1]}?playsinline=1`;
  }

  return null;
}

/**
 * Tek film objesi hazırlama (poster/backdrop + trailer)
 */
async function buildMovieObject(movieId) {
  try {
    // TMDB detay
    const details = await tmdb.get(`/movie/${movieId}`);

    // Video
    const videos = await tmdb.get(`/movie/${movieId}/videos`);

    const yt = videos.data.results.find(
      (v) => v.site === "YouTube" && v.type === "Trailer"
    );

    const videoUrl = yt ? convertToEmbedUrl(yt.key) : null;

    // Eğer video yoksa TikTok feed'e ekleme
    if (!videoUrl) return null;

    return {
      id: details.data.id,
      title: details.data.title,
      overview: details.data.overview,
      year: details.data.release_date?.split("-")[0] || null,

      poster: details.data.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.data.poster_path}`
        : null,

      backdrop: details.data.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${details.data.backdrop_path}`
        : null,

      videoUrl,
      videoSource: "youtube"
    };
  } catch (err) {
    console.error("buildMovieObject error:", err.message);
    return null;
  }
}

/**
 * GET /api/all?page=X
 * TikTok Infinite Scroll
 */
router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;

    // Her page = 5 TMDB sayfası (5 × 20 = ~100 film)
    const start = (page - 1) * 5 + 1;
    const end = start + 4;

    let movies = [];

    for (let p = start; p <= end; p++) {
      const discover = await tmdb.get("/discover/movie", {
        params: {
          sort_by: "popularity.desc",
          page: p
        }
      });

      movies.push(...discover.data.results);
    }

    // Temizlik
    movies = movies.filter(
      (m) =>
        m.poster_path &&
        m.backdrop_path &&
        m.overview &&
        m.overview.length > 20 &&
        m.vote_average > 0
    );

    // Trailer garantili doldur
    const finalMovies = [];

    for (const m of movies) {
      const full = await buildMovieObject(m.id);
      if (full) finalMovies.push(full);
      if (finalMovies.length >= 100) break;
    }

    return res.json({
      page,
      count: finalMovies.length,
      movies: finalMovies
    });
  } catch (err) {
    console.error("ALL FEED ERROR:", err.message);
    return res.status(500).json({ error: "all hata verdi knk" });
  }
});

export default router;
