import express from "express";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

function convertToWatchUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;

  if (!youtubeIdOrUrl.includes("youtube")) {
    return `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;
  }

  const match = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (match && match[1]) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }

  if (youtubeIdOrUrl.includes("watch?v=")) {
    return youtubeIdOrUrl;
  }

  return null;
}

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

router.get("/", async (req, res) => {
  try {
    const category = req.query.category || "action";
    const genreId = GENRE_MAP[category.toLowerCase()] || 28;

    const discoverRes = await tmdb.get("/discover/movie", {
      params: {
        with_genres: genreId,
        sort_by: "popularity.desc",
        page: 1,
      },
    });

    const movies = discoverRes.data.results.slice(0, 30);
    const feed = [];

    for (let movie of movies) {
      const movieId = movie.id;

      // 1 — TMDB detayları
      const detailsRes = await tmdb.get(`/movie/${movieId}`);
      const details = detailsRes.data;

      // 2 — Oyuncular + Crew
      const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
      const castRaw = creditsRes.data.cast.slice(0, 10);
      const crewRaw = creditsRes.data.crew;

      const cast = castRaw.map((c) => ({
        name: c.name,
        character: c.character,
        profile: c.profile_path
          ? `https://image.tmdb.org/t/p/w500${c.profile_path}`
          : null,
      }));

      const director = crewRaw.find((c) => c.job === "Director")?.name || null;

      // 3 — Klasik YouTube trailer
      const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
      const trailer = videoRes.data.results.find(
        (v) => v.site === "YouTube" && v.type === "Trailer"
      );

      const youtubeId = trailer?.key || null;
      const youtubeUrl = youtubeId ? convertToWatchUrl(youtubeId) : null;

      // 4 — Sertifika (PG-13 vs)
      const releaseRes = await tmdb.get(`/movie/${movieId}/release_dates`);
      const certInfo =
        releaseRes.data.results
          ?.find((r) => r.iso_3166_1 === "US")
          ?.release_dates?.[0]?.certification || null;

      feed.push({
        id: movieId,
        title: details.title,
        overview: details.overview,
        releaseYear: details.release_date?.split("-")[0],
        runtime: details.runtime,
        rating: details.vote_average,
        certification: certInfo, // PG-13 vs

        genres: details.genres?.map((g) => g.name) || [],
        director,
        cast,

        poster: details.poster_path
          ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
          : null,
        backdrop: details.backdrop_path
          ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
          : null,

        productionCompanies: details.production_companies?.map((p) => ({
          name: p.name,
          logo: p.logo_path
            ? `https://image.tmdb.org/t/p/w500${p.logo_path}`
            : null,
        })),

        youtubeId,
        youtubeUrl,
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
