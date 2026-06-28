export interface Movie {
  id: string;
  title: string;
  genre: string;
  duration: string;
  rating: number;
  showtimes: string[];
  posterUrl: string;
}

export const movies: Movie[] = [
  {
    id: "last-signal",
    title: "The Last Signal",
    genre: "Sci-Fi",
    duration: "2h 14m",
    rating: 8.4,
    showtimes: ["2:30 PM", "5:00 PM", "8:15 PM"],
    posterUrl: "/images/last-signal.png",
  },
  {
    id: "still-water",
    title: "Still Water",
    genre: "Drama",
    duration: "1h 52m",
    rating: 7.9,
    showtimes: ["3:00 PM", "6:30 PM", "9:00 PM"],
    posterUrl: "/images/still-water.png",
  },
  {
    id: "ember",
    title: "Ember",
    genre: "Thriller",
    duration: "2h 01m",
    rating: 8.1,
    showtimes: ["1:45 PM", "4:30 PM", "7:45 PM", "10:15 PM"],
    posterUrl: "/images/ember.png",
  },
];
