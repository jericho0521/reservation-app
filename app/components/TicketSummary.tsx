"use client";

import styles from "./TicketSummary.module.css";
import type { Movie } from "../data";

const PRICE_PER_SEAT = 12;

interface TicketSummaryProps {
  movie: Movie | null;
  showtime: string | null;
  selectedSeats: string[];
  dateLabel: string;
}

export default function TicketSummary({
  movie,
  showtime,
  selectedSeats,
  dateLabel,
}: TicketSummaryProps) {
  const total = selectedSeats.length * PRICE_PER_SEAT;

  if (!movie || !showtime) {
    return (
      <aside className={styles.panel}>
        <p className={styles.emptyText}>Select a movie and showtime to begin</p>
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Ticket Summary</h3>
      </div>

      <div className={styles.details}>
        <p className={styles.movieTitle}>{movie.title}</p>
        <p className={styles.meta}>
          {dateLabel} · {showtime}
        </p>
      </div>

      {selectedSeats.length > 0 ? (
        <>
          <ul className={styles.seatList}>
            {selectedSeats.map((seat) => (
              <li key={seat} className={styles.seatRow}>
                <span className={styles.seatLabel}>Seat {seat}</span>
                <span className={styles.seatPrice}>${PRICE_PER_SEAT}</span>
              </li>
            ))}
          </ul>

          <div className={styles.divider} />

          <div className={styles.totalRow}>
            <span>Total</span>
            <span className={styles.totalPrice}>${total}</span>
          </div>

          <button className={styles.bookBtn}>
            Book {selectedSeats.length} {selectedSeats.length === 1 ? "seat" : "seats"}
          </button>
        </>
      ) : (
        <p className={styles.emptySeats}>Tap seats on the map to add them</p>
      )}
    </aside>
  );
}
