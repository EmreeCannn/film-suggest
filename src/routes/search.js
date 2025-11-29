import express from "express";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

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

/**
 * Full movie object builder
 */
async function buildMovieObject(movieId) {
  try {
    const detailsRes = await tmdb.get(`/movie/${movieId}`);
    const details = detailsRes.data;

    const creditsRes = await tmdb.get(`/movie/${movieId}/credits`);
    const castRaw = creditsRes.data.cast.slice(0, 8);
    const crewRaw = creditsRes.data.crew || [];

    const cast = castRaw.map(p => ({
      name: p.name,
      character: p.character,
      profile: p.profile_path
        ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
        : null
    }));

    const director = crewRaw.find(p => p.job === "Director")?.name || null;

    const releaseRes = await tmdb.get(`/movie/${movieId}/release_dates`);
    const certification =
      releaseRes.data.results
        ?.find(r => r.iso_3166_1 === "US")
        ?.release_dates?.[0]?.certification || null;

    const videoRes = await tmdb.get(`/movie/${movieId}/videos`);
    const videos = videoRes.data.results || [];

    const tmdbVideo = videos.find(
      v => v.site === "TMDB" && (v.url?.endsWith(".mp4") || false)
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

    const providerRes = await tmdb.get(`/movie/${movieId}/watch/providers`);
    const usProviders = providerRes.data.results?.US || {};

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
      ...mapProviders(usProviders.flatrate, "subscription"),
      ...mapProviders(usProviders.buy, "buy"),
      ...mapProviders(usProviders.rent, "rent"),
      ...mapProviders(usProviders.ads, "ads")
    ];

    const platformLink = usProviders.link || null;

    return {
      id: movieId,
      title: details.title,
      overview: details.overview,
      year: details.release_date?.split("-")[0] || "N/A",
      rating: details.vote_average,
      runtime: details.runtime,
      certification,
      director,
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
 * Search endpoint
 */
router.get("/", async (req, res) => {
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ error: "query lazım knk" });
    }

    // TMDB search
    const searchRes = await tmdb.get("/search/movie", {
      params: {
        query,
        include_adult: false,
        page: 1
      }
    });

    let results = searchRes.data.results || [];

    // 🔥 Filtre: sadece gerçekten kaliteli filmleri al
    results = results.filter(m =>
      m.poster_path &&
      m.backdrop_path &&
      m.overview &&
      m.overview.length > 20 &&
      m.vote_average > 0
    );

    // 🔥 TV içeriklerini, kısa videoları, special içerikleri at
    results = results.filter(m => !m.media_type || m.media_type === "movie");

    // 🔥 En alakalı 15 filmi al
    results = results.slice(0, 15);

    // ✔ Full detailed film list
    const finalResults = [];

    for (const m of results) {
      const full = await buildMovieObject(m.id);
      if (full) finalResults.push(full);
    }

    return res.json({
      query,
      count: finalResults.length,
      movies: finalResults
    });

  } catch (err) {
    console.error("SEARCH ERROR:", err.message);
    return res.status(500).json({ error: "search hata verdi knk" });
  }
});

export default router;

