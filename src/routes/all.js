import express from "express";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

/* ---------------------------------------------
   YOUTUBE → WATCH FORMAT
--------------------------------------------- */
function convertToWatchUrl(idOrUrl) {
  if (!idOrUrl) return null;

  if (!idOrUrl.includes("youtube"))
    return `https://www.youtube.com/watch?v=${idOrUrl}`;

  const idFromEmbed = idOrUrl.match(/embed\/([^?]+)/);
  if (idFromEmbed) return `https://www.youtube.com/watch?v=${idFromEmbed[1]}`;

  const idFromWatch = idOrUrl.match(/watch\\?v=([^&]+)/);
  if (idFromWatch) return `https://www.youtube.com/watch?v=${idFromWatch[1]}`;

  return null;
}

/* ---------------------------------------------
    TEK FİLM OBJECT (FORMAT BOZULMADAN)
--------------------------------------------- */
function buildMovieObject(data, videos, providers) {
  const cast = (data.credits?.cast || [])
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      character: p.character,
      profile: p.profile_path
        ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
        : null,
    }));

  const director =
    (data.credits?.crew || []).find((p) => p.job === "Director")?.name || null;

  const certification =
    data.release_dates?.results
      ?.find((r) => r.iso_3166_1 === "US")
      ?.release_dates?.[0]?.certification || null;

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

  if (!videoUrl) return null;

  const us = providers?.results?.US || {};

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
}

/* ---------------------------------------------
    /api/all?page=X  (TIKTOK RANDOM FEED)
--------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;

    // RANDOM SEED → TikTok tarzı farklı feed için kritik
    const seed = Math.floor(Math.random() * 999999);

    // 1 client page = 10 tmdb page (200 film)
    const startTmdbPage = (page - 1) * 10 + 1;
    const endTmdbPage = startTmdbPage + 9;

    // Discover fetch
    const discoverPromises = [];
    for (let i = startTmdbPage; i <= endTmdbPage; i++) {
      discoverPromises.push(
        tmdb.get("/discover/movie", {
          params: {
            sort_by: "popularity.desc",
            page: i,
            include_adult: false,
            vote_count_gte: 200,
            "with_watch_monetization_types": "flatrate|rent|buy",

            // RANDOM FEED SEED TRICK
            without_keywords: seed,

            primary_release_date_gte: "1990-01-01",
            with_original_language: "en",
          },
        })
      );
    }

    const discoverResponses = await Promise.all(discoverPromises);
    let movies = discoverResponses.flatMap((r) => r.data.results);

    // Basic filter
    movies = movies.filter(
      (m) =>
        m.poster_path &&
        m.backdrop_path &&
        m.overview?.length > 20 &&
        m.vote_average > 0
    );

    // Random shuffle → TikTok feed hissi
    movies = movies.sort(() => Math.random() - 0.5);

    // Full detail fetch (20'şer paket)
    const results = [];
    const BATCH_SIZE = 20;

    for (let i = 0; i < movies.length; i += BATCH_SIZE) {
      const batch = movies.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map((m) =>
        tmdb
          .get(`/movie/${m.id}`, {
            params: {
              append_to_response: "credits,videos,release_dates,watch/providers",
            },
          })
          .then((full) =>
            buildMovieObject(
              full.data,
              full.data.videos?.results || [],
              full.data["watch/providers"]
            )
          )
          .catch(() => null)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((m) => m !== null));
    }

    return res.json({
      page,
      seed,
      count: results.length,
      movies: results,
    });
  } catch (err) {
    console.error("ALL FEED ERROR:", err.message);
    return res.status(500).json({ error: "all hata verdi knk" });
  }
});

export default router;
