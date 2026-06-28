"use client";

import styles from "./MovieCard.module.css";
import type { Movie } from "../data";

interface MovieCardProps {
  movie: Movie;
  isSelected: boolean;
  selectedShowtime: string | null;
  onSelectShowtime: (movieId: string, showtime: string) => void;
}

export default function MovieCard({
  movie,
  isSelected,
  selectedShowtime,
  onSelectShowtime,
}: MovieCardProps) {
  return (
    <div className={`${styles.card} ${isSelected ? styles.selected : ""}`}>
      <div className={styles.posterWrap}>
        <img
          src={movie.posterUrl}
          alt={`${movie.title} poster`}
          className={styles.poster}
        />
        <div className={styles.posterOverlay} />
        <div className={styles.shimmer} />
        <div className={styles.ratingBadge}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent)">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span>{movie.rating}</span>
        </div>
      </div>
      <div className={styles.info}>
        <h2 className={styles.title}>{movie.title}</h2>
        <p className={styles.meta}>
          {movie.genre} · {movie.duration}
        </p>
        <div className={styles.showtimes}>
          {movie.showtimes.map((time) => (
            <button
              key={time}
              className={`${styles.timeChip} ${
                isSelected && selectedShowtime === time ? styles.activeTime : ""
              }`}
              onClick={() => onSelectShowtime(movie.id, time)}
            >
              {time}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
