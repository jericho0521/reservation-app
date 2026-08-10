export const business = {
  name: 'Project Play By CW',
  tagline: 'Where gamers belong, play today',
  description:
    "Bandar Sunway's gaming destination for racing simulators, high-performance PC gaming, and PlayStation 5.",
  founded: 2024,
  phoneDisplay: '+60 11-1628 1524',
  phoneHref: 'tel:+601116281524',
  whatsappUrl: 'https://wa.me/601116281524',
  email: 'ppbycw@gmail.com',
  instagramHandle: '@projectplaybycw',
  instagramUrl: 'https://www.instagram.com/projectplaybycw/',
  website: 'https://ppbycw.com',
  address: '70, Jalan PJS 11/7, Bandar Sunway, 47500 Subang Jaya, Selangor',
  hours: '12:00 PM – 2:00 AM',
  hoursDays: 'Monday – Sunday',
  careersUrl:
    'https://docs.google.com/forms/d/e/1FAIpQLSeWnzarY6xwSnDLG53cP9TNWO-lzu8nsY9-5AFEE510WmfvmQ/viewform',
} as const;

export const services = [
  {
    title: 'Racing Simulator',
    description: 'Race with a PlayStation 5, Logitech G29 wheel and pedals, and a dedicated racing seat.',
    details: ['PlayStation 5', 'Logitech G29', 'F1 and Gran Turismo 7'],
    image: '/images/services/racing-simulator.png',
    bookableOnline: true,
  },
  {
    title: 'PC Gaming',
    description: 'High-performance gaming PCs for competitive and casual play.',
    details: ['AMD Ryzen 5 5500', 'MSI GeForce RTX 3070', '16GB DDR4 3200MHz', '27-inch 165Hz display'],
    image: '/images/services/pc-gaming.png',
    bookableOnline: false,
  },
  {
    title: 'PlayStation 5',
    description: 'Play popular multiplayer and fighting games with friends.',
    details: ['FC 25', 'UFC 5', 'Overcooked', 'NBA 2K24', 'Tekken 8'],
    image: '/images/services/playstation-5.png',
    bookableOnline: true,
  },
] as const;

export const events = [
  {
    slug: 'monash-cup-2025',
    title: 'Monash Cup 2025',
    description:
      'Monash University hosted Monash Cup 2025 at Project Play, with teams competing in Valorant and Counter-Strike 2.',
    images: [
      '/images/events/monash-cup-2025/m25_2_optimized.png',
      '/images/events/monash-cup-2025/m25_3_optimized.png',
      '/images/events/monash-cup-2025/m25_4_optimized.png',
      '/images/events/monash-cup-2025/m25_5_optimized.png',
    ],
  },
  {
    slug: 'terminull-brigade-2025',
    title: 'Terminull Brigade Event 2025',
    description:
      'Project Play hosted a time-run event where players from Sunway University and Monash University competed to set the best time.',
    images: [1, 2, 3, 4, 5].map(
      (number) => `/images/events/terminull-brigade-2025/terminull_${number}.png`,
    ),
  },
  {
    slug: 'monash-cup-2024',
    title: 'Monash Cup 2024',
    description:
      'A three-day Monash University tournament featuring Counter-Strike 2, Valorant, and League of Legends.',
    images: [
      '/images/events/monash-cup-2024/mc1.png',
      ...[2, 3, 4, 5, 6].map((number) => `/images/events/monash-cup-2024/monash_${number}.png`),
    ],
  },
] as const;

export const faqs = [
  {
    question: 'What racing simulator equipment do you have?',
    answer: 'Our racing setup uses a PlayStation 5, Logitech G29 racing wheel and pedals, and a dedicated racing seat.',
  },
  {
    question: 'Where is Project Play By CW located?',
    answer: `We are at ${business.address}. BRT and LRT stations are nearby.`,
  },
  {
    question: 'What gaming services do you offer?',
    answer: 'We offer Racing Simulator, high-performance PC Gaming, and PlayStation 5 sessions.',
  },
  {
    question: 'What are your operating hours?',
    answer: `We are open every day from ${business.hours}. Booking ahead is recommended during weekends and peak hours.`,
  },
  {
    question: 'Do you offer membership benefits?',
    answer: 'Yes. Members receive lower hourly rates, exclusive packages, reload bonuses, and birthday benefits. Registration is RM100.',
  },
  {
    question: 'What PS5 games are available?',
    answer: 'Our games include FC 25, UFC 5, Overcooked, NBA 2K24, and Tekken 8.',
  },
  {
    question: 'Can I host events at Project Play?',
    answer: 'Yes. We welcome tournaments, birthdays, corporate events, and group bookings. Contact our team on WhatsApp to plan your event.',
  },
  {
    question: 'What are your PC specifications?',
    answer: 'Our PCs use an AMD Ryzen 5 5500, MSI GeForce RTX 3070, 16GB DDR4 3200MHz RAM, and a 27-inch 165Hz monitor.',
  },
  {
    question: 'Which services can I reserve online?',
    answer: 'Online reservations are available for Racing Simulator and PlayStation 5 sessions. Contact us about PC Gaming or group bookings.',
  },
] as const;
