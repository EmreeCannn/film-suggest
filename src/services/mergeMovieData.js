import { getMovieDetails, getMovieCast, getMovieVideos } from "./tmdb.js";

export async function enrichTrailerWithMovieData(trailer) {
  try {
    const tmdbId = trailer?.resource?.tmdb_id;
    if (!tmdbId) return null;

    const [details, cast, videos] = await Promise.all([
      getMovieDetails(tmdbId),
      getMovieCast(tmdbId, 5),
      getMovieVideos(tmdbId),
    ]);

    // TMDB MP4 video linki (REKLAMSIZ OLAN)
    const tmdbVideo = videos?.find((v) => v.site === "TMDB");

    return {
      id: tmdbId,
      title: details.title,
      overview: details.overview,
      releaseYear: details.release_date?.split("-")[0],
      rating: details.vote_average,
      runtime: details.runtime,
      genres: (details.genres || []).map((g) => g.name),
      cast,

      poster: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : null,
      backdrop: details.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
        : null,

      // 🔥 En önemli kısım: REKLAMSIZ video
      videoUrl: tmdbVideo?.url || null,

      youtubeId: trailer.youtube_video_id, // fallback
      youtubeThumbnail: trailer.youtube_thumbnail,
      kinoThumbnail: trailer.thumbnail,
      kinoUrl: trailer.url,
    };
  } catch (err) {
    console.error("Merge error:", err);
    return null;
  }
}
