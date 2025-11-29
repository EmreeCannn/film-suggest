import express from "express";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

/**
 * YouTube embed → watch
 */
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


/**
 * Full movie builder — JSON formatı korunmuş halde
 */
async function buildMovieObject(movieId) {
  try {
    // 1) DETAILS
    const detailsRes = await tmdb.get(`/movie/${movieId}`);
    const details = detailsRes.data;

    // 2) CAST
    const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
    const castRaw = creditsRes.data.cast.slice(0, 8);
    const cast = castRaw.map(p => ({
      name: p.name,
      character: p.character,
      profile: p.profile_path
        ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
        : null
    }));

    // 3) TRAILER (MP4 → YouTube fallback)
    const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
    const videos = videoRes.data.results || [];

    const tmdbVideo = videos.find(
      v => v.site === "TMDB" && v.url?.endsWith(".mp4")
    );

    let videoUrl = null;
    let videoSource = null;

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

    // ❌ TikTok akışında video YOKSA film kullanılmaz
    if (!videoUrl) return null;

    // 4) WATCH PROVIDERS
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

    // 5) RETURN — JSON formatı aynen korunuyor
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
 * GET /api/all — TikTok-ready global feed
 */
router.get("/", async (req, res) => {
  try {
    let movies = [];

    // 1–10 page → 200 film
    for (let page = 1; page <= 10; page++) {
      const discover = await tmdb.get("/discover/movie", {
        params: {
          sort_by: "popularity.desc",
          page
        }
      });
      movies.push(...discover.data.results);
    }

    // Filtre: Çöp film alma
    movies = movies.filter(m =>
      m.poster_path &&
      m.backdrop_path &&
      m.overview &&
      m.overview.length > 20 &&
      m.vote_average > 0
    );

    // TikTok akışı: Sadece videosu olan filmler
    const finalMovies = [];

    for (const m of movies) {
      const full = await buildMovieObject(m.id);
      if (full) finalMovies.push(full);
      if (finalMovies.length >= 200) break;
    }

    return res.json({
      count: finalMovies.length,
      movies: finalMovies
    });

  } catch (err) {
    console.error("ALL FEED ERROR:", err.message);
    return res.status(500).json({ error: "all hata verdi knk" });
  }
});

export default router;
