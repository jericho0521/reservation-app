import Header from '@/components/shared/Header';
import Footer from '@/components/shared/Footer';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import Pricing from '@/components/landing/Pricing';
import AboutCommunity from '@/components/landing/AboutCommunity';
import CTABanner from '@/components/landing/CTABanner';
import FloatingChat from '@/components/chat/FloatingChat';

export default function Home() {
    return (
        <>
            <Header />
            <main className="min-h-screen bg-racing-dark text-white selection:bg-neon selection:text-racing-dark">
                <Hero />
                <Features />
                <Pricing />
                <AboutCommunity />
                <CTABanner />
            </main>
            <Footer />
            <FloatingChat />
        </>
    );
}
