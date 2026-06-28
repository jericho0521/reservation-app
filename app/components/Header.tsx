"use client";

import styles from "./Header.module.css";

interface HeaderProps {
  selectedDate: number;
  onDateChange: (index: number) => void;
}

export default function Header({ selectedDate, onDateChange }: HeaderProps) {
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
      isToday: i === 0,
    };
  });

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo}>Tickets</span>
        <span className={styles.dot} />
      </div>
      <nav className={styles.nav}>
        <span className={styles.navLink}>Movies</span>
        <span className={styles.navLinkMuted}>Cinemas</span>
        <span className={styles.navLinkMuted}>Experiences</span>
      </nav>
      <div className={styles.dates}>
        {dates.map((d, i) => (
          <button
            key={i}
            className={`${styles.dateChip} ${i === selectedDate ? styles.active : ""}`}
            onClick={() => onDateChange(i)}
          >
            <span className={styles.dayName}>{d.isToday ? "Today" : d.day}</span>
            <span className={styles.dayNum}>{d.date}</span>
          </button>
        ))}
      </div>
    </header>
  );
}
