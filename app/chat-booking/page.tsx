import ChatInterface from '@/components/chat/ChatInterface';
import Header from '@/components/shared/Header';
import Footer from '@/components/shared/Footer';

export default function ChatBookingPage() {
    return (
        <>
            <Header />
            <main className="min-h-screen bg-racing-dark text-white pt-20">
                <div className="container mx-auto px-6">
                    <ChatInterface />
                </div>
            </main>
        </>
    );
}
