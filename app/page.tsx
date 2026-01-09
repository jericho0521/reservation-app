import Header from '@/components/shared/Header';
import Footer from '@/components/shared/Footer';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import Pricing from '@/components/landing/Pricing';
import CTABanner from '@/components/landing/CTABanner';

export default function Home() {
    return (
        <>
            <Header />
            <main className="min-h-screen bg-racing-dark text-white selection:bg-neon selection:text-racing-dark">
                <Hero />
                <Features />
                <Pricing />
                <CTABanner />
            </main>
            <Footer />
        </>
    );
}
