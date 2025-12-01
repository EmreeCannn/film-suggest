import express from "express";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

/**
 * YouTube embed → watch format
 */
function convertToWatchUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;

  if (!youtubeIdOrUrl.includes("youtube")) {
    return `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;
  }

  const embed = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (embed && embed[1]) {
    return `https://www.youtube.com/watch?v=${embed[1]}`;
  }

  const watch = youtubeIdOrUrl.match(/watch\?v=([^&]+)/);
  if (watch && watch[1]) {
    return `https://www.youtube.com/watch?v=${watch[1]}`;
  }

  return null;
}

/**
 * SEARCH ENDPOINT
 */
router.get("/", async (req, res) => {
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ error: "query lazım knk" });
    }

    // 1) TMDB Search → ilk 20 film
    const searchRes = await tmdb.get("/search/movie", {
      params: {
        query,
        include_adult: false,
        page: 1,
      },
    });

    let baseResults = searchRes.data.results
      .filter(
        (m) =>
          m.poster_path &&
          m.backdrop_path &&
          m.overview &&
          m.overview.length > 20
      )
      .slice(0, 20);

    // 2) Full detayları paralel çek
    const movies = await Promise.all(
      baseResults.map(async (m) => {
        try {
          const fullRes = await tmdb.get(`/movie/${m.id}`, {
            params: {
              append_to_response:
                "credits,videos,release_dates,watch/providers",
            },
          });

          const data = fullRes.data;

          // CAST
          const cast = (data.credits?.cast || []).slice(0, 10).map((p) => ({
            name: p.name,
            character: p.character,
            profile: p.profile_path
              ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
              : null,
          }));

          // DIRECTOR
          const director =
            (data.credits?.crew || []).find((p) => p.job === "Director")
              ?.name || null;

          // CERTIFICATION
          const certification =
            data.release_dates?.results
              ?.find((r) => r.iso_3166_1 === "US")
              ?.release_dates?.[0]?.certification || null;

          // VIDEOS
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
        } catch (err) {
          console.error("Search item error:", err.message);
          return null;
        }
      })
    );

    const finalMovies = movies.filter((x) => x !== null);

    return res.json({
      query,
      count: finalMovies.length,
      movies: finalMovies,
    });
  } catch (err) {
    console.error("SEARCH ERROR:", err.message);
    return res.status(500).json({ error: "search hata verdi knk" });
  }
});

export default router;
