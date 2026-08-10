import Link from 'next/link';
import { business } from '@/lib/business-content';

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-racing-dark py-12">
      <div className="container mx-auto px-6">
        <div className="mb-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <Link href="/" className="font-heading text-xl font-bold uppercase italic tracking-tighter">
              PROJECT PLAY<span className="text-neon"> by CW</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">{business.description}</p>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">Explore</h2>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/#services" className="hover:text-neon">Services</Link></li>
              <li><Link href="/#pricing" className="hover:text-neon">Pricing</Link></li>
              <li><Link href="/about" className="hover:text-neon">About</Link></li>
              <li><Link href="/events" className="hover:text-neon">Events</Link></li>
              <li><Link href="/faq" className="hover:text-neon">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">Book & read</h2>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/form-booking" className="hover:text-neon">Form Booking</Link></li>
              <li><Link href="/chat-booking" className="hover:text-neon">AI Chat Booking</Link></li>
              <li><Link href="/blog" className="hover:text-neon">Blog</Link></li>
              <li><Link href="/updates" className="hover:text-neon">Updates</Link></li>
              <li><a href={business.careersUrl} target="_blank" rel="noopener noreferrer" className="hover:text-neon">Join our team</a></li>
            </ul>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">Contact</h2>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href={business.phoneHref} className="hover:text-neon">{business.phoneDisplay}</a></li>
              <li><a href={`mailto:${business.email}`} className="hover:text-neon">{business.email}</a></li>
              <li><a href={business.whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-neon">WhatsApp</a></li>
              <li><a href={business.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-neon">{business.instagramHandle}</a></li>
              <li>{business.hoursDays}: {business.hours}</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">Location</h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-400">{business.address}</p>
            <a
              href="https://maps.google.com/?q=3.0660998,101.6026114"
              target="_blank"
              rel="noopener noreferrer"
              className="font-heading text-sm uppercase tracking-wider text-neon hover:text-white"
            >
              Open in Maps →
            </a>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-gray-400 md:flex-row">
          <p>© {new Date().getFullYear()} {business.name}. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-neon">Privacy</Link>
            <Link href="/terms" className="hover:text-neon">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
