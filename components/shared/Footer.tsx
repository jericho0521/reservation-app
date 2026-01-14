import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="bg-racing-dark border-t border-white/10 py-12">
            <div className="container mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-8">
                    {/* Brand */}
                    <div className="lg:col-span-1">
                        <Link href="/" className="text-xl font-bold font-heading tracking-tighter uppercase italic">
                            PROJECT PLAY<span className="text-neon"> by CW</span>
                        </Link>
                        <p className="text-gray-400 text-sm mt-3">
                            Bandar Sunway&apos;s premier sim racing and gaming hub.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h4 className="text-sm font-semibold uppercase tracking-wider mb-4">Quick Links</h4>
                        <ul className="space-y-2 text-sm text-gray-400">
                            <li><Link href="/form-booking" className="hover:text-neon transition-colors">Book Now</Link></li>
                            <li><Link href="/chat-booking" className="hover:text-neon transition-colors">AI Chat Booking</Link></li>
                            <li><Link href="/#services" className="hover:text-neon transition-colors">Services</Link></li>
                        </ul>
                    </div>

                    {/* Hours */}
                    <div>
                        <h4 className="text-sm font-semibold uppercase tracking-wider mb-4">Hours</h4>
                        <ul className="space-y-2 text-sm text-gray-400">
                            <li>Daily: 12:00 PM - 2:00 AM</li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="text-sm font-semibold uppercase tracking-wider mb-4">Contact</h4>
                        <ul className="space-y-2 text-sm text-gray-400">
                            <li>
                                <a href="tel:+60111628152" className="hover:text-neon transition-colors">
                                    +60 11-1628 1524
                                </a>
                            </li>
                            <li>
                                <a href="https://instagram.com/projectplaybycw" target="_blank" rel="noopener noreferrer" className="hover:text-neon transition-colors">
                                    @projectplaybycw
                                </a>
                            </li>
                            <li>Bandar Sunway, Subang Jaya</li>
                        </ul>
                    </div>

                    {/* Map */}
                    <div className="md:col-span-2 lg:col-span-1">
                        <h4 className="text-sm font-semibold uppercase tracking-wider mb-4">Location</h4>
                        <div className="rounded-lg overflow-hidden border border-white/10">
                            <iframe
                                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3984.0!2d101.6026114!3d3.0660998!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31cc4d50f390a0ad%3A0x3a6370b811df68b!2sProject%20Play%20By%20CW!5e0!3m2!1sen!2smy!4v1234567890"
                                width="100%"
                                height="150"
                                style={{ border: 0 }}
                                allowFullScreen
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                title="Project Play by CW Location"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-sm text-gray-400">
                        © {new Date().getFullYear()} Project Play by CW. All rights reserved.
                    </div>
                    <div className="flex gap-6">
                        <a
                            href="https://instagram.com/projectplaybycw"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-neon transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                            </svg>
                        </a>
                        <a
                            href="https://ppbycw.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-neon transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
