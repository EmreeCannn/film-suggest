import express from "express";
import NodeCache from "node-cache";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

// Cache (5 dakika)
const trendingCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 320,
});

// In-flight (aynı anda 100 istek → tek sorgu)
const inFlightTrending = new Map();

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
    const cacheKey = "trending_movies";

    // 1) Cache kontrol
    const cached = trendingCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // 2) In-flight (aynı anda 20 istek → tek sorgu)
    if (inFlightTrending.has(cacheKey)) {
      const shared = await inFlightTrending.get(cacheKey);
      return res.json({ ...shared, shared: true, cached: true });
    }

    // 3) İlk gerçek fetch işlemi
    const fetchPromise = (async () => {
      // TMDB trending
      const trendingRes = await tmdb.get("/trending/movie/day");

      // İlk 30 trend film
      const movies = trendingRes.data.results.slice(0, 30);

      const feed = [];

      for (const movie of movies) {
        const movieId = movie.id;

        // 1) Details
        const detailsRes = await tmdb.get(`/movie/${movieId}`);
        const details = detailsRes.data;

        // 2) Cast + Director
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

        // 4) Trailer (TMDB MP4 + YouTube fallback)
        const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
        const videos = videoRes.data.results || [];

        const tmdbVideo = videos.find(
          (v) => v.site === "TMDB" && (v.url?.endsWith(".mp4") || false)
        );

        let videoUrl = null;
        let videoSource = null;

        if (tmdbVideo) {
          videoUrl = tmdbVideo.url;
          videoSource = "tmdb_mp4";
        } else {
          const yt = videos.find(
            (v) => v.site === "YouTube" && v.type === "Trailer"
          );
          if (yt) {
            videoUrl = convertToWatchUrl(yt.key);
            videoSource = "youtube";
          }
        }

        // 5) Watch Providers (subscription, rent, buy, ads)
        const providerRes = await tmdb.get(
          `/movie/${movieId}/watch/providers`
        );

        const usProviders = providerRes.data.results?.US || {};

        function mapProviders(list, type) {
          if (!list) return [];
          return list.map((p) => ({
            name: p.provider_name,
            type,
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

        // Final output
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
        mode: "trending",
        count: feed.length,
        feed,
      };

      // Cache'e yaz
      trendingCache.set(cacheKey, responseBody);

      // In-flight'ten sil
      inFlightTrending.delete(cacheKey);

      return responseBody;
    })();

    inFlightTrending.set(cacheKey, fetchPromise);

    const fresh = await fetchPromise;

    res.json({ ...fresh, cached: false });
  } catch (err) {
    console.error("TRENDING ERROR:", err.message);
    res.status(500).json({ error: "Trending hata verdi knk" });
  }
});

export default router;
