"use client";

import styles from "./HeroBanner.module.css";
import type { Movie } from "../data";

interface HeroBannerProps {
  movie: Movie;
  onGetTickets: () => void;
}

export default function HeroBanner({ movie, onGetTickets }: HeroBannerProps) {
  return (
    <section className={styles.hero}>
      {/* Blurred background poster */}
      <div className={styles.backdrop}>
        <img src={movie.posterUrl} alt="" className={styles.backdropImg} />
        <div className={styles.backdropOverlay} />
      </div>

      <div className={styles.content}>
        <div className={styles.posterCard}>
          <img src={movie.posterUrl} alt={`${movie.title} poster`} className={styles.poster} />
        </div>
        <div className={styles.info}>
          <div className={styles.badges}>
            <span className={styles.badge}>{movie.genre}</span>
            <span className={styles.badge}>{movie.duration}</span>
            <span className={styles.ratingBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {movie.rating}
            </span>
          </div>
          <h1 className={styles.title}>{movie.title}</h1>
          <p className={styles.synopsis}>
            Experience this film on the big screen. Select a showtime below to book your seats.
          </p>
          <button className={styles.cta} onClick={onGetTickets}>
            Get Tickets
          </button>
        </div>
      </div>
    </section>
  );
}
