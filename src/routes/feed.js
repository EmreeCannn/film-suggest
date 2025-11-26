import express from "express";
import {tmdb} from "../services/tmdb.js"; 

const router = express.Router();

/**
 * Embed → Watch URL dönüştürücü
 */
function convertToWatchUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;

  // Sadece ID geldiyse (TMDB genelde böyle)
  if (!youtubeIdOrUrl.includes("youtube")) {
    return `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;
  }

  // Embed formatındaysa
  const match = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (match && match[1]) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }

  // Zaten watch ise
  if (youtubeIdOrUrl.includes("watch?v=")) {
    return youtubeIdOrUrl;
  }

  return null;
}

/**
 * Genre ID'leri — TMDB listesi
 */
const GENRE_MAP = {
  action: 28,
  adventure: 12,
  comedy: 35,
  crime: 80,
  drama: 18,
  fantasy: 14,
  horror: 27,
  romance: 10749,
  scifi: 878,
  thriller: 53,
};

/**
 * GET /api/feed?category=action
 */
router.get("/", async (req, res) => {
  try {
    const category = req.query.category || "action";
    const genreId = GENRE_MAP[category.toLowerCase()] || 28;

    // 1) Popüler filmleri çek
    const discoverRes = await tmdb.get("/discover/movie", {
      params: {
        with_genres: genreId,
        sort_by: "popularity.desc",
        page: 1,
      },
    });

    const movies = discoverRes.data.results.slice(0, 50); // ilk 15 film

    const feed = [];

    for (let movie of movies) {
      const movieId = movie.id;

      // 2) Film detaylarını çek
      const detailsRes = await tmdb.get(`/movie/${movieId}`);
      const details = detailsRes.data;

      // 3) Cast bilgisi
      const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
      const cast = creditsRes.data.cast.slice(0, 5).map((p) => p.name);

      // 4) Trailer çek
      const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
      const trailer = videoRes.data.results.find((v) => v.site === "YouTube");

      let youtubeId = trailer?.key || null;
      let youtubeUrl = youtubeId
        ? convertToWatchUrl(youtubeId)
        : null;

      feed.push({
        id: movieId,
        title: movie.title,
        overview: movie.overview,
        year: movie.release_date?.split("-")[0] || "N/A",
        rating: movie.vote_average,
        poster: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
        backdrop: `https://image.tmdb.org/t/p/w780${movie.backdrop_path}`,
        cast,
        youtubeId,
        youtubeUrl, // ARTIK EMBED DEĞİL → DİREKT WATCH
      });
    }

    return res.json({
      category,
      count: feed.length,
      feed,
    });

  } catch (err) {
    console.error("FEED ERROR:", err.message);
    return res.status(500).json({ error: "Feed hata verdi knk" });
  }
});

export default router;

