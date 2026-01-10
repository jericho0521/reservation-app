import MultiStepForm from '@/components/form/MultiStepForm';
import Header from '@/components/shared/Header';
import Footer from '@/components/shared/Footer';

export default function FormBookingPage() {
    return (
        <>
            <Header />
            <main className="min-h-screen bg-racing-dark text-white pt-24 pb-12">
                <div className="container mx-auto px-6">
                    <div className="text-center mb-12">
                        <h1 className="text-4xl md:text-5xl font-bold font-heading italic uppercase tracking-tighter mb-4">
                            Book Your <span className="text-neon">Session</span>
                        </h1>
                        <p className="text-gray-400 max-w-xl mx-auto">
                            Choose your service, pick a time slot, and reserve your seats.
                        </p>
                    </div>
                    <MultiStepForm />
                </div>
            </main>
            <Footer />
        </>
    );
}
