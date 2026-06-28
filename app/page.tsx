"use client";

import React, { useState, useEffect } from "react";
import { 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  CheckCircle, 
  ArrowRight, 
  Info, 
  Terminal, 
  WarningCircle, 
  ArrowLeft,
  CalendarBlank,
  CookingPot,
  Sparkle
} from "@phosphor-icons/react";

// Types
interface DateOption {
  dayName: string;
  dayNum: number;
  monthName: string;
  fullDateStr: string;
}

interface Table {
  id: string;
  name: string;
  capacity: number;
  isOccupied: boolean;
}

interface Area {
  id: string;
  name: string;
  desc: string;
  capacityDesc: string;
  availability: "available" | "warning" | "danger";
  availabilityText: string;
  tables: Table[];
}

// Fixed mock data starting from current date Sunday, June 28, 2026
const MOCK_DATES: DateOption[] = [
  { dayName: "Sun", dayNum: 28, monthName: "Jun", fullDateStr: "2026-06-28" },
  { dayName: "Mon", dayNum: 29, monthName: "Jun", fullDateStr: "2026-06-29" },
  { dayName: "Tue", dayNum: 30, monthName: "Jun", fullDateStr: "2026-06-30" },
  { dayName: "Wed", dayNum: 1, monthName: "Jul", fullDateStr: "2026-07-01" },
  { dayName: "Thu", dayNum: 2, monthName: "Jul", fullDateStr: "2026-07-02" },
  { dayName: "Fri", dayNum: 3, monthName: "Jul", fullDateStr: "2026-07-03" },
  { dayName: "Sat", dayNum: 4, monthName: "Jul", fullDateStr: "2026-07-04" },
];

const MOCK_TIMES = [
  { time: "17:30", status: "available" },
  { time: "18:00", status: "available" },
  { time: "18:30", status: "warning" }, // Filling fast
  { time: "19:00", status: "available" },
  { time: "19:30", status: "available" },
  { time: "20:00", status: "danger" },    // Fully Booked
  { time: "20:30", status: "warning" }, // Filling fast
  { time: "21:00", status: "available" },
  { time: "21:30", status: "available" },
];

const MOCK_AREAS: Area[] = [
  {
    id: "dining",
    name: "Dining Room",
    desc: "Minimalist, quiet setting with soft acoustics & architectural concrete geometry.",
    capacityDesc: "1-6 Guests",
    availability: "available",
    availabilityText: "Available",
    tables: [
      { id: "T1", name: "Table 11", capacity: 2, isOccupied: false },
      { id: "T2", name: "Table 12", capacity: 2, isOccupied: true },
      { id: "T3", name: "Table 13", capacity: 4, isOccupied: false },
      { id: "T4", name: "Table 14", capacity: 4, isOccupied: false },
      { id: "T5", name: "Table 15", capacity: 6, isOccupied: true },
      { id: "T6", name: "Table 16", capacity: 6, isOccupied: false },
    ]
  },
  {
    id: "counter",
    name: "The Counter",
    desc: "Front-row high seats facing our open-fire hearth and kitchen brigade.",
    capacityDesc: "1-2 Guests",
    availability: "warning",
    availabilityText: "Filling Fast",
    tables: [
      { id: "C1", name: "Seat C1", capacity: 2, isOccupied: false },
      { id: "C2", name: "Seat C2", capacity: 2, isOccupied: false },
      { id: "C3", name: "Seat C3", capacity: 2, isOccupied: true },
      { id: "C4", name: "Seat C4", capacity: 2, isOccupied: false },
    ]
  },
  {
    id: "garden",
    name: "Garden Terrace",
    desc: "Heated, glass-shielded outdoor courtyard with local Swiss botany.",
    capacityDesc: "2-8 Guests",
    availability: "available",
    availabilityText: "Available",
    tables: [
      { id: "G1", name: "Table G1", capacity: 4, isOccupied: false },
      { id: "G2", name: "Table G2", capacity: 4, isOccupied: true },
      { id: "G3", name: "Table G3", capacity: 8, isOccupied: false },
    ]
  }
];

