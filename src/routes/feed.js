import express from "express";
import { tmdb } from "../services/tmdb.js";
import { optionalAuthMiddleware } from "./auth.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Apply middleware to all routes in this router
router.use(optionalAuthMiddleware);

/* ---------------------------------------------
   GUEST ID HELPER (Cookie-based)
--------------------------------------------- */
function getOrCreateGuestId(req, res) {
  let guestId = req.cookies?.fs_guest_id;

  if (!guestId || typeof guestId !== 'string' || guestId.trim() === '') {
    guestId = uuidv4();
    res.cookie("fs_guest_id", guestId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    });
  }

  return guestId;
}

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
    const user = req.user; // Populated by optionalAuthMiddleware
    const category = (req.query.category || "action").toLowerCase();
    const genreId = GENRE_MAP[category] || 28;

    // Her istekte farklı filmler için kullanıcıya özel seed + zaman bazlı varyasyon
    let userSeed = 1;
    let userId = null;
    let guestId = null;
    
    if (user) {
      // Logged in user - User ID'den deterministik seed
      userId = user.id;
      userSeed = parseInt(user.id.slice(-8), 16) % 1000 || 1;
    } else {
      // Guest user - Cookie-based guest ID
      guestId = getOrCreateGuestId(req, res);
      const guestHash = guestId.split('-').reduce((acc, part) => {
        return acc + parseInt(part.slice(0, 4), 16) || 0;
      }, 0);
      userSeed = guestHash % 1000 || 1;
    }
    
    // Her istekte farklı filmler için: seed + zaman bazlı varyasyon + random element
    // Bu sayede aynı kullanıcı bile farklı zamanlarda farklı filmler görür
    const now = new Date();
    const hourVariation = now.getHours(); // 0-23
    const minuteVariation = now.getMinutes(); // 0-59
    const secondVariation = Math.floor(now.getSeconds() / 5); // 0-11 (5 saniyelik bloklar)
    const randomOffset = Math.floor(Math.random() * 100); // 0-99 random element
    
    // Her istekte farklı sayfa için güçlü varyasyon
    const timeSeed = (userSeed + hourVariation * 100 + minuteVariation * 2 + secondVariation + randomOffset) % 1000;
    
    // Kullanıcıya özel sayfa numarası (her kullanıcı farklı yerden başlasın)
    // Her istekte farklı sayfa için daha geniş aralık
    const userSpecificPage = Math.floor(timeSeed / 20) + 1; // 1-50 arası sayfa

    // Kullanıcıya özel filmler getir
    const discover = await tmdb.get("/discover/movie", {
      params: {
        with_genres: genreId,
        sort_by: "popularity.desc",
        page: userSpecificPage,
      },
    });

    let movies = discover.data.results || [];

    // Filter basic requirements
    movies = movies.filter(
      (m) =>
        m.poster_path &&
        m.backdrop_path &&
        m.overview?.length > 10
    );

    // Eğer yeterli film yoksa, daha fazla sayfa çek
    let attempts = 0;
    while (movies.length < 30 && attempts < 5) {
      attempts++;
      const nextPage = userSpecificPage + attempts;
      try {
        const nextResponse = await tmdb.get("/discover/movie", {
          params: {
            with_genres: genreId,
            sort_by: "popularity.desc",
            page: nextPage,
          },
        });
        
        const nextMovies = (nextResponse.data.results || []).filter(
          (m) =>
            m.poster_path &&
            m.backdrop_path &&
            m.overview?.length > 10
        );
        movies = [...movies, ...nextMovies];
      } catch (err) {
        console.error("Error fetching additional page:", err);
        break;
      }
    }

    // Kullanıcıya özel shuffle (her istekte farklı sıralama için güçlü varyasyon)
    let shuffleSeed = 1;
    if (userId) {
      shuffleSeed = parseInt(userId.slice(-6), 16) + hourVariation * 100 + minuteVariation + secondVariation;
    } else if (guestId) {
      // UUID'den hash oluştur
      const guestHash = guestId.split('-').reduce((acc, part) => {
        return acc + (parseInt(part.slice(0, 4), 16) || 0);
      }, 0);
      shuffleSeed = (guestHash % 10000) + hourVariation * 100 + minuteVariation + secondVariation;
    }
    
    const seededRandom = (seed) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    
    // Her istekte farklı shuffle için random offset ekle
    const shuffleOffset = randomOffset * 1000;
    movies = movies.sort((a, b) => {
      const randA = seededRandom(shuffleSeed + a.id + shuffleOffset + secondVariation);
      const randB = seededRandom(shuffleSeed + b.id + shuffleOffset + secondVariation);
      return randA - randB;
    });

    // İlk 30 filmi al
    movies = movies.slice(0, 30);

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

    return res.json(result);
  } catch (err) {
    console.error("FEED ERROR:", err.message);
    return res.status(500).json({ error: "Feed hata verdi knk" });
  }
});

export default router;
