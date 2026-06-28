"use client";

import { useMemo } from "react";
import styles from "./SeatMap.module.css";

const ROWS = 8;
const COLS = 10;
const ROW_LABELS = "ABCDEFGH".split("");
const AISLE_AFTER_COL = 5; // gap after column 5

interface SeatMapProps {
  movieId: string | null;
  showtime: string | null;
  selectedSeats: string[];
  onToggleSeat: (seatId: string) => void;
}

/** Deterministic pseudo-random occupied seats based on movieId + showtime */
function getOccupiedSeats(movieId: string, showtime: string): Set<string> {
  let hash = 0;
  const seed = `${movieId}-${showtime}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const occupied = new Set<string>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      hash = ((hash << 5) - hash + r * COLS + c) | 0;
      if (Math.abs(hash % 100) < 18) {
        occupied.add(`${ROW_LABELS[r]}${c + 1}`);
      }
    }
  }
  return occupied;
}

export default function SeatMap({
  movieId,
  showtime,
  selectedSeats,
  onToggleSeat,
}: SeatMapProps) {
  const occupied = useMemo(
    () =>
      movieId && showtime
        ? getOccupiedSeats(movieId, showtime)
        : new Set<string>(),
    [movieId, showtime]
  );

  if (!movieId || !showtime) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyInner}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M2 8h20" />
              <circle cx="8" cy="14" r="1" />
              <circle cx="12" cy="14" r="1" />
              <circle cx="16" cy="14" r="1" />
            </svg>
          </div>
          <p>Select a movie and showtime to view available seats</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Screen with animated glow */}
      <div className={styles.screenWrap}>
        <div className={styles.screenGlow} />
        <div className={styles.screen} />
        <span className={styles.screenLabel}>Screen</span>
      </div>

      {/* 3D perspective seat grid */}
      <div className={styles.perspective}>
        <div className={styles.grid}>
          {/* Column numbers header */}
          <div className={styles.rowLabelSpacer} />
          {Array.from({ length: COLS }, (_, c) => (
            <>
              <span key={`col-${c}`} className={styles.colLabel}>
                {c + 1}
              </span>
              {c + 1 === AISLE_AFTER_COL && <div key="aisle-header" className={styles.aisle} />}
            </>
          ))}

          {/* Seat rows */}
          {ROW_LABELS.map((row) => (
            <>
              <span key={`row-${row}`} className={styles.rowLabel}>
                {row}
              </span>
              {Array.from({ length: COLS }, (_, c) => {
                const seatId = `${row}${c + 1}`;
                const isOccupied = occupied.has(seatId);
                const isSelected = selectedSeats.includes(seatId);
                let seatClass = styles.seat;
                if (isOccupied) seatClass += " " + styles.occupied;
                else if (isSelected) seatClass += " " + styles.selected;

                return (
                  <>
                    <button
                      key={seatId}
                      className={seatClass}
                      disabled={isOccupied}
                      onClick={() => onToggleSeat(seatId)}
                      aria-label={`Seat ${seatId}${isOccupied ? " occupied" : isSelected ? " selected" : " available"}`}
                      title={seatId}
                    />
                    {c + 1 === AISLE_AFTER_COL && <div key={`aisle-${row}`} className={styles.aisle} />}
                  </>
                );
              })}
            </>
          ))}
        </div>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendAvailable}`} />
          Available
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendSelected}`} />
          Selected
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendOccupied}`} />
          Occupied
        </div>
      </div>
    </div>
  );
}
