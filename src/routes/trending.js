import express from "express";
import NodeCache from "node-cache";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

const trendingCache = new NodeCache({
  stdTTL: 300, // 5 dakika
  checkperiod: 320,
});

// YouTube embed → watch
function convertToWatchUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;
  if (!youtubeIdOrUrl.includes("youtube"))
    return `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;
  const match = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (match && match[1])
    return `https://www.youtube.com/watch?v=${match[1]}`;
  return youtubeIdOrUrl.includes("watch?v=") ? youtubeIdOrUrl : null;
}

router.get("/", async (req, res) => {
  try {
    const cacheKey = "trending_movies";
    const cached = trendingCache.get(cacheKey);

    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // 1) Trending filmleri al (30 tane)
    const trendingRes = await tmdb.get("/trending/movie/day");
    const movies = trendingRes.data.results.slice(0, 30);

    // 2) Her film için 5 API isteğini paralel yap
    const feed = await Promise.all(
      movies.map(async (movie) => {
        const movieId = movie.id;

        const [
          detailsRes,
          creditsRes,
          releaseRes,
          videoRes,
          providerRes,
        ] = await Promise.all([
          tmdb.get(`/movie/${movieId}`),
          tmdb.get(`/movie/${movieId}/credits`),
          tmdb.get(`/movie/${movieId}/release_dates`),
          tmdb.get(`/movie/${movieId}/videos`),
          tmdb.get(`/movie/${movieId}/watch/providers`),
        ]);

        const details = detailsRes.data;

        // Cast
        const cast = creditsRes.data.cast.slice(0, 10).map((p) => ({
          name: p.name,
          character: p.character,
          profile: p.profile_path
            ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
            : null,
        }));

        // Director
        const director =
          creditsRes.data.crew.find((p) => p.job === "Director")?.name || null;

        // Certification
        const certification =
          releaseRes.data.results
            ?.find((r) => r.iso_3166_1 === "US")
            ?.release_dates?.[0]?.certification || null;

        // Videos
        const videos = videoRes.data.results || [];
        const tmdbVideo = videos.find(
          (v) => v.site === "TMDB" && v.url?.endsWith(".mp4")
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

        // Providers
        const us = providerRes.data.results?.US || {};

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
          title: details.title,
          overview: details.overview,
          year: details.release_date?.split("-")[0] || "N/A",
          rating: details.vote_average,
          runtime: details.runtime,
          certification,
          director,
          genres: details.genres?.map((g) => g.name) || [],
          cast,
          poster: details.poster_path
            ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
            : null,
          backdrop: details.backdrop_path
            ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
            : null,
          platforms,
          platformLink: us.link || null,
          videoUrl,
          videoSource,
        };
      })
    );

    const payload = {
      mode: "trending",
      count: feed.length,
      feed,
    };

    trendingCache.set(cacheKey, payload);

    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error("TRENDING ERROR:", err.message);
    res.status(500).json({ error: "Trending hata verdi knk" });
  }
});

export default router;
