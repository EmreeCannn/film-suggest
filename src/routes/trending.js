import express from "express";
import NodeCache from "node-cache";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

const trendingCache = new NodeCache({
  stdTTL: 300, // 5 dakika
  checkperiod: 320,
});

/**
 * YouTube embed → watch dönüştürücü
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

  const watchMatch = youtubeIdOrUrl.match(/watch\?v=([^&]+)/);
  if (watchMatch && watchMatch[1]) {
    return `https://www.youtube.com/watch?v=${watchMatch[1]}`;
  }

  return null;
}

router.get("/", async (req, res) => {
  try {
    const cacheKey = "trending_movies";
    const cached = trendingCache.get(cacheKey);

    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // 1) Trending 30 film getir
    const trendingRes = await tmdb.get("/trending/movie/day");
    const movies = trendingRes.data.results.slice(0, 30);

    // 2) Paralel full detay çekme
    const feed = await Promise.all(
      movies.map(async (movie) => {
        const movieId = movie.id;

        const [
          detailsRes,
          creditsRes,
          releaseRes,
          videosRes,
          providersRes,
        ] = await Promise.all([
          tmdb.get(`/movie/${movieId}`),
          tmdb.get(`/movie/${movieId}/credits`),
          tmdb.get(`/movie/${movieId}/release_dates`),
          tmdb.get(`/movie/${movieId}/videos`),
          tmdb.get(`/movie/${movieId}/watch/providers`),
        ]);

        const d = detailsRes.data;

        // 🎭 CAST
        const cast = creditsRes.data.cast.slice(0, 10).map((p) => ({
          name: p.name,
          character: p.character,
          profile: p.profile_path
            ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
            : null,
        }));

        // 🎬 DIRECTOR
        const director =
          creditsRes.data.crew.find((p) => p.job === "Director")?.name || null;

        // 🔞 CERTIFICATION
        const certification =
          releaseRes.data.results
            ?.find((r) => r.iso_3166_1 === "US")
            ?.release_dates?.[0]?.certification || null;

        // 🎞 VIDEO
        const videos = videosRes.data.results || [];
        let videoUrl = null;
        let videoSource = null;

        const tmdbMp4 = videos.find(
          (v) => v.site === "TMDB" && v.url?.endsWith(".mp4")
        );

        if (tmdbMp4) {
          videoUrl = tmdbMp4.url;
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

        // Trailer yoksa film ekleme
        if (!videoUrl) return null;

        // 📡 PROVIDERS
        const us = providersRes.data.results?.US || {};

        const mapProviders = (list, type) =>
          !list
            ? []
            : list.map((p) => ({
                name: p.provider_name,
                type,
                logo: p.logo_path
                  ? `https://image.tmdb.org/t/p/w500${p.logo_path}`
                  : null,
              }));

        const platforms = [
          ...mapProviders(us.flatrate, "subscription"),
          ...mapProviders(us.buy, "buy"),
          ...mapProviders(us.rent, "rent"),
          ...mapProviders(us.ads, "ads"),
        ];

        return {
          id: movieId,
          title: d.title,
          overview: d.overview,
          year: d.release_date?.split("-")[0] || "N/A",
          rating: d.vote_average,
          runtime: d.runtime,
          certification,
          director,
          genres: d.genres?.map((g) => g.name) || [],
          cast,
          poster: d.poster_path
            ? `https://image.tmdb.org/t/p/w500${d.poster_path}`
            : null,
          backdrop: d.backdrop_path
            ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}`
            : null,
          platforms,
          platformLink: us.link || null,
          videoUrl,
          videoSource,
        };
      })
    );

    // null dönenleri temizle (video olmayanlar)
    const finalFeed = feed.filter((f) => f !== null);

    const payload = {
      mode: "trending",
      count: finalFeed.length,
      feed: finalFeed,
    };

    trendingCache.set(cacheKey, payload);

    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error("TRENDING ERROR:", err.message);
    return res.status(500).json({ error: "Trending hata verdi knk" });
  }
});

export default router;
