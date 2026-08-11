import Link from 'next/link';
import { Clock3, Instagram, Mail, MessageCircle, Phone } from 'lucide-react';
import { business } from '@/lib/business-content';

const mapEmbedUrl = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d31737.702276204226!2d101.5996466504807!3d3.073553994907396!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31cc4b0214d3a77b%3A0xd30100d50fe650b0!2s70%2C%20Jalan%20PJS%2011%2F7%2C%20Bandar%20Sunway%2C%2047500%20Subang%20Jaya%2C%20Selangor!5e0!3m2!1sen!2smy!4v1699279814492!5m2!1sen!2smy';

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-racing-dark py-12">
      <div className="container mx-auto px-5 sm:px-6">
        <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-6">
          <div>
            <Link href="/" className="font-heading text-xl font-bold uppercase italic tracking-tighter">
              PROJECT PLAY<span className="text-neon"> by CW</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">{business.description}</p>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">Explore</h2>
            <ul className="space-y-1 text-sm text-gray-400">
              <li><Link href="/#services" className="hover:text-neon">Services</Link></li>
              <li><Link href="/#pricing" className="hover:text-neon">Pricing</Link></li>
              <li><Link href="/about" className="hover:text-neon">About</Link></li>
              <li><Link href="/events" className="hover:text-neon">Events</Link></li>
              <li><Link href="/faq" className="hover:text-neon">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">Book & read</h2>
            <ul className="space-y-1 text-sm text-gray-400">
              <li><Link href="/form-booking" className="hover:text-neon">Form Booking</Link></li>
              <li><Link href="/chat-booking" className="hover:text-neon">AI Chat Booking</Link></li>
              <li><Link href="/blog" className="hover:text-neon">Blog</Link></li>
              <li><Link href="/updates" className="hover:text-neon">Updates</Link></li>
              <li><a href={business.careersUrl} target="_blank" rel="noopener noreferrer" className="hover:text-neon">Join our team</a></li>
            </ul>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">Contact & hours</h2>
            <ul className="space-y-1 text-sm text-gray-400">
              <li>
                <a href={business.phoneHref} className="gap-2 hover:text-neon">
                  <Phone aria-hidden="true" size={16} /> {business.phoneDisplay}
                </a>
              </li>
              <li>
                <a href={`mailto:${business.email}`} className="gap-2 hover:text-neon">
                  <Mail aria-hidden="true" size={16} /> {business.email}
                </a>
              </li>
            </ul>

            <div className="mt-5 flex gap-3">
              <a
                href={business.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Contact Project Play on WhatsApp"
                className="flex size-11 items-center justify-center rounded-full border border-white/15 text-gray-300 transition-all hover:border-neon hover:bg-neon hover:text-racing-dark"
              >
                <MessageCircle aria-hidden="true" size={20} />
              </a>
              <a
                href={business.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow Project Play on Instagram"
                className="flex size-11 items-center justify-center rounded-full border border-white/15 text-gray-300 transition-all hover:border-neon hover:bg-neon hover:text-racing-dark"
              >
                <Instagram aria-hidden="true" size={20} />
              </a>
            </div>

            <div className="mt-5 flex items-center gap-3 border border-neon/25 bg-neon/5 p-3">
              <Clock3 aria-hidden="true" className="shrink-0 text-neon" size={22} />
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">Open every day</p>
                <p className="mt-0.5 font-heading text-base text-white">{business.hours}</p>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">Find us</h2>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
              <iframe
                src={mapEmbedUrl}
                width="100%"
                height="190"
                className="block w-full"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Project Play By CW location"
                suppressHydrationWarning
              />
            </div>
            <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm text-sm leading-relaxed text-gray-400">{business.address}</p>
              <a
                href="https://maps.google.com/?q=3.0660998,101.6026114"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 font-heading text-sm uppercase tracking-wider text-neon hover:text-white"
              >
                Directions →
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-center text-sm text-gray-400 md:flex-row md:text-left">
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
