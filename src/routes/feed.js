import express from "express";
import NodeCache from "node-cache";
import { tmdb } from "../services/tmdb.js";

const router = express.Router();

const feedCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 320,
});

// Embed → Watch dönüştüren fonksiyon
function convertToWatchUrl(youtubeIdOrUrl) {
  if (!youtubeIdOrUrl) return null;

  // Eğer sadece ID ise
  if (!youtubeIdOrUrl.includes("youtube")) {
    return `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;
  }

  // Eğer embed URL ise
  const match = youtubeIdOrUrl.match(/embed\/([^?]+)/);
  if (match) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }

  // Zaten watch ise
  if (youtubeIdOrUrl.includes("watch?v=")) {
    return youtubeIdOrUrl;
  }

  return null;
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

    const cached = feedCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // İlk 30 popüler film
    const discover = await tmdb.get("/discover/movie", {
      params: {
        with_genres: genreId,
        sort_by: "popularity.desc",
        page: 1,
      },
    });

    const movies = discover.data.results.slice(0, 30);

    // En ağır datayı tek seferde getir
    const feed = await Promise.all(
      movies.map(async (movie) => {
        const movieId = movie.id;

        const full = await tmdb.get(`/movie/${movieId}`, {
          params: {
            append_to_response:
              "credits,videos,release_dates,watch/providers",
          },
        });

        const d = full.data;

        // 1️⃣ Cast
        const cast = (d.credits?.cast || [])
          .slice(0, 10)
          .map((p) => ({
            name: p.name,
            character: p.character,
            profile: p.profile_path
              ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
              : null,
          }));

        // 2️⃣ Yönetmen
        const director =
          d.credits?.crew?.find((c) => c.job === "Director")?.name || null;

        // 3️⃣ Certification (PG-13 vs)
        const certification =
          d.release_dates?.results
            ?.find((r) => r.iso_3166_1 === "US")
            ?.release_dates?.[0]?.certification || null;

        // 4️⃣ Video seçimi
        const videos = d.videos?.results || [];

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

        // Eğer video yoksa bu filmi feed'e alma
        if (!videoUrl) return null;

        // 5️⃣ Yayıncı platformlar
        const providers = d["watch/providers"]?.results?.US || {};

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
          ...mapProviders(providers.flatrate, "subscription"),
          ...mapProviders(providers.buy, "buy"),
          ...mapProviders(providers.rent, "rent"),
          ...mapProviders(providers.ads, "ads"),
        ];

        // 6️⃣ Production Companies
        const productionCompanies = (d.production_companies || []).map(
          (p) => ({
            name: p.name,
            logo: p.logo_path
              ? `https://image.tmdb.org/t/p/w500${p.logo_path}`
              : null,
          })
        );

        // 🔥 ESKİ FORMATIN %100 KOPYASI
        return {
          id: d.id,
          title: d.title,
          overview: d.overview,
          year: d.release_date?.split("-")[0] || "N/A",
          rating: d.vote_average,
          runtime: d.runtime,

          certification,
          director,
          genres: d.genres?.map((g) => g.name) || [],
          productionCompanies,

          cast,

          poster: d.poster_path
            ? `https://image.tmdb.org/t/p/w500${d.poster_path}`
            : null,
          backdrop: d.backdrop_path
            ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}`
            : null,

          platforms,
          platformLink: providers.link || null,

          videoUrl,
          videoSource,
        };
      })
    );

    const finalFeed = feed.filter(Boolean); // video olmayanları çıkar

    const result = {
      category,
      count: finalFeed.length,
      feed: finalFeed,
    };

    feedCache.set(cacheKey, result);

    return res.json({ ...result, cached: false });
  } catch (err) {
    console.error("FEED ERROR:", err.message);
    return res.status(500).json({ error: "Feed hata verdi knk" });
  }
});

export default router;
