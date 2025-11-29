import express from "express";
import NodeCache from "node-cache";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

// Cache (aramalar sık tekrar edilir)
const searchCache = new NodeCache({
  stdTTL: 300,  // 5 dakika
  checkperiod: 320
});

// In-flight tekilleştirme
const inFlightSearch = new Map();

/** YouTube embed → watch URL converter */
function convertToWatchUrl(id) {
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

router.get("/", async (req, res) => {
  try {
    const query = req.query.query;

    if (!query) {
      return res.status(400).json({ error: "query param gerekli knk" });
    }

    const cacheKey = `search_${query.toLowerCase()}`;

    // Cache varsa direkt dön
    const cached = searchCache.get(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    // In-flight kontrol
    if (inFlightSearch.has(cacheKey)) {
      const shared = await inFlightSearch.get(cacheKey);
      return res.json({ ...shared, shared: true, cached: true });
    }

    const fetchPromise = (async () => {
      // 1) TMDB arama
      const searchRes = await tmdb.get("/search/movie", {
        params: {
          query,
          include_adult: false,
          page: 1
        }
      });

      const results = searchRes.data.results.slice(0, 20); // 20 sonuç yeter

      const feed = [];

      for (const movie of results) {
        const movieId = movie.id;

        // 2) Details
        const detailsRes = await tmdb.get(`/movie/${movieId}`);
        const details = detailsRes.data;

        // 3) Cast + Director
        const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
        const castRaw = creditsRes.data.cast.slice(0, 8);
        const crew = creditsRes.data.crew;

        const cast = castRaw.map((c) => ({
          name: c.name,
          character: c.character,
          profile: c.profile_path
            ? `https://image.tmdb.org/t/p/w500${c.profile_path}`
            : null,
        }));

        const director =
          crew.find((c) => c.job === "Director")?.name || null;

        // 4) Certification
        const releaseRes = await tmdb.get(`/movie/${movieId}/release_dates`);
        const certification =
          releaseRes.data.results?.find((r) => r.iso_3166_1 === "US")
            ?.release_dates?.[0]?.certification || null;

        // 5) Trailer
        const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
        const videos = videoRes.data.results;

        const tmdbMp4 = videos.find(
          (v) => v.site === "TMDB" && v.url?.endsWith(".mp4")
        );

        let videoUrl = null;
        let videoSource = null;

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

        // 6) Platforms
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

      const result = {
        query,
        count: feed.length,
        results: feed,
      };

      searchCache.set(cacheKey, result);
      inFlightSearch.delete(cacheKey);

      return result;
    })();

    inFlightSearch.set(cacheKey, fetchPromise);

    const fresh = await fetchPromise;

    return res.json({ ...fresh, cached: false });

  } catch (err) {
    console.error("SEARCH ERROR:", err.message);
    return res.status(500).json({ error: "search hata verdi knk" });
  }
});

export default router;
