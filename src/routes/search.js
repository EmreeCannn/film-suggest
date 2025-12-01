import express from "express";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

function convertToWatchUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;
  if (!youtubeIdOrUrl.includes("youtube"))
    return `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;

  const match = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (match) return `https://www.youtube.com/watch?v=${match[1]}`;

  return youtubeIdOrUrl.includes("watch?v=") ? youtubeIdOrUrl : null;
}

router.get("/", async (req, res) => {
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ error: "query lazım knk" });
    }

    // 1️⃣ Basit search → ilk 15 kaliteli film
    const searchRes = await tmdb.get("/search/movie", {
      params: { query, include_adult: false, page: 1 },
    });

    let results = searchRes.data.results
      .filter(
        (m) =>
          m.poster_path &&
          m.backdrop_path &&
          m.overview &&
          m.overview.length > 20
      )
      .slice(0, 15);

    // 2️⃣ Her film için full data → TEK API çağrısı
    const movies = await Promise.all(
      results.map(async (m) => {
        const full = await tmdb.get(`/movie/${m.id}`, {
          params: {
            append_to_response:
              "credits,videos,release_dates,watch/providers",
          },
        });

        const data = full.data;

        const cast = (data.credits?.cast || []).slice(0, 8).map((p) => ({
          name: p.name,
          character: p.character,
          profile: p.profile_path
            ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
            : null,
        }));

        const director =
          (data.credits?.crew || []).find((p) => p.job === "Director")
            ?.name || null;

        const certification =
          data.release_dates?.results
            ?.find((r) => r.iso_3166_1 === "US")
            ?.release_dates?.[0]?.certification || null;

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

    return res.json({
      query,
      count: movies.length,
      movies,
    });
  } catch (err) {
    console.error("SEARCH ERROR:", err.message);
    return res.status(500).json({ error: "search hata verdi knk" });
  }
});

export default router;

