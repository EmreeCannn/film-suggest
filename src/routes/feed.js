import express from "express";
import NodeCache from "node-cache";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

// Basit in-memory cache
const feedCache = new NodeCache({
  stdTTL: 120,        // 2 dk cache
  checkperiod: 150,
});

// Aynı anda gelen istekler için in-flight promise map'i
const inFlightFeeds = new Map();

// YouTube Embed → Watch URL
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

// Asıl ağır işi yapan fonksiyon: TMDB'den feed üret
async function buildFeed(category, genreId) {
  // 1) Popüler filmler
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

    // 2) Detaylar
    const detailsRes = await tmdb.get(`/movie/${movieId}`);
    const details = detailsRes.data;

    // 3) Cast & Crew
    const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
    const castRaw = creditsRes.data.cast.slice(0, 10);
    const crewRaw = creditsRes.data.crew;

    // Fotoğraflı cast
    const cast = castRaw.map((p) => ({
      name: p.name,
      character: p.character,
      profile: p.profile_path
        ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
        : null,
    }));

    // Yönetmen
    const director = crewRaw.find((p) => p.job === "Director")?.name || null;

    // 4) Sertifika (PG-13 vs)
    const releaseRes = await tmdb.get(`/movie/${movieId}/release_dates`);
    const certification =
      releaseRes.data.results
        ?.find((r) => r.iso_3166_1 === "US")
        ?.release_dates?.[0]?.certification || null;

    // 5) Fragman
    const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
    const videoList = videoRes.data.results || [];

    // 5.1 — TMDB MP4 fragman (varsa önce bunu kullan)
    const tmdbMp4 = videoList.find(
      (v) =>
        v.site === "TMDB" &&
        v.type === "Trailer" &&
        v.url &&
        v.url.endsWith(".mp4")
    );

    // 5.2 — YouTube fallback
    const youtubeTrailer = videoList.find(
      (v) => v.site === "YouTube" && v.type === "Trailer"
    );

    let videoUrl = null;
    let videoSource = null;

    if (tmdbMp4) {
      videoUrl = tmdbMp4.url; // MP4 format
      videoSource = "tmdb_mp4";
    } else if (youtubeTrailer) {
      const youtubeId = youtubeTrailer.key;
      videoUrl = convertToWatchUrl(youtubeId);
      videoSource = "youtube";
    }

    feed.push({
      id: movieId,
      title: details.title,
      overview: details.overview,
      year: details.release_date?.split("-")[0] || "N/A",
      rating: details.vote_average,
      runtime: details.runtime,
      certification,
      director,
      genres: details.genres?.map((g) => g.name) || [],

      productionCompanies:
        details.production_companies?.map((p) => ({
          name: p.name,
          logo: p.logo_path
            ? `https://image.tmdb.org/t/p/w500${p.logo_path}`
            : null,
        })) || [],

      poster: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : null,

      backdrop: details.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
        : null,

      cast,
      videoUrl,     // TMDB MP4 veya YouTube
      videoSource,  // "tmdb_mp4" | "youtube"
    });
  }

  return feed;
}

router.get("/", async (req, res) => {
  try {
    const category = (req.query.category || "action").toLowerCase();
    const genreId = GENRE_MAP[category] || 28;

    const cacheKey = `feed_${category}`;

    // 1) CACHE VARSA DIREKT DÖN
    const cachedFeed = feedCache.get(cacheKey);
    if (cachedFeed) {
      return res.json({
        category,
        count: cachedFeed.length,
        feed: cachedFeed,
        cached: true,
      });
    }

    // 2) HALIHAZIRDA BU CATEGORY İÇİN TMDB ÇAĞRISI ÇALIŞIYORSA, O PROMISE'I BEKLE
    if (inFlightFeeds.has(cacheKey)) {
      const sharedFeed = await inFlightFeeds.get(cacheKey);
      return res.json({
        category,
        count: sharedFeed.length,
        feed: sharedFeed,
        cached: true,
        shared: true, // başka istekle paylaşıldı
      });
    }

    // 3) İLK İSTEĞİ YAPAN BİZİZ → TMDB'YE GİDİP FEED ÜRET
    const fetchPromise = (async () => {
      const builtFeed = await buildFeed(category, genreId);
      feedCache.set(cacheKey, builtFeed); // cache'e al
      inFlightFeeds.delete(cacheKey);     // in-flight'tan çıkar
      return builtFeed;
    })();

    inFlightFeeds.set(cacheKey, fetchPromise);

    const feed = await fetchPromise;

    return res.json({
      category,
      count: feed.length,
      feed,
      cached: false,
    });
  } catch (err) {
    console.error("FEED ERROR:", err.message);
    return res.status(500).json({ error: "Feed hata verdi knk" });
  }
});

export default router;
