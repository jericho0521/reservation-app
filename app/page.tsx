"use client";

import { useState, useMemo, useRef } from "react";
import { movies } from "./data";
import Header from "./components/Header";
import HeroBanner from "./components/HeroBanner";
import MovieCard from "./components/MovieCard";
import SeatMap from "./components/SeatMap";
import TicketSummary from "./components/TicketSummary";

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(0);
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const [selectedShowtime, setSelectedShowtime] = useState<string | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const bookingRef = useRef<HTMLDivElement>(null);

  const selectedMovie = useMemo(
    () => movies.find((m) => m.id === selectedMovieId) ?? null,
    [selectedMovieId]
  );

  // Hero always shows the selected movie, or the first movie by default
  const heroMovie = selectedMovie ?? movies[0];

  const dateLabel = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + selectedDate);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, [selectedDate]);

  function handleSelectShowtime(movieId: string, showtime: string) {
    if (movieId === selectedMovieId && showtime === selectedShowtime) return;
    setSelectedMovieId(movieId);
    setSelectedShowtime(showtime);
    setSelectedSeats([]);
    // Scroll to booking section
    setTimeout(() => {
      bookingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function handleToggleSeat(seatId: string) {
    setSelectedSeats((prev) =>
      prev.includes(seatId)
        ? prev.filter((s) => s !== seatId)
        : [...prev, seatId]
    );
  }

  function handleDateChange(index: number) {
    setSelectedDate(index);
    setSelectedSeats([]);
  }

  function handleGetTickets() {
    // Scroll to the movie list / showtime selection
    const movieSection = document.getElementById("movies-section");
    movieSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="shell">
      <Header selectedDate={selectedDate} onDateChange={handleDateChange} />

      <HeroBanner movie={heroMovie} onGetTickets={handleGetTickets} />

      <div id="movies-section">
        <div className="sectionHeader">
          <span className="sectionTab">Now Showing</span>
          <span className="sectionTabInactive">Coming Soon</span>
        </div>
        <div className="movieList">
          {movies.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              isSelected={movie.id === selectedMovieId}
              selectedShowtime={
                movie.id === selectedMovieId ? selectedShowtime : null
              }
              onSelectShowtime={handleSelectShowtime}
            />
          ))}
        </div>
      </div>

      <div ref={bookingRef}>
        <p className="sectionLabel">Choose Your Seats</p>
        <div className="bookingSection">
          <SeatMap
            movieId={selectedMovieId}
            showtime={selectedShowtime}
            selectedSeats={selectedSeats}
            onToggleSeat={handleToggleSeat}
          />
          <TicketSummary
            movie={selectedMovie}
            showtime={selectedShowtime}
            selectedSeats={selectedSeats}
            dateLabel={dateLabel}
          />
        </div>
      </div>
    </main>
  );
}