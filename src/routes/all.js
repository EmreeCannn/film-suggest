import express from "express";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

/** YouTube embed → watch */
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

/** FULL movie builder (JSON formatı BOZULMADAN) */
async function buildMovieObject(movieId) {
  try {
    // DETAILS
    const detailsRes = await tmdb.get(`/movie/${movieId}`);
    const details = detailsRes.data;

    // CAST
    const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
    const castRaw = creditsRes.data.cast.slice(0, 8);
    const cast = castRaw.map(p => ({
      name: p.name,
      character: p.character,
      profile: p.profile_path
        ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
        : null
    }));

    // TRAILER → MP4 > YouTube fallback
    const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
    const videos = videoRes.data.results || [];

    let videoUrl = null;
    let videoSource = null;

    const tmdbVideo = videos.find(
      v => v.site === "TMDB" && v.url?.endsWith(".mp4")
    );

    if (tmdbVideo) {
      videoUrl = tmdbVideo.url;
      videoSource = "tmdb_mp4";
    } else {
      const yt = videos.find(
        v => v.site === "YouTube" && v.type === "Trailer"
      );
      if (yt) {
        videoUrl = convertToWatchUrl(yt.key);
        videoSource = "youtube";
      }
    }

    // ❌ Video yoksa TikTok feed'e alınmaz
    if (!videoUrl) return null;

    // WATCH PROVIDERS
    const providerRes = await tmdb.get(`/movie/${movieId}/watch/providers`);
    const us = providerRes.data.results?.US || {};

    function mapProviders(list, type) {
      if (!list) return [];
      return list.map(p => ({
        name: p.provider_name,
        type,
        logo: p.logo_path
          ? `https://image.tmdb.org/t/p/w500${p.logo_path}`
          : null
      }));
    }

    const platforms = [
      ...mapProviders(us.flatrate, "subscription"),
      ...mapProviders(us.buy, "buy"),
      ...mapProviders(us.rent, "rent"),
      ...mapProviders(us.ads, "ads")
    ];

    const platformLink = us.link || null;

    // RETURN (JSON formatı aynen korunuyor)
    return {
      id: details.id,
      title: details.title,
      overview: details.overview,
      year: details.release_date?.split("-")[0] || "N/A",
      rating: details.vote_average,
      runtime: details.runtime,
      genres: details.genres?.map(g => g.name) || [],
      poster: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : null,
      backdrop: details.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
        : null,
      cast,
      platforms,
      platformLink,
      videoUrl,
      videoSource
    };

  } catch (err) {
    console.error("buildMovieObject error:", err.message);
    return null;
  }
}


/**
 * GET /api/all?page=X
 * TikTok Infinite Scroll version
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

    // Çöp filmleri ele
    movies = movies.filter(m =>
      m.poster_path &&
      m.backdrop_path &&
      m.overview &&
      m.overview.length > 20 &&
      m.vote_average > 0
    );

    // Video garantili filmler
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
