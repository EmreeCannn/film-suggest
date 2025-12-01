import express from "express";
import NodeCache from "node-cache";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

const feedCache = new NodeCache({
  stdTTL: 300, // 5 dakika cache
  checkperiod: 320,
});

function convertToWatchUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;

  if (!youtubeIdOrUrl.includes("youtube"))
    return `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;

  const match = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (match) return `https://www.youtube.com/watch?v=${match[1]}`;

  return youtubeIdOrUrl.includes("watch?v=") ? youtubeIdOrUrl : null;
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
    const category = (req.query.category || "action").toLowerCase();
    const genreId = GENRE_MAP[category] || 28;

    const cacheKey = `feed_${category}`;
    const cachedData = feedCache.get(cacheKey);

    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }

    // 1️⃣ En popüler 30 filmi al
    const discover = await tmdb.get("/discover/movie", {
      params: {
        with_genres: genreId,
        sort_by: "popularity.desc",
        page: 1,
      },
    });

    const movies = discover.data.results.slice(0, 30);

    // 2️⃣ Tüm heavy data TEK API çağrısı ile alınır (append_to_response)
    const feed = await Promise.all(
      movies.map(async (movie) => {
        const movieId = movie.id;

        const fullRes = await tmdb.get(`/movie/${movieId}`, {
          params: {
            append_to_response:
              "credits,videos,release_dates,watch/providers",
          },
        });

        const data = fullRes.data;

        // Cast
        const cast = (data.credits?.cast || []).slice(0, 10).map((p) => ({
          name: p.name,
          character: p.character,
          profile: p.profile_path
            ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
            : null,
        }));

        // Director
        const director =
          (data.credits?.crew || []).find((p) => p.job === "Director")
            ?.name || null;

        // Certification
        const certification =
          data.release_dates?.results
            ?.find((r) => r.iso_3166_1 === "US")
            ?.release_dates?.[0]?.certification || null;

        // Videos
        const videos = data.videos?.results || [];

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

        // Providers
        const us = data["watch/providers"]?.results?.US || {};

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
          id: data.id,
          title: data.title,
          overview: data.overview,
          year: data.release_date?.split("-")[0] || "N/A",
          rating: data.vote_average,
          runtime: data.runtime,

          certification,
          director,
          genres: data.genres?.map((g) => g.name) || [],

          cast,

          poster: data.poster_path
            ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
            : null,
          backdrop: data.backdrop_path
            ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}`
            : null,

          platforms,
          platformLink: us.link || null,

          videoUrl,
          videoSource,
        };
      })
    );

    const result = {
      category,
      count: feed.length,
      feed,
    };

    feedCache.set(cacheKey, result);

    return res.json({ ...result, cached: false });
  } catch (err) {
    console.error("FEED ERROR:", err.message);
    return res.status(500).json({ error: "Feed hata verdi knk" });
  }
});

export default router;
