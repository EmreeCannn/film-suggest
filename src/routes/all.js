import express from "express";
import NodeCache from "node-cache";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

// ⭐ 5 dakika global cache (RAM)
const allCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 320,
});

// ⭐ In-flight map (aynı anda gelen istekleri tekleştirir)
const inFlightAll = new Map();

/**
 * YouTube Embed → Watch URL
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

router.get("/", async (req, res) => {
  try {
    // 🔥 PAGE PARAM (default: 1)
    const page = parseInt(req.query.page) || 1;

    // Cache key
    const cacheKey = `all_page_${page}`;

    // 1) CACHE
    const cached = allCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // 2) IN-FLIGHT (aynı anda gelen 20 istek → tek TMDB çağrısı)
    if (inFlightAll.has(cacheKey)) {
      const shared = await inFlightAll.get(cacheKey);
      return res.json({ ...shared, cached: true, shared: true });
    }

    // 3) İlk istek → gerçek TMDB'den fetch (heavy job)
    const fetchPromise = (async () => {
      // TMDB discover → tüm filmler
      const discoverRes = await tmdb.get("/discover/movie", {
        params: {
          sort_by: "popularity.desc",
          page,
        },
      });

      // Her sayfa 20 film
      const movies = discoverRes.data.results.slice(0, 20);

      const feed = [];

      for (let movie of movies) {
        const movieId = movie.id;

        // 1) Details
        const detailsRes = await tmdb.get(`/movie/${movieId}`);
        const details = detailsRes.data;

        // 2) Cast & Director
        const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
        const castRaw = creditsRes.data.cast.slice(0, 10);
        const crewRaw = creditsRes.data.crew;

        const cast = castRaw.map((p) => ({
          name: p.name,
          character: p.character,
          profile: p.profile_path
            ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
            : null,
        }));

        const director =
          crewRaw.find((p) => p.job === "Director")?.name || null;

        // 3) Certification
        const releaseRes = await tmdb.get(`/movie/${movieId}/release_dates`);
        const certification =
          releaseRes.data.results
            ?.find((r) => r.iso_3166_1 === "US")
            ?.release_dates?.[0]?.certification || null;

        // 4) Trailer (MP4 / YouTube)
        const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
        const videoList = videoRes.data.results || [];

        const tmdbVideo = videoList.find(
          (v) => v.site === "TMDB" && (v.url?.endsWith(".mp4") || false)
        );

        let videoUrl = null;
        let videoSource = null;

        if (tmdbVideo) {
          videoUrl = tmdbVideo.url;
          videoSource = "tmdb_mp4";
        } else {
          const yt = videoList.find(
            (v) => v.site === "YouTube" && v.type === "Trailer"
          );
          if (yt) {
            videoUrl = convertToWatchUrl(yt.key);
            videoSource = "youtube";
          }
        }

        // 5) Providers (Netflix, Disney+, Prime, Apple TV, Google Play…)
const providerRes = await tmdb.get(`/movie/${movieId}/watch/providers`);
const usProviders = providerRes.data.results?.US || {};

function mapProviders(list, type) {
  if (!list) return [];
  return list.map((p) => ({
    name: p.provider_name,
    type,  // subscription / buy / rent / ads
    logo: p.logo_path
      ? `https://image.tmdb.org/t/p/w500${p.logo_path}`
      : null,
  }));
}

const platforms = [
  ...mapProviders(usProviders.flatrate, "subscription"),
  ...mapProviders(usProviders.buy, "buy"),
  ...mapProviders(usProviders.rent, "rent"),
  ...mapProviders(usProviders.ads, "ads"),
];

const platformLink = usProviders.link || null;

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
          videoSource,
        });
      }

      const responseBody = {
        mode: "all",
        page,
        count: feed.length,
        feed,
      };

      // Cache’e yaz
      allCache.set(cacheKey, responseBody);

      // In-flight’ten kaldır
      inFlightAll.delete(cacheKey);

      return responseBody;
    })();

    // In-flight’e kaydediyoruz
    inFlightAll.set(cacheKey, fetchPromise);

    // Gerçek result
    const fresh = await fetchPromise;

    return res.json({ ...fresh, cached: false });

  } catch (err) {
    console.error("ALL FEED ERROR:", err.message);
    return res.status(500).json({ error: "All feed hata verdi knk" });
  }
});

export default router;