export default function BookingPage() {
  // Booking selections
  const [partySize, setPartySize] = useState<number>(2);
  const [selectedDate, setSelectedDate] = useState<string>("2026-06-28");
  const [selectedTime, setSelectedTime] = useState<string>("19:00");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("dining");
  const [selectedTableId, setSelectedTableId] = useState<string>("");

  // Guest details
  const [guestName, setGuestName] = useState<string>("");
  const [guestEmail, setGuestEmail] = useState<string>("");
  const [guestPhone, setGuestPhone] = useState<string>("");
  const [specialNotes, setSpecialNotes] = useState<string>("");

  // Workflow states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [confCode, setConfCode] = useState<string>("");

  // Auto-select first available table when area changes
  useEffect(() => {
    const area = MOCK_AREAS.find(a => a.id === selectedAreaId);
    const availableTable = area?.tables.find(t => !t.isOccupied);
    if (availableTable) {
      setSelectedTableId(availableTable.id);
    } else {
      setSelectedTableId("");
    }
  }, [selectedAreaId]);

  const activeArea = MOCK_AREAS.find(a => a.id === selectedAreaId) || MOCK_AREAS[0];
  const activeTable = activeArea.tables.find(t => t.id === selectedTableId);
  const activeDateOption = MOCK_DATES.find(d => d.fullDateStr === selectedDate) || MOCK_DATES[0];

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName || !guestEmail || !guestPhone) return;

    setIsLoading(true);
    
    // Simulate API delay
    setTimeout(() => {
      setIsLoading(false);
      const code = `KFT-${Math.floor(1000 + Math.random() * 9000)}-ZH`;
      setConfCode(code);
      setIsConfirmed(true);
    }, 1200);
  };

  const handleReset = () => {
    setPartySize(2);
    setSelectedDate("2026-06-28");
    setSelectedTime("19:00");
    setSelectedAreaId("dining");
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setSpecialNotes("");
    setIsConfirmed(false);
  };

  // Mock API payload representation for developers
  const mockPayload = {
    booking: {
      guests: partySize,
      date: selectedDate,
      time: selectedTime,
      area_id: selectedAreaId,
      table_preference_id: selectedTableId || null,
      guest: {
        name: guestName || "Placeholder Name",
        email: guestEmail || "Placeholder Email",
        phone: guestPhone || "Placeholder Phone",
        notes: specialNotes || null
      }
    },
    meta: {
      client: "@reservation-platform/sdk-node-v1.2",
      env_endpoint: process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL || "https://api.kraft.zuerich/v1"
    }
  };

  return (
    <main className="app-container">
      {/* Swiss Header Branding */}
      <header className="logo-strip">
        <div>
          <h1 className="brand-title">Kraft</h1>
          <p className="mono-text" style={{ fontSize: "11px" }}>RESTAURANT & HEARTH</p>
        </div>
        <div className="brand-desc">
          <p>ZÜRICH, CH</p>
          <p style={{ color: "#e31c1c" }}>● OPEN FOR DINNER</p>
        </div>
      </header>

      {/* Grid container */}
      <div className="swiss-grid-container">
        
        {/* Cell 1: Intro Hero */}
        <div className="grid-cell span-full" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="mono-label">
            <Sparkle size={14} weight="fill" /> Table & Seating Booking
          </p>
          <h2 className="display-title">Secure a Table</h2>
          <p className="subtitle">
            Experience culinary craftsmanship centered around wood-fire ovens. 
            Choose your preferred dining quarters and select exact tables in real-time.
          </p>
        </div>

        {isConfirmed ? (
          /* Confirmation Success View */
          <div className="grid-cell span-full" style={{ background: "rgba(227, 28, 28, 0.02)" }}>
            <div className="success-card">
              <CheckCircle size={64} weight="fill" className="success-icon" />
              <div>
                <p className="mono-label" style={{ justifyContent: "center", marginBottom: "8px" }}>
                  Reservation Confirmed
                </p>
                <h3 style={{ fontSize: "32px", fontWeight: 700, textTransform: "uppercase" }}>
                  We await you, {guestName.split(" ")[0]}
                </h3>
              </div>

              {/* Receipt inside success */}
              <div className="receipt" style={{ width: "100%", maxWidth: "480px", margin: "20px auto 0" }}>
                <div className="receipt-header">
                  <span className="receipt-logo">KRAFT / TICKET</span>
                  <span className="receipt-status">{confCode}</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Guests</span>
                  <span className="receipt-val">{partySize} Persons</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Date</span>
                  <span className="receipt-val">
                    {activeDateOption.dayName} {activeDateOption.dayNum} {activeDateOption.monthName} 2026
                  </span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Time</span>
                  <span className="receipt-val">{selectedTime}</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Location</span>
                  <span className="receipt-val">{activeArea.name}</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Preference</span>
                  <span className="receipt-val highlight">{activeTable ? activeTable.name : "Any Available"}</span>
                </div>
                <div className="receipt-divider" />
                <div className="receipt-row">
                  <span className="receipt-label">Contact</span>
                  <span className="receipt-val" style={{ textTransform: "none", fontWeight: 400 }}>
                    {guestPhone}
                  </span>
                </div>
              </div>

              <p className="subtitle" style={{ fontSize: "14px", maxWidth: "420px" }}>
                A confirmation text and calendar invite have been dispatched. 
                Please arrive within 10 minutes of your slot. For modifications, quote your ticket code.
              </p>

              <button className="button-link" onClick={handleReset}>
                Book Another Table
              </button>
            </div>
          </div>
        ) : (
          /* Booking Flow View */
          <>
            {/* Left Cell: Selections & Controls */}
            <div className="grid-cell" style={{ borderRight: "1px solid var(--border)" }}>
              
              {/* 1. Party Size */}
              <section>
                <div className="section-title">
                  <span>01</span> PARTY SIZE
                </div>
                <div className="selector-grid">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`selector-btn ${partySize === size ? "active" : ""}`}
                      onClick={() => setPartySize(size)}
                    >
                      {size}
                      <span style={{ fontSize: "9px", fontWeight: 400, opacity: 0.7 }}>
                        {size === 1 ? "GUEST" : "GUESTS"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* 2. Date Selector */}
              <section>
                <div className="section-title">
                  <span>02</span> DATE
                </div>
                <div className="date-selector-wrapper">
                  <div className="date-scroll">
                    {MOCK_DATES.map((d) => (
                      <button
                        key={d.fullDateStr}
                        type="button"
                        className={`date-pill ${selectedDate === d.fullDateStr ? "active" : ""}`}
                        onClick={() => setSelectedDate(d.fullDateStr)}
                      >
                        <span className="day-name">{d.dayName}</span>
                        <span className="day-num">{d.dayNum}</span>
                        <span className="day-month">{d.monthName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* 3. Time Slots */}
              <section>
                <div className="section-title">
                  <span>03</span> TIME
                </div>
                <div className="time-grid">
                  {MOCK_TIMES.map((t) => {
                    const isBooked = t.status === "danger";
                    return (
                      <button
                        key={t.time}
                        type="button"
                        disabled={isBooked}
                        className={`time-btn ${selectedTime === t.time ? "active" : ""}`}
                        onClick={() => setSelectedTime(t.time)}
                      >
                        <div>{t.time}</div>
                        <div style={{ fontSize: "8px", marginTop: "3px", textTransform: "uppercase" }}>
                          {isBooked ? "Booked" : t.status === "warning" ? "Few Left" : "Open"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 4. Dining Area Cards */}
              <section>
                <div className="section-title">
                  <span>04</span> AREA PREFERENCE
                </div>
                <div className="area-grid">
                  {MOCK_AREAS.map((area) => (
                    <div
                      key={area.id}
                      className={`area-card ${selectedAreaId === area.id ? "active" : ""}`}
                      onClick={() => setSelectedAreaId(area.id)}
                    >
                      <div className="area-name">{area.name}</div>
                      <p className="mono-text" style={{ fontSize: "11px", lineHeight: "1.4", minHeight: "44px" }}>
                        {area.desc}
                      </p>
                      <div className="area-meta">
                        <span>{area.capacityDesc}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span className={`availability-dot ${area.availability}`} />
                          {area.availabilityText}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 5. Seating Table Layout Chart */}
              <section>
                <div className="section-title">
                  <span>05</span> TABLE SELECTION
                </div>
                <p className="mono-text" style={{ marginBottom: "12px" }}>
                  Interactive seat layout map. Please select a physical table:
                </p>
                
                <div className="seating-layout">
                  <div className="seating-grid" style={{ gridTemplateColumns: selectedAreaId === "garden" ? "repeat(3, 1fr)" : "repeat(4, 1fr)" }}>
                    {activeArea.tables.map((table) => {
                      const isSelected = selectedTableId === table.id;
                      return (
                        <button
                          key={table.id}
                          type="button"
                          disabled={table.isOccupied}
                          className={`table-seat ${isSelected ? "selected" : ""} ${table.isOccupied ? "occupied" : ""}`}
                          onClick={() => setSelectedTableId(table.id)}
                        >
                          <span className="table-num">{table.name}</span>
                          <span className="table-cap">{table.capacity} Pax</span>
                          <span style={{ fontSize: "8px", textTransform: "uppercase", marginTop: "2px" }}>
                            {table.isOccupied ? "Occupied" : isSelected ? "Selected" : "Available"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

            </div>

            {/* Right Cell: Summary Sidebar & Contact Info */}
            <div className="grid-cell">
              <form onSubmit={handleBookingSubmit} className="summary-container">
                <div className="section-title">
                  <span>06</span> BOOKING SUMMARY
                </div>

                {/* Minimalist image preview */}
                <div className="showcase-image-container">
                  <img 
                    src="/restaurant_interior.png" 
                    alt="Kraft Restaurant Zürich Interior" 
                    className="showcase-image"
                  />
                  <div className="showcase-overlay">
                    <MapPin size={10} style={{ display: "inline", marginRight: "4px" }} /> Zürich / Brandschenkestrasse
                  </div>
                </div>

                {/* Receipt-style block */}
                <div className="receipt">
                  <div className="receipt-header">
                    <span className="receipt-logo">KRAFT / RESERVATION</span>
                    <span className="receipt-status" style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", padding: "2px 6px" }}>
                      DRAFT
                    </span>
                  </div>

                  <div className="receipt-row">
                    <span className="receipt-label">Guests</span>
                    <span className="receipt-val">{partySize} {partySize === 1 ? "Person" : "Persons"}</span>
                  </div>

                  <div className="receipt-row">
                    <span className="receipt-label">Date</span>
                    <span className="receipt-val">
                      {activeDateOption.dayName} {activeDateOption.dayNum} {activeDateOption.monthName} 2026
                    </span>
                  </div>

                  <div className="receipt-row">
                    <span className="receipt-label">Arrival Time</span>
                    <span className="receipt-val">{selectedTime}</span>
                  </div>

                  <div className="receipt-row">
                    <span className="receipt-label">Dining Quarters</span>
                    <span className="receipt-val">{activeArea.name}</span>
                  </div>

                  <div className="receipt-row">
                    <span className="receipt-label">Table Preference</span>
                    <span className="receipt-val highlight">
                      {activeTable ? activeTable.name : "Any Available"}
                    </span>
                  </div>

                  <div className="receipt-divider" />
                  
                  <div className="receipt-row">
                    <span className="receipt-label">Deposit Required</span>
                    <span className="receipt-val" style={{ color: "#34c759" }}>CHF 0.00 (NONE)</span>
                  </div>
                </div>

                {/* Guest Contact Details Fields */}
                <div className="input-group">
                  <label className="input-label">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Beat Müller"
                    className="text-input"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="beat.mueller@domain.ch"
                    className="text-input"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Phone Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="+41 79 123 45 67"
                    className="text-input"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                  />
                </div>

                <div className="input-group" style={{ marginBottom: "32px" }}>
                  <label className="input-label">Special requests / dietary notes</label>
                  <input
                    type="text"
                    placeholder="e.g., Celiac disease, gluten allergy"
                    className="text-input"
                    value={specialNotes}
                    onChange={(e) => setSpecialNotes(e.target.value)}
                  />
                </div>

                {/* Action CTA */}
                <button
                  type="submit"
                  disabled={isLoading || !guestName || !guestEmail || !guestPhone}
                  className="btn-primary"
                >
                  {isLoading ? (
                    "Processing Booking..."
                  ) : (
                    <>
                      Confirm Table Reservation <ArrowRight size={18} weight="bold" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Developer API boundary box (as per README requirements) */}
      <div className="debug-box">
        <div className="debug-title">
          <Terminal size={14} /> SDK Boundary: Future Integration
        </div>
        <p style={{ color: "var(--text-muted)", marginBottom: "8px", lineHeight: "1.4" }}>
          This component behaves as a frontend-only boundary. In production, this module will dispatch the payload below using the <code>@reservation-platform/sdk</code> target or direct <code>POST /v1/bookings</code>.
        </p>
        <div style={{ marginBottom: "8px" }}>
          <span style={{ color: "var(--text-muted)" }}>Target Endpoint: </span>
          <span className="debug-code">{mockPayload.meta.env_endpoint}/bookings</span>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Payload preview:</span>
          <pre style={{ 
            marginTop: "6px", 
            padding: "10px", 
            background: "rgba(0,0,0,0.5)", 
            overflowX: "auto",
            color: "#a9ffb4",
            fontSize: "10px",
            lineHeight: "1.3"
          }}>
            {JSON.stringify(mockPayload, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}